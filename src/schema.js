/**
 * Schema definitions and prompt templates for Amazon product parsing
 */

export const PRODUCT_SCHEMA = {
  asin: 'string (10 alphanumeric characters)',
  type: 'string (one of: wrapping_paper, ribbon, box, tag, bow)',
  title: 'string (product title)',
  price: 'number (price in USD, without $ symbol)',
  brand: 'string (brand name)',
  description: 'string (product description or additional details)',
  size: 'string (e.g., "88 sqft" for wrapping paper)',
  quantity: 'number (number of items in pack)',
  dimensions: 'string (for boxes: "WxLxH" format, e.g., "12x12x6")',
  rollLength: 'number (roll length in feet, for wrapping paper)',
  rollWidth: 'number (roll width in inches, for wrapping paper)',
  printNames: 'array of strings (individual print/design names, e.g., ["Red Trucks", "Snowflakes", "Stripes", "Merry Christmas"])',
  rolls: 'array of Roll objects (one for each roll in the pack, only for wrapping_paper type)',
  thumbnail: 'string (main product image URL)',
  images: 'array of strings (additional image URLs)',
  url: 'string (Amazon product URL)'
}

export function createParsePrompt(extractedText, asin, url) {
  // Format extracted text into readable format
  let textContent = ''
  
  if (extractedText.title) {
    textContent += `PRODUCT TITLE:\n${extractedText.title}\n\n`
  }
  
  if (extractedText.price) {
    textContent += `PRICE:\n${extractedText.price}\n\n`
  }
  
  if (extractedText.description) {
    textContent += `DESCRIPTION / FEATURE BULLETS:\n${extractedText.description}\n\n`
  }
  
  if (extractedText.productDetails && Object.keys(extractedText.productDetails).length > 0) {
    textContent += `PRODUCT DETAILS:\n`
    for (const [heading, value] of Object.entries(extractedText.productDetails)) {
      textContent += `${heading}: ${value}\n`
    }
    textContent += '\n'
  }
  
  if (extractedText.thumbnail) {
    textContent += `THUMBNAIL IMAGE: ${extractedText.thumbnail}\n\n`
  }
  
  if (!textContent.trim()) {
    textContent = 'No product information extracted from HTML.'
  }
  
  return `Extract product information from the following Amazon product data and return ONLY a valid JSON object matching the schema.

Extract and map the following fields from the text below:

Required JSON schema (all fields required, use null if not found):
{
  "asin": "${asin || 'extract from URL'}",
  "type": "wrapping_paper | ribbon | box | tag | bow | null",
  "title": "string | null",
  "price": number | null,
  "brand": "string | null",
  "description": "string | null",
  "size": "string | null",
  "quantity": number | null,
  "dimensions": "string | null",
  "rollLength": number | null,
  "rollWidth": number | null,
  "printNames": ["string"] | null,
  "rolls": [{"rollNumber": number, "onHand": number, "maxArea": number, "image": "string | null", "printName": "string | null", "hasReverseSide": boolean, "pairedRollNumber": number | null}] | null,
  "thumbnail": "string | null",
  "images": ["string"],
  "url": "${url || `https://www.amazon.com/dp/${asin || ''}`}"
}

