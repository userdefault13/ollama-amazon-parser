# Ollama Amazon Parser Service

AI-powered Amazon product page parser using Ollama. This service extracts structured product data from Amazon product pages using LLM-based parsing instead of regex patterns.

## Features

- 🤖 AI-powered extraction using Ollama (llama3.2)
- 📦 Extracts product details: title, price, brand, dimensions, quantity, etc.
- 🔄 Fallback support in Last-Wrap-Hero for graceful degradation
- 🚀 Standalone Express service running on port 3001
- 🌐 RESTful API with CORS support

## Prerequisites

1. **Node.js** (v18 or higher)
2. **Ollama** installed and running
   - Install: https://ollama.ai
   - Pull the model: `ollama pull llama3.2`

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Configure environment variables (optional, defaults work for local development):
```env
PORT=3001
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2
CORS_ORIGIN=*
```

## Running the Service

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The service will start on port 3001 (or the port specified in `PORT` environment variable).

## API Endpoints

### POST /parse

Parse an Amazon product page and extract structured data.

**Request Body:**
```json
{
  "url": "https://www.amazon.com/dp/B08XYZ1234",
  "asin": "B08XYZ1234",  // Optional if URL is provided
  "html": "<html>..."    // Optional - can provide HTML directly
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "asin": "B08XYZ1234",
    "type": "wrapping_paper",
    "title": "Hallmark Christmas Wrapping Paper",
    "price": 16.99,
    "brand": "Hallmark",
    "description": "...",
    "size": "88 sqft",
    "quantity": 4,
    "dimensions": null,
    "rollLength": 8.8,
    "rollWidth": 30,
    "thumbnail": "https://m.media-amazon.com/...",
    "images": [],
    "url": "https://www.amazon.com/dp/B08XYZ1234"
  },
  "message": "Product details extracted successfully."
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message here"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "ollama-amazon-parser",
  "ollamaHost": "http://localhost:11434",
  "model": "llama3.2"
}
```

## Integration with Last-Wrap-Hero

To use this service with Last-Wrap-Hero, set the `OLLAMA_PARSER_URL` environment variable:

```env
OLLAMA_PARSER_URL=http://localhost:3001
```

Last-Wrap-Hero will automatically try to use the Ollama parser service first, and fall back to the regex-based parser if the service is unavailable.

## Product Data Schema

The service extracts the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `asin` | string | 10-character Amazon ASIN |
| `type` | string \| null | Product type: `wrapping_paper`, `ribbon`, `box`, `tag`, or `bow` |
| `title` | string \| null | Product title |
| `price` | number \| null | Price in USD |
| `brand` | string \| null | Brand name |
| `description` | string \| null | Product description or material/color info |
| `size` | string \| null | Size (e.g., "88 sqft" for wrapping paper) |
| `quantity` | number \| null | Number of items in pack |
| `dimensions` | string \| null | Box dimensions in "WxLxH" format (inches) |
| `rollLength` | number \| null | Roll length in feet (wrapping paper) |
| `rollWidth` | number \| null | Roll width in inches (wrapping paper) |
| `thumbnail` | string \| null | Main product image URL |
| `images` | string[] | Additional product image URLs |
| `url` | string | Full Amazon product URL |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Port for the Express server |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `llama3.2` | Ollama model to use |
| `CORS_ORIGIN` | `*` | CORS allowed origins |

## Troubleshooting

### Ollama not responding
- Ensure Ollama is running: `ollama serve`
- Check Ollama is accessible at the configured `OLLAMA_HOST`
- Verify the model is available: `ollama list`

### Service fails to start
- Check if port 3001 is already in use
- Verify all dependencies are installed: `npm install`
- Check Node.js version: `node --version` (should be v18+)

### Parsing errors
- Check that the Amazon URL is valid and accessible
- Verify the HTML contains product information
- Check Ollama logs for model errors
- Try with a different Amazon product URL

## Development

### Project Structure
```
ollama-amazon-parser/
├── package.json
├── server.js              # Express server entry point
├── .env.example
├── README.md
└── src/
    ├── parser.js          # Main Ollama parsing logic
    ├── amazon-fetcher.js  # Fetch Amazon HTML
    └── schema.js          # Schema definitions & prompts
```

### Testing

Test the service with curl:

```bash
curl -X POST http://localhost:3001/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.amazon.com/dp/B08XYZ1234"}'
```

## License

ISC

