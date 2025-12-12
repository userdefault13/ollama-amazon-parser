/**
 * Main parser logic using Ollama
 */

import { Ollama } from 'ollama'
import { createParsePrompt, validateProductData } from './schema.js'
import { fetchAmazonPage, extractAsin } from './amazon-fetcher.js'

/**
 * Initialize Ollama client with longer timeout
 */
export function createOllamaClient(host) {
  // Ollama client with default settings
  // The timeout is handled by the underlying HTTP client
  // If timeout errors occur, they're handled in the catch block
  return new Ollama({ host })
}

/**
 * Extract clean text from specific Amazon product page sections
 */
function extractProductText(html) {
  const extracted = {}
  
  // 1. Extract product title
  const titleMatch = html.match(/<[^>]*id=["']productTitle["'][^>]*>([^<]+)</i) ||
                    html.match(/<h1[^>]*id=["']title["'][^>]*>([^<]+)</i)
  if (titleMatch) {
    extracted.title = titleMatch[1].trim()
  }
  
  // 2. Extract feature bullets (description) - find ul, loop through li, extract span text
  const featureBulletsDiv = html.match(/<div[^>]*id=["']featurebullets_feature_div["'][^>]*>([\s\S]*?)<\/div>/i)
  if (featureBulletsDiv) {
    const ulMatch = featureBulletsDiv[1].match(/<ul[^>]*>([\s\S]*?)<\/ul>/i)
    if (ulMatch) {
      const liMatches = [...ulMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      extracted.description = liMatches
        .map(li => {
          // Extract text from span inside li
          const spanMatch = li[1].match(/<span[^>]*>([\s\S]*?)<\/span>/i)
          return spanMatch ? spanMatch[1].replace(/<[^>]+>/g, '').trim() : li[1].replace(/<[^>]+>/g, '').trim()
        })
        .filter(text => text.length > 0)
        .join('\n')
    }
  }
  
  // 3. Extract price from coreprice_feature_div
  const priceDiv = html.match(/<div[^>]*id=["']coreprice_feature_div["'][^>]*>([\s\S]*?)<\/div>/i)
  if (priceDiv) {
    // Extract price text (remove HTML tags)
    extracted.price = priceDiv[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  
  // 4. Extract table data from poExpander (heading: value pairs)
  const poExpander = html.match(/<div[^>]*id=["']poExpander["'][^>]*>([\s\S]*?)<\/div>/i)
  if (poExpander) {
    const tableMatch = poExpander[1].match(/<table[^>]*>([\s\S]*?)<\/table>/i)
    if (tableMatch) {
      const trMatches = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      extracted.productDetails = {}
      for (const tr of trMatches) {
        const tdMatches = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        if (tdMatches.length >= 2) {
          const heading = tdMatches[0][1].replace(/<[^>]+>/g, '').trim()
          const value = tdMatches[1][1].replace(/<[^>]+>/g, '').trim()
          if (heading && value) {
            extracted.productDetails[heading] = value
          }
        }
      }
    }
  }
  
  // 5. Extract table data from prodDetails (same structure)
  const prodDetails = html.match(/<div[^>]*id=["']prodDetails["'][^>]*>([\s\S]*?)<\/div>/i) ||
                      html.match(/<table[^>]*id=["']productDetails[^>]*>([\s\S]*?)<\/table>/i)
  if (prodDetails) {
    const tableMatch = prodDetails[1].match(/<table[^>]*>([\s\S]*?)<\/table>/i) || [null, prodDetails[1]]
    if (tableMatch[1]) {
      const trMatches = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      if (!extracted.productDetails) extracted.productDetails = {}
      for (const tr of trMatches) {
        const tdMatches = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        if (tdMatches.length >= 2) {
          const heading = tdMatches[0][1].replace(/<[^>]+>/g, '').trim()
          const value = tdMatches[1][1].replace(/<[^>]+>/g, '').trim()
          if (heading && value) {
            extracted.productDetails[heading] = value
          }
        }
      }
    }
  }
  
  return extracted
}

/**
 * Parse Amazon product page using Ollama
 */
export async function parseAmazonProduct(ollamaClient, model, url, asin, html) {
  let productAsin = asin
  let productUrl = url
  let productHtml = html
  
  // Extract ASIN from URL if not provided
  if (!productAsin && productUrl) {
    productAsin = extractAsin(productUrl)
  }
  
  // Generate product URL if we have ASIN but no URL
  if (!productUrl && productAsin) {
    productUrl = `https://www.amazon.com/dp/${productAsin}`
  }
  
  // Validate URL format if we have one
  if (productUrl && typeof productUrl === 'string') {
    try {
      new URL(productUrl) // Validate URL format
    } catch (urlError) {
      console.warn(`⚠️ Invalid URL format: ${productUrl}, will try with ASIN instead`)
      productUrl = null // Reset to null if invalid
    }
  }
  
  // Fetch HTML if not provided
  if (!productHtml && (productUrl || productAsin)) {
    try {
      // Only pass productUrl if it's a valid string, otherwise pass null and let fetchAmazonPage use ASIN
      const urlToFetch = (productUrl && typeof productUrl === 'string' && productUrl.trim()) ? productUrl : null
      productHtml = await fetchAmazonPage(urlToFetch, productAsin)
      console.log(`📄 Fetched HTML (${productHtml.length} characters)`)
      
      // Check if Amazon blocked the request (common indicators)
      const blockedIndicators = [
        'continue shopping',
        'click the button below',
        'to discuss automated access',
        'captcha',
        'robot',
        'bot detection',
        'access denied'
      ]
      
      const htmlLower = productHtml.toLowerCase()
      const isBlocked = blockedIndicators.some(indicator => htmlLower.includes(indicator))
      
      if (isBlocked) {
        console.warn('⚠️ Amazon may have blocked the request - detected block page indicators')
        // Still try to parse, but warn about potential issues
      }
      
      // Check if we got actual product content (common product page indicators)
      const productIndicators = [
        'id="productTitle"',
        'productTitle',
        'data-asin',
        'id="priceblock',
        'a-price'
      ]
      
      const hasProductContent = productIndicators.some(indicator => htmlLower.includes(indicator))
      
      if (!hasProductContent && !isBlocked) {
        console.warn('⚠️ HTML may not contain product information - no product indicators found')
      }
      
    } catch (error) {
      throw new Error(`Failed to fetch Amazon page: ${error.message}`)
    }
  }
  
  if (!productHtml) {
    throw new Error('HTML content is required. Provide url, asin, or html in request.')
  }
  
  // Use extracted or provided ASIN, or try to extract from HTML
  if (!productAsin) {
    productAsin = extractAsin(productHtml) || extractAsin(productUrl)
  }
  
  // Extract clean text from specific HTML sections
  const extractedText = extractProductText(productHtml)
  console.log('📦 Extracted product text sections:', {
    hasTitle: !!extractedText.title,
    hasDescription: !!extractedText.description,
    hasPrice: !!extractedText.price,
    productDetailsCount: extractedText.productDetails ? Object.keys(extractedText.productDetails).length : 0
  })
  
  // Log extracted details for debugging
  if (extractedText.productDetails) {
    console.log('📋 Product Details extracted:', Object.keys(extractedText.productDetails).slice(0, 10).join(', '))
  }
  if (extractedText.description) {
    console.log('📝 Description preview:', extractedText.description.substring(0, 200) + '...')
  }
  
  // Create prompt with extracted clean text (not raw HTML)
  const prompt = createParsePrompt(extractedText, productAsin, productUrl)
  
  console.log(`🤖 Sending to Ollama (model: ${model})...`)
  
  try {
    // Call Ollama API
    // Note: Timeout errors may occur but responses often still complete successfully
    const response = await ollamaClient.generate({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.1, // Low temperature for more deterministic output
        top_p: 0.9,
      }
    })
    
    // Extract response text (handle different response formats)
    let responseText = ''
    if (typeof response === 'string') {
      responseText = response
    } else if (response.response) {
      responseText = response.response
    } else if (response.text) {
      responseText = response.text
    } else if (response.message && response.message.content) {
      responseText = response.message.content
    } else {
      // Try to stringify if it's an object
      responseText = JSON.stringify(response)
    }
    
    console.log(`✅ Received response from Ollama (${responseText.length} characters)`)
    // Only log full response in development mode to avoid cluttering logs
    if (process.env.NODE_ENV === 'development') {
      console.log('📝 Raw Ollama response (first 500 chars):', responseText.substring(0, 500))
      console.log('📝 Raw Ollama response (full):', responseText)
    }
    
    // Extract JSON from response (handle cases where model adds extra text)
    let jsonText = responseText.trim()
    
    // Remove markdown code blocks if present
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')
    
    // Find JSON object in response
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('❌ No JSON object found in response. Full response:', responseText)
      throw new Error('No JSON object found in Ollama response')
    }
    
    jsonText = jsonMatch[0]
    console.log('📋 Extracted JSON text:', jsonText.substring(0, 500))
    
    // Parse JSON
    let productData
    try {
      productData = JSON.parse(jsonText)
      console.log('✅ Parsed product data:', JSON.stringify(productData, null, 2))
    } catch (parseError) {
      console.error('❌ Failed to parse JSON. Text:', jsonText.substring(0, 500))
      console.error('❌ Parse error:', parseError.message)
      throw new Error(`Failed to parse JSON response: ${parseError.message}`)
    }
    
    // Ensure ASIN is set
    if (!productData.asin && productAsin) {
      productData.asin = productAsin
    }
    
    // Ensure URL is set
    if (!productData.url && productUrl) {
      productData.url = productUrl
    } else if (!productData.url && productAsin) {
      productData.url = `https://www.amazon.com/dp/${productAsin}`
    }
    
    // Ensure images array exists
    if (!Array.isArray(productData.images)) {
      productData.images = []
    }
    
    // Validate data
    const validationErrors = validateProductData(productData)
    if (validationErrors.length > 0) {
      console.warn('⚠️ Validation warnings:', validationErrors)
      // Don't throw, just log warnings
    }
    
    // Check if we got useful data or if Amazon blocked the request
    const hasProductData = productData.title || productData.price !== null || productData.brand
    
    if (!hasProductData) {
      console.warn('⚠️ No product data extracted - Amazon may have blocked the request or page structure changed')
      // Check HTML for block indicators
      const htmlLower = productHtml.toLowerCase()
      if (htmlLower.includes('continue shopping') || htmlLower.includes('click the button below')) {
        throw new Error('Amazon blocked the request. This often happens with automated requests. Try again later or use a different method to access the product page.')
      }
    }
    
    // Clean and normalize data
    const cleanedData = {
      asin: productData.asin || null,
      type: productData.type || null,
      title: productData.title || null,
      price: productData.price !== undefined ? productData.price : null,
      brand: productData.brand || null,
      description: productData.description || null,
      size: productData.size || null,
      quantity: productData.quantity !== undefined ? productData.quantity : null,
      dimensions: productData.dimensions || null,
      rollLength: productData.rollLength !== undefined ? productData.rollLength : null,
      rollWidth: productData.rollWidth !== undefined ? productData.rollWidth : null,
      printNames: Array.isArray(productData.printNames) ? productData.printNames : (productData.printNames === null ? null : []),
      rolls: Array.isArray(productData.rolls) ? productData.rolls : (productData.rolls === null ? null : []),
      thumbnail: productData.thumbnail || null,
      images: Array.isArray(productData.images) ? productData.images : [],
      url: productData.url || (productAsin ? `https://www.amazon.com/dp/${productAsin}` : null)
    }
    
    // Validate rolls array structure if present
    if (cleanedData.rolls && Array.isArray(cleanedData.rolls)) {
      cleanedData.rolls = cleanedData.rolls.map((roll, index) => ({
        rollNumber: typeof roll.rollNumber === 'number' ? roll.rollNumber : (index + 1),
        onHand: typeof roll.onHand === 'number' ? roll.onHand : 0,
        maxArea: typeof roll.maxArea === 'number' ? roll.maxArea : (roll.onHand || 0),
        image: roll.image || null,
        printName: roll.printName || null,
        hasReverseSide: typeof roll.hasReverseSide === 'boolean' ? roll.hasReverseSide : false,
        pairedRollNumber: typeof roll.pairedRollNumber === 'number' ? roll.pairedRollNumber : null
      }))
    }
    
    return cleanedData
  } catch (error) {
    // Handle timeout errors - these can happen with slow models but often the response still arrives
    if (error.code === 'UND_ERR_HEADERS_TIMEOUT' || 
        error.message?.includes('Headers Timeout') ||
        error.cause?.code === 'UND_ERR_HEADERS_TIMEOUT') {
      console.warn('⚠️ Ollama request timed out on headers. This may be due to model processing time.')
      console.warn('⚠️ If parsing succeeds, this warning can be ignored.')
      // The error might be non-fatal if response was received, but we still throw to be safe
      // The server will handle retries if needed
      throw new Error(`Ollama request timed out: The model took too long to respond. Try again or use a faster model. Original error: ${error.message}`)
    }
    
    if (error.message?.includes('Ollama') || error.message?.includes('model') || error.message?.includes('timeout')) {
      throw new Error(`Ollama API error: ${error.message}`)
    }
    throw error
  }
}

