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

  console.log(`Bucket: ${bucket.name} (${bucket._id})`)

  const status = await io.data.status.retrieve(bucket._id)
  const servers = status.data

  if (!Array.isArray(servers) || servers.length === 0) {
    console.log('\nNo servers connected.')
    process.exit(0)
  }

  const online = servers.filter(s => s.data && s.data.server && s.data.server.active === true)
  const offline = servers.filter(s => !s.data || !s.data.server || s.data.server.active !== true)

  console.log(`\nServers: ${servers.length} total, ${online.length} online, ${offline.length} offline\n`)

  console.log('=== Online ===')
  online.forEach(server => {
    const procs = server.data.process || []
    console.log(`\n  ${server.server_name}  (${procs.length} processes)`)
    procs.forEach(proc => {
      const mem = proc.memory ? `${(proc.memory / 1024 / 1024).toFixed(1)}MB` : '-'
      const cpu = proc.cpu != null ? `${proc.cpu}%` : '-'
      console.log(`    [${proc.pm_id}] ${proc.name}  ${proc.status}  cpu:${cpu}  mem:${mem}`)
    })
  })

  if (offline.length > 0) {
    console.log('\n=== Offline ===')
    offline.forEach(server => {
      console.log(`  ${server.server_name}`)
    })
  }
}

main().catch(err => {
  console.error('Error:', err.data || err.message || err)
  process.exit(1)
}).then(() => process.exit(0))
