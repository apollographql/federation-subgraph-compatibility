#!/usr/bin/env node

const IOAPI = require('@pm2/js-api')
const fs = require('fs')
const path = require('path')

const PM2_HOME = process.env.PM2_HOME || path.resolve(require('os').homedir(), '.pm2')
const TOKEN_PATH = path.resolve(PM2_HOME, 'pm2-io-token')
const BUCKET_NAME = process.argv[2] || 'Keymetrics - Production'

let tokens
try {
  tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
} catch (err) {
  console.error(`Cannot read token file at ${TOKEN_PATH}`)
  console.error('Run "pm2 plus login" first.')
  process.exit(1)
}

const io = new IOAPI()
io._network.tokens = tokens
io._network.authenticated = true

async function main() {
  const res = await io.bucket.retrieveAll()
  const bucket = res.data.find(b => b.name === BUCKET_NAME)

  if (!bucket) {
    console.log(`Bucket "${BUCKET_NAME}" not found.`)
    console.log('Available buckets:')
    res.data.forEach(b => console.log(`  - ${b.name} (${b._id})`))
    process.exit(1)
  }

  console.log(`Bucket: ${bucket.name} (${bucket._id})\n`)

  const issues = await io.data.issues.list(bucket._id, {})
  const exceptions = issues.data || []

  console.log(`Exceptions: ${exceptions.length}\n`)

  exceptions.slice(0, 100).forEach((ex, i) => {
    const last = ex.last || {}
    const date = last.at || '-'
    const count = ex.count || '-'
    const app = last.app || '-'
    const server = last.server || '-'
    const msg = (last.message || '').substring(0, 120)
    const callsite = last.callsite || ''
    console.log(`${String(i + 1).padStart(3)}. [${date}] ${app}@${server} (x${count})`)
    console.log(`     ${msg}`)
    if (callsite) console.log(`     ${callsite}`)
  })
}

main().catch(err => {
  console.error('Error:', err.data || err.message || err)
  process.exit(1)
}).then(() => process.exit(0))