EXTRACTION RULES:
- type: Detect from title/description (wrapping/wrap/paper = wrapping_paper, ribbon = ribbon, box = box, tag/gift tag = tag, bow = bow)
- title: Use PRODUCT TITLE if available
- price: Extract number from PRICE section (remove $, commas, convert to number)
- brand: Look for "Brand:" in PRODUCT DETAILS
- description: Use DESCRIPTION section, combine all bullet points
- size: Look for size info in PRODUCT DETAILS or DESCRIPTION (e.g., "88 sq. ft.", "22 sq. ft. per roll") - format as "88 sqft" or "22 sqft"
- quantity: Look for "Pack of 4" (quantity=4), "4 Pack" (quantity=4), "Number of Items: 4" (quantity=4) in PRODUCT DETAILS or DESCRIPTION
- rollWidth: Look for width in inches in PRODUCT DETAILS or DESCRIPTION (e.g., "30 inches", "30\\"", "30\\" x 8.8'" means 30)
- rollLength: Look for length in feet in PRODUCT DETAILS or DESCRIPTION (e.g., "8.8 feet", "8.8'", "30\\" x 8.8'" means 8.8)
- dimensions: For boxes, format as "WxLxH" in inches
- printNames: Extract individual print/design names from title or description. Look for patterns like comma-separated names in parentheses, or lists like "Red Trucks, Snowflakes, Stripes, Merry Christmas". Return as array of strings, e.g., ["Red Trucks", "Snowflakes", "Stripes", "Merry Christmas"]. Use null or empty array if not found.
- rolls: IMPORTANT - Only create if type is wrapping_paper AND quantity is found. Create an array with one Roll object for each roll in the pack.
  * For each roll, set: rollNumber (1, 2, 3, ...), onHand (calculate from size per roll - e.g., if "22 sqft per roll" use 22, or if total size is "88 sqft" and quantity is 4, use 88/4 = 22), maxArea (same as onHand), image (null), printName (assign from printNames array if available, cycling through them - roll 1 gets printNames[0], roll 2 gets printNames[1], etc. If no printNames, use null), hasReverseSide (look for "reverse", "both sides", "cut lines on reverse" in description - set true if found, false otherwise), pairedRollNumber (null)
  * Example: If quantity=4 and printNames=["Red Trucks", "Snowflakes", "Stripes", "Merry Christmas"] and size per roll is 22 sqft, create:
    [
      {"rollNumber": 1, "onHand": 22, "maxArea": 22, "image": null, "printName": "Red Trucks", "hasReverseSide": true, "pairedRollNumber": null},
      {"rollNumber": 2, "onHand": 22, "maxArea": 22, "image": null, "printName": "Snowflakes", "hasReverseSide": true, "pairedRollNumber": null},
      {"rollNumber": 3, "onHand": 22, "maxArea": 22, "image": null, "printName": "Stripes", "hasReverseSide": true, "pairedRollNumber": null},
      {"rollNumber": 4, "onHand": 22, "maxArea": 22, "image": null, "printName": "Merry Christmas", "hasReverseSide": true, "pairedRollNumber": null}
    ]
  * If type is not wrapping_paper or quantity is not found, set rolls to null.

PRODUCT DATA:
${textContent}

Return ONLY the raw JSON object. No markdown, no explanations, no code blocks. Start with { and end with }.`
}

export function validateProductData(data) {
  const errors = []
  
  if (data.asin && !/^[A-Z0-9]{10}$/.test(data.asin)) {
    errors.push('ASIN must be 10 alphanumeric characters')
  }
  
  if (data.type && !['wrapping_paper', 'ribbon', 'box', 'tag', 'bow'].includes(data.type)) {
    errors.push('Type must be one of: wrapping_paper, ribbon, box, tag, bow')
  }
  
  if (data.price !== null && (typeof data.price !== 'number' || data.price < 0 || data.price > 100000)) {
    errors.push('Price must be a number between 0 and 100000')
  }
  
  if (data.quantity !== null && (typeof data.quantity !== 'number' || data.quantity < 0 || data.quantity > 100000)) {
    errors.push('Quantity must be a number between 0 and 100000')
  }
  
  if (data.rollWidth !== null && (typeof data.rollWidth !== 'number' || data.rollWidth < 0 || data.rollWidth > 100)) {
    errors.push('Roll width must be a number between 0 and 100')
  }
  
  if (data.rollLength !== null && (typeof data.rollLength !== 'number' || data.rollLength < 0 || data.rollLength > 100)) {
    errors.push('Roll length must be a number between 0 and 100')
  }
  
  return errors
}

