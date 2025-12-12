/**
 * Express server for Ollama Amazon Parser
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { parseAmazonProduct, createOllamaClient } from './src/parser.js'
import path from 'path'
import { fileURLToPath } from 'url'

// ES module dirname workaround
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2'
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'

// Middleware
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
  credentials: true
}))
app.use(express.json({ limit: '10mb' })) // Allow large HTML payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Initialize Ollama client
const ollamaClient = createOllamaClient(OLLAMA_HOST)

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')))

// Root endpoint (fallback if no index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) {
      res.json({
        service: 'Ollama Amazon Parser',
        status: 'running',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          parse: 'POST /parse'
        },
        ollamaHost: OLLAMA_HOST,
        model: OLLAMA_MODEL
      })
    }
  })
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ollama-amazon-parser',
    ollamaHost: OLLAMA_HOST,
    model: OLLAMA_MODEL
  })
})

// Main parse endpoint
app.post('/parse', async (req, res) => {
  try {
    const { url, asin, html } = req.body
    
    // Validate input
    if (!url && !asin && !html) {
      return res.status(400).json({
        success: false,
        error: 'At least one of url, asin, or html is required'
      })
    }
    
    console.log(`📦 Parsing request:`, { url, asin, htmlProvided: !!html })
    
    // Parse product
    const productData = await parseAmazonProduct(
      ollamaClient,
      OLLAMA_MODEL,
      url,
      asin,
      html
    )
    
    console.log(`✅ Successfully parsed product:`, {
      asin: productData.asin,
      type: productData.type,
      title: productData.title ? productData.title.substring(0, 50) + '...' : null
    })
    
    res.json({
      success: true,
      data: productData,
      message: 'Product details extracted successfully.'
    })
  } catch (error) {
    console.error('❌ Error parsing product:', error)
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse Amazon product',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Ollama Amazon Parser service running on port ${PORT}`)
  console.log(`📡 Ollama host: ${OLLAMA_HOST}`)
  console.log(`🤖 Model: ${OLLAMA_MODEL}`)
  console.log(`🌐 CORS origin: ${CORS_ORIGIN}`)
  console.log(`📂 Serving UI from: ${path.join(__dirname, 'public')}`)
})

