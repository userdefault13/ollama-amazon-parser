/**
 * Fetch Amazon product page HTML
 */

import axios from 'axios'

/**
 * Extract ASIN from Amazon URL
 */
export function extractAsin(url) {
  if (!url) return null
  
  const asinPatterns = [
    /(?:dp|product|gp\/product)\/([A-Z0-9]{10})/,
    /\/dp\/([A-Z0-9]{10})/,
    /\/product\/([A-Z0-9]{10})/,
    /\/gp\/product\/([A-Z0-9]{10})/
  ]
  
  for (const pattern of asinPatterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }
  
  return null
}

/**
 * Fetch Amazon product page HTML
 */
export async function fetchAmazonPage(url, asin) {
  // Validate and construct URL
  let fetchUrl = null
  
  if (url && typeof url === 'string' && url.trim()) {
    try {
      // Validate URL format
      new URL(url)
      fetchUrl = url.trim()
    } catch (urlError) {
      console.warn(`⚠️ Invalid URL format: ${url}, falling back to ASIN`)
    }
  }
  
  // Fallback to ASIN-based URL if no valid URL
  if (!fetchUrl && asin) {
    fetchUrl = `https://www.amazon.com/dp/${asin}`
  }
  
  if (!fetchUrl) {
    throw new Error('Valid URL or ASIN is required')
  }
  
  // Validate ASIN if provided
  if (asin && !/^[A-Z0-9]{10}$/.test(asin)) {
    throw new Error('Invalid ASIN format. ASIN must be 10 alphanumeric characters.')
  }
  
  try {
    const response = await axios.get(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
      },
      timeout: 30000, // 30 second timeout
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      // Don't decompress automatically to preserve original encoding
      decompress: true
    })
    
    // Check if response looks like a block page
    const html = response.data
    const htmlLower = html.toLowerCase()
    
    if (htmlLower.includes('continue shopping') || 
        htmlLower.includes('click the button below') ||
        (htmlLower.includes('bot') && htmlLower.includes('detection'))) {
      console.warn('⚠️ Amazon may have served a block page instead of product content')
    }
    
    return html
  } catch (error) {
    if (error.response) {
      throw new Error(`Amazon returned status ${error.response.status}: ${error.response.statusText}`)
    } else if (error.request) {
      throw new Error('Failed to connect to Amazon. The request timed out or Amazon blocked the connection.')
    } else {
      throw new Error(`Error fetching Amazon page: ${error.message}`)
    }
  }
}

