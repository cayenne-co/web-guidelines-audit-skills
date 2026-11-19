#!/usr/bin/env node
// web-guidelines-audit: builds a checklist work file (JSON) from the AI findings.
// Node 18 or later. No dependencies.
//
// Usage:
//   node workfile.mjs --guidelines <guidelines site URL or folder> --findings findings.json --out audit.json
//
// Shape of findings.json:
//   {
//     "record": { "project": "…", "site": "https://…", "scope": "both",
//                 "pages": [{ "name": "Top", "url": "https://…/" }, { "name": "List", "url": "https://…/list/" }],
//                 "kind": "live", "target": "AA", "reviewer": "AI（Claude Code）", "browsers": "Chrome 142" },
//     "results": [
//       { "domain": "accessibility", "id": "QA-18", "url": "https://…/", "ai": "pass", "note": "One h1…",
//         "evidence": ["shots/top-headings.png"] }
//     ]
//   }
// ai is pass / fail / na (not applicable). Leave out items that could not be judged, or omit ai and write only note.
//
// The work file's verdict is left empty. AI results go to ai / ai_note; the reviewer confirms and sets the verdict.

import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
)
if (!args.guidelines || !args.findings || !args.out) {
  console.error('Usage: node workfile.mjs --guidelines <URL or folder> --findings findings.json --out audit.json')
  process.exit(1)
}

async function load(name) {
  const base = args.guidelines.replace(/\/$/, '')
  if (/^https?:/.test(base)) {
    const res = await fetch(`${base}/${name}`)
    if (!res.ok) throw new Error(`${base}/${name}: ${res.status}`)
    return res.json()
  }
  return JSON.parse(await readFile(path.join(base, name), 'utf8'))
}

const data = await load('checklist.json')
const meta = await load('checklist-meta.json').catch(() => ({}))
const findings = JSON.parse(await readFile(args.findings, 'utf8'))

// Skill version and supported guidelines range, from SKILL.md metadata
const skillMd = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'SKILL.md'), 'utf8').catch(() => '')
const skillVersion = skillMd.match(/^\s+version:\s*"?([\d.]+)"?\s*$/m)?.[1] ?? ''
const supported = skillMd.match(/^\s+guidelines:\s*"([^"]+)"\s*$/m)?.[1] ?? ''
const cmp = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}
// Supports space-separated comparators: >=, >, <=, <, =
const satisfies = (v, range) =>
  range.split(/\s+/).filter(Boolean).every((c) => {
    const [, op = '=', ver] = c.match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+){0,2})$/) ?? []
    if (!ver) return true
    const d = cmp(v, ver)
    return { '>=': d >= 0, '>': d > 0, '<=': d <= 0, '<': d < 0, '=': d === 0 }[op]
  })

const items = new Map(data.map((x) => [`${x.domain}/${x.id}`, x]))
const AI = ['pass', 'fail', 'na']

// Merge results when the same item was checked on several pages: fail if any page fails, na if all are na, otherwise pass.
// Findings get one line per page
const merged = new Map()
for (const r of findings.results ?? []) {
  // The domain is decided by the ID prefix (Page Quality: DOC STR LNK IMG FRM PRF / Accessibility: IA DS DEV QA OPS)
  const domain = r.domain ?? (/^(DOC|STR|LNK|IMG|FRM|PRF)-/.test(r.id) ? 'html' : /^(IA|DS|DEV|QA|OPS)-/.test(r.id) ? 'accessibility' : null)
  if (!domain) throw new Error(`${r.id}: unknown domain. Set domain (html / accessibility)`)
  const key = `${domain}/${r.id}`
  const item = items.get(key)
  if (!item) throw new Error(`${key}: item not found in checklist.json`)
  if (r.ai && !AI.includes(r.ai)) throw new Error(`${key}: ai must be one of ${AI.join(' / ')} (got ${r.ai})`)
  if (!merged.has(key)) merged.set(key, { ais: [], notes: [] })
  const m = merged.get(key)
  if (r.ai) m.ais.push(r.ai)
  // Write only the path when the origin matches the record's site (readable in the narrow checklist column)
  const site = (() => {
    try {
      return new URL(findings.record?.site ?? '').origin
    } catch {
      return null
    }
  })()
  const where = r.url ? `[${site && r.url.startsWith(site) ? r.url.slice(site.length) || '/' : r.url}] ` : ''
  const ev = (r.evidence ?? []).length ? ` (evidence: ${[].concat(r.evidence).join(', ')})` : ''
  const label = r.ai ? { pass: 'Pass', fail: 'Fail', na: 'N/A' }[r.ai] : 'Not judged'
  m.notes.push(`${where}${label}: ${r.note ?? ''}${ev}`.trim())
}

// For items marked "same check as …", copy the AI result to the row in the other domain too (shown on both record sheets)
for (const x of data) {
  for (const ref of x.same_as ?? []) {
    const a = `${x.domain}/${x.id}`
    const b = `${ref.domain}/${ref.id}`
    if (merged.has(a) && !merged.has(b)) merged.set(b, merged.get(a))
    else if (merged.has(b) && !merged.has(a)) merged.set(a, merged.get(b))
  }
}

const combine = (ais) => (!ais.length ? undefined : ais.includes('fail') ? 'fail' : ais.every((a) => a === 'na') ? 'na' : 'pass')

const results = {}
for (const [key, m] of merged) {
  const entry = { ai_note: m.notes.join('\n') }
  const ai = combine(m.ais)
  if (ai) entry.ai = ai
  results[key] = entry
}

const now = new Date().toISOString()
const today = now.slice(0, 10)
const record = { scope: 'both', kind: 'live', target: 'AA', date: today, ...(findings.record ?? {}) }
// Target pages (name and URL). The "Page" column of each checklist row is chosen from these.
// If absent, they are built from the results' urls (name = path). id is used by the checklist for selection
if (!Array.isArray(record.pages) || !record.pages.length) {
  const urls = [...new Set((findings.results ?? []).map((r) => r.url).filter(Boolean))]
  record.pages = urls.map((url) => {
    let name = url
    try {
      name = new URL(url).pathname || '/'
    } catch {}
    return { name, url }
  })
}
record.pages = record.pages.map((p) => ({ id: p.id ?? randomUUID(), name: String(p.name ?? ''), url: String(p.url ?? '') }))
const audit = {
  format: 'web-guidelines-audit',
  formatVersion: 1,
  id: randomUUID(),
  createdAt: now,
  updatedAt: now,
  version: args.version ?? meta.version ?? '',
  record,
  results
}
await writeFile(args.out, JSON.stringify(audit, null, 2) + '\n', 'utf8')

const count = (v) => Object.values(results).filter((e) => e.ai === v).length
console.log(`Wrote ${args.out}: ${Object.keys(results).length} items (pass ${count('pass')}, fail ${count('fail')}, n/a ${count('na')}, not judged ${Object.values(results).filter((e) => !e.ai).length})`)
if (skillVersion) console.log(`Skill version: ${skillVersion} (supports guidelines ${supported || 'any'})`)
if (audit.version && supported && !satisfies(audit.version, supported))
  console.warn(`Warning: guidelines version ${audit.version} is outside the range this skill supports (${supported}). Update the skill (see README).`)
if (!audit.version) console.log('Guidelines version unknown. Pass --version (the checklist app asks to confirm the version when opened)')
