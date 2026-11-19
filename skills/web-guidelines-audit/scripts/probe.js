// web-guidelines-audit: runs inside the page and collects values used to judge checklist items.
// Read-only (no form submission or input, no cookie or storage changes). Network access is limited to GET requests to the same site.
//
// Usage (pass this function expression as is):
//   Claude in Chrome javascript_tool:  await (<contents of this file>)()
//   Playwright MCP browser_evaluate:    pass the contents of this file as `function`
// Running it places helper functions (focus log, link checks, etc.) on window.__wga and returns the collected values.
async () => {
  const LIMIT = 40
  const cut = (xs, n = LIMIT) => (xs.length > n ? [...xs.slice(0, n), `…and ${xs.length - n} more`] : xs)
  const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const short = (s, n = 80) => (s && s.length > n ? s.slice(0, n) + '…' : s)

  // Describe an element so a person can find it (tag, id, class, text)
  const desc = (el) => {
    if (!el || el.nodeType !== 1) return String(el)
    let s = el.tagName.toLowerCase()
    if (el.id) s += `#${el.id}`
    const cls = [...el.classList].slice(0, 2).join('.')
    if (cls) s += `.${cls}`
    const t = short(text(el), 40)
    return t ? `${s} "${t}"` : s
  }

  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0
  }
  // Visually hidden text placed off-screen (.sr-only etc.). Still read by screen readers
  const visuallyHidden = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return (r.width <= 1 && r.height <= 1) || cs.clipPath === 'inset(50%)' || /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(cs.clip)
  }
  const hiddenFromAT = (el) => el.closest('[aria-hidden="true"], [hidden], [inert]') !== null

  // Approximate accessible name (aria-labelledby → aria-label → label / alt / value → content → title → placeholder).
  // `source` tells where the name came from
  const accName = (el) => {
    const ids = el.getAttribute('aria-labelledby')
    if (ids) {
      const t = ids.split(/\s+/).map((id) => text(document.getElementById(id))).join(' ').trim()
      if (t) return { name: t, source: 'aria-labelledby' }
    }
    const al = el.getAttribute('aria-label')?.trim()
    if (al) return { name: al, source: 'aria-label' }
    const tag = el.tagName.toLowerCase()
    if (['input', 'select', 'textarea'].includes(tag)) {
      if (['button', 'submit', 'reset'].includes(el.type) && el.value) return { name: el.value, source: 'value' }
      if (el.type === 'image' && el.alt) return { name: el.alt, source: 'alt' }
      const lab = [...(el.labels ?? [])].map(text).join(' ').trim()
      if (lab) return { name: lab, source: 'label' }
    } else if (tag === 'img') {
      if (el.hasAttribute('alt')) return { name: el.alt.trim(), source: 'alt' }
    } else {
      const parts = []
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) parts.push(c.textContent)
          else if (c.nodeType === 1) {
            if (c.getAttribute('aria-hidden') === 'true') continue
            if (c.tagName === 'IMG' || c.tagName === 'INPUT') parts.push(c.getAttribute('alt') ?? '')
            else if (c.tagName === 'svg' || c.tagName === 'SVG') parts.push(c.getAttribute('aria-label') ?? c.querySelector('title')?.textContent ?? '')
            else if (c.getAttribute('aria-label')) parts.push(c.getAttribute('aria-label'))
            else walk(c)
          }
        }
      }
      walk(el)
      const t = parts.join(' ').replace(/\s+/g, ' ').trim()
      if (t) return { name: t, source: 'contents' }
    }
    const title = el.getAttribute('title')?.trim()
    if (title) return { name: title, source: 'title' }
    const ph = el.getAttribute('placeholder')?.trim()
    if (ph) return { name: ph, source: 'placeholder' }
    return { name: '', source: 'none' }
  }
  // Text visible on screen (excluding screen-reader-only text and aria-hidden)
  const visibleText = (el) => {
    const parts = []
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) parts.push(c.textContent)
        else if (c.nodeType === 1 && c.getAttribute('aria-hidden') !== 'true' && visible(c) && !visuallyHidden(c)) walk(c)
      }
    }
    walk(el)
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  }

  // ─── Color and contrast ───
  const parseColor = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return { r, g, b, a }
  }
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100
  }
  const blend = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1
  })
  // Background color behind the element. null if it hits a background image or gradient (cannot judge)
  const bgOf = (el) => {
    const layers = []
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
      const c = parseColor(cs.backgroundColor)
      if (c && c.a > 0) {
        layers.push(c)
        if (c.a >= 1) break
      }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 }
    for (const c of layers.reverse()) base = blend(c, base)
    return base
  }
  const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

  // ─── Fetched HTML and headers ───
  const doc = {}
  try {
    const res = await fetch(location.href, { credentials: 'include' })
    const buf = new Uint8Array(await res.arrayBuffer())
    const head = new TextDecoder().decode(buf.slice(0, 1024))
    const full = new TextDecoder().decode(buf)
    doc.status = res.status
    doc.doctypeFirst = /^﻿?<!doctype html>/i.test(full.split('\n')[0].trim())
    doc.charsetIn1024 = /<meta[^>]+charset=["']?utf-8/i.test(head)
    doc.xRobotsTag = res.headers.get('x-robots-tag')
  } catch (e) {
    doc.fetchError = String(e)
  }
  const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null
  doc.lang = document.documentElement.getAttribute('lang')
  doc.title = document.title
  doc.viewport = meta('meta[name="viewport"]')
  doc.description = meta('meta[name="description"]')
  doc.descriptionLength = doc.description ? [...doc.description].length : 0
  doc.canonical = document.querySelector('link[rel="canonical"]')?.href ?? null
  doc.robots = meta('meta[name="robots"]')
  doc.refresh = meta('meta[http-equiv="refresh" i]')
  doc.ogp = Object.fromEntries(['og:title', 'og:type', 'og:url', 'og:image', 'og:description'].map((p) => [p, meta(`meta[property="${p}"]`)]))
  const status = async (url) => {
    try {
      return (await fetch(url, { method: 'GET', credentials: 'include' })).status
    } catch (e) {
      return `error: ${e.message} (URLs on other sites may be blocked by CORS; open them in the browser to check)`
    }
  }
  if (doc.ogp['og:image']) doc.ogImageStatus = await status(doc.ogp['og:image'])
  const icon = document.querySelector('link[rel~="icon"]')?.href ?? new URL('/favicon.ico', location.href).href
  doc.favicon = { href: icon, status: await status(icon) }

  // ─── Headings, landmarks, structure ───
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].filter((h) => !hiddenFromAT(h))
  const levels = hs.map((h) => Number(h.getAttribute('aria-level') ?? h.tagName.slice(1)))
  const headings = {
    h1Count: levels.filter((l) => l === 1).length,
    list: cut(hs.map((h, i) => `h${levels[i]} ${short(text(h))}`), 60),
    skips: hs.filter((h, i) => i > 0 && levels[i] > levels[i - 1] + 1).map(desc)
  }
  const named = (el) => accName(el).name
  const mains = [...document.querySelectorAll('main,[role="main"]')].filter((m) => !m.hidden)
  const banner = [...document.querySelectorAll('header,[role="banner"]')].filter((h) => h.getAttribute('role') === 'banner' || !h.closest('article,aside,main,nav,section'))
  const contentinfo = [...document.querySelectorAll('footer,[role="contentinfo"]')].filter((f) => f.getAttribute('role') === 'contentinfo' || !f.closest('article,aside,main,nav,section'))
  const navs = [...document.querySelectorAll('nav,[role="navigation"]')].filter((n) => !hiddenFromAT(n))
  const landmarks = {
    main: mains.length,
    mainNested: mains.some((m) => m.parentElement?.closest('main,[role="main"]')),
    banner: banner.length,
    contentinfo: contentinfo.length,
    navs: navs.map((n) => ({ name: (n.getAttribute('aria-label') || (n.getAttribute('aria-labelledby') ? named(n) : '')) || null, el: desc(n) }))
  }
  const idCount = {}
  for (const el of document.querySelectorAll('[id]')) idCount[el.id] = (idCount[el.id] ?? 0) + 1
  const duplicateIds = Object.entries(idCount).filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`)
  const sectionsWithoutHeading = [...document.querySelectorAll('section')].filter((s) => !s.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]')).map(desc)

  // ─── Images ───
  const vh = innerHeight
  const imgs = [...document.querySelectorAll('img')]
  const raster = (src) => !/\.svg(\?|#|$)/i.test(src ?? '') && !/^data:image\/svg/.test(src ?? '')
  const below = (el) => el.getBoundingClientRect().top + scrollY > vh
  const formats = {}
  for (const e of performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'img' || /\.(avif|webp|jpe?g|png|gif)(\?|$)/i.test(e.name)).slice(0, 30)) {
    try {
      const r = await fetch(e.name, { method: 'HEAD' })
      formats[e.name] = r.headers.get('content-type')
    } catch {
      formats[e.name] = 'unknown'
    }
  }
  const svgUrls = [...new Set([...imgs.map((i) => i.currentSrc || i.src), ...[...document.querySelectorAll('object[data], embed[src], use[href]')].map((o) => o.data || o.src || o.getAttribute('href'))]
    .filter((u) => u && /\.svg(\?|#|$)/i.test(u)).map((u) => u.split('#')[0]))]
  const svgWithImage = []
  for (const u of svgUrls.slice(0, 30)) {
    try {
      if (/<image[\s>]/i.test(await (await fetch(u)).text())) svgWithImage.push(u)
    } catch {}
  }
  const images = {
    count: imgs.length,
    missingAlt: imgs.filter((i) => !i.hasAttribute('alt') && i.getAttribute('role') !== 'presentation').map((i) => i.currentSrc || i.src),
    list: cut(imgs.map((i) => ({ src: short(i.currentSrc || i.src, 120), alt: i.getAttribute('alt'), size: `${i.naturalWidth}x${i.naturalHeight}` }))),
    missingSize: [
      ...imgs.filter((i) => raster(i.src) && !(i.hasAttribute('width') && i.hasAttribute('height'))).map((i) => i.currentSrc || i.src),
      ...[...document.querySelectorAll('picture source')].filter((s) => !(s.hasAttribute('width') && s.hasAttribute('height')) && s.closest('picture').querySelectorAll('source').length > 0 && s.media).map((s) => `source ${s.srcset?.split(' ')[0]}`)
    ],
    lazyAboveFold: imgs.filter((i) => i.loading === 'lazy' && !below(i)).map((i) => i.currentSrc || i.src),
    eagerBelowFold: imgs.filter((i) => i.loading !== 'lazy' && below(i)).map((i) => i.currentSrc || i.src),
    formats,
    svgWithImage
  }

  // ─── Audio and video ───
  const mediaEls = [...document.querySelectorAll('video,audio')]
  const media = {
    list: mediaEls.map((m) => ({
      el: desc(m),
      autoplay: m.autoplay,
      muted: m.muted,
      paused: m.paused,
      controls: m.controls,
      duration: m.duration,
      hasAudio: m.tagName === 'AUDIO' || m.mozHasAudio || Boolean(m.webkitAudioDecodedByteCount) || m.audioTracks?.length > 0 || null,
      tracks: [...m.querySelectorAll('track')].map((t) => `${t.kind}:${t.srclang}`)
    })),
    autoplayAudible: mediaEls.filter((m) => (m.autoplay || !m.paused) && !m.muted).map(desc),
    iframes: [...document.querySelectorAll('iframe')].map((f) => short(f.src, 120))
  }

  // ─── Links and buttons ───
  const as = [...document.querySelectorAll('a')]
  const here = location.href.split('#')[0]
  // Japanese and English patterns are both kept because pages may be in either language
  const GENERIC = /^(こちら|ここ|詳しく(は)?|詳細|もっと見る|続きを読む|クリック|more|read more|click here|here|learn more|details?)$/i
  const links = {
    count: as.length,
    list: cut(as.filter((a) => a.href).map((a) => ({ text: short(accName(a).name, 60), href: short(a.getAttribute('href'), 80), target: a.target || undefined, current: a.getAttribute('aria-current') || undefined })), 80),
    noHref: as.filter((a) => !a.hasAttribute('href')).map(desc),
    generic: as.filter((a) => GENERIC.test(accName(a).name)).map((a) => ({ el: desc(a), context: short(text(a.closest('p,li,td,dd') ?? a.parentElement), 120) })),
    navCurrentMissing: navs.flatMap((n) => [...n.querySelectorAll('a[href]')]).filter((a) => a.href.split('#')[0] === here && !a.getAttribute('href').startsWith('#') && !a.hasAttribute('aria-current')).map(desc),
    targetBlank: as.filter((a) => a.target === '_blank').map((a) => ({ el: desc(a), name: accName(a).name, mentionsNewTab: /新しい(タブ|ウィンドウ|ウインドウ)|別(タブ|ウィンドウ|窓)|new (tab|window)|opens in/i.test(accName(a).name + ' ' + (a.getAttribute('title') ?? '')) }))
  }
  const mixedContent = location.protocol === 'https:' ? performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith('http:')) : []
  const btns = [...document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"],input[type="reset"],input[type="image"]')]
  const iconOnly = btns.concat(as.filter((a) => a.href)).filter((b) => visible(b) && !visibleText(b) && !(b.tagName === 'INPUT' && b.type !== 'image'))
  const buttons = {
    missingType: [...document.querySelectorAll('button:not([type])')].map(desc),
    iconOnly: iconOnly.map((b) => ({ el: desc(b), name: accName(b).name, source: accName(b).source })),
    emptyName: btns.filter((b) => !accName(b).name).map(desc),
    list: cut(btns.filter(visible).map((b) => accName(b).name), 60)
  }
  const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"],[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"]'
  const clickableNonInteractive = [...document.querySelectorAll('body *')]
    .filter((el) => !el.matches(INTERACTIVE) && !el.closest('a[href],button,label,summary') && (el.hasAttribute('onclick') || (getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el.parentElement).cursor !== 'pointer')))
    .map(desc)

  // ─── Forms ───
  const ctrls = [...document.querySelectorAll('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]),select,textarea')]
  const groupNames = {}
  for (const c of ctrls.filter((c) => ['radio', 'checkbox'].includes(c.type) && c.name)) (groupNames[c.name] ??= []).push(c)
  const controls = {
    list: cut(ctrls.map((c) => {
      const n = accName(c)
      return { el: desc(c), type: c.type || c.tagName.toLowerCase(), name: n.name, nameSource: n.source, autocomplete: c.getAttribute('autocomplete') || undefined, required: c.required || c.getAttribute('aria-required') === 'true' || undefined, describedby: c.getAttribute('aria-describedby') ? text(document.getElementById(c.getAttribute('aria-describedby').split(' ')[0])) : undefined }
    }), 60),
    unlabeled: ctrls.filter((c) => accName(c).source === 'none').map(desc),
    nameFromTitleOrPlaceholder: ctrls.filter((c) => ['title', 'placeholder'].includes(accName(c).source)).map((c) => `${desc(c)}（${accName(c).source}）`),
    groupsWithoutFieldset: Object.entries(groupNames).filter(([, cs]) => cs.length > 1 && !cs[0].closest('fieldset')?.querySelector('legend') && !cs[0].closest('[role="radiogroup"],[role="group"]')).map(([n]) => n)
  }

  // ─── Names and states ───
  const labelInName = [...document.querySelectorAll(INTERACTIVE)]
    .filter((el) => visible(el) && el.matches('a,button,[role="button"],[role="link"],[role="tab"],[role="menuitem"]'))
    .map((el) => ({ el, vis: visibleText(el), name: accName(el).name }))
    .filter(({ vis, name }) => vis && name && !name.toLowerCase().replace(/\s+/g, ' ').includes(vis.toLowerCase()))
    .map(({ el, vis, name }) => ({ el: desc(el), visible: short(vis, 40), name: short(name, 60) }))
  const ariaLabelOnVisibleText = [...document.querySelectorAll('[aria-label]')].filter((el) => visible(el) && visibleText(el)).map((el) => ({ el: desc(el), ariaLabel: el.getAttribute('aria-label'), visible: short(visibleText(el), 40) }))
  const ariaStates = [...document.querySelectorAll('[aria-expanded],[aria-selected],[aria-pressed],[aria-checked]:not(input)')].map((el) => ({ el: desc(el), expanded: el.getAttribute('aria-expanded') ?? undefined, selected: el.getAttribute('aria-selected') ?? undefined, pressed: el.getAttribute('aria-pressed') ?? undefined, controls: el.getAttribute('aria-controls') ?? undefined }))
  const liveRegions = [...document.querySelectorAll('[aria-live],[role="status"],[role="alert"],[role="log"],output')].map(desc)
  const langParts = [...document.querySelectorAll('body [lang]')].map((el) => `${el.getAttribute('lang')}: ${short(text(el), 40)}`)

  // ─── Tables ───
  const tables = [...document.querySelectorAll('table')].filter((t) => t.getAttribute('role') !== 'presentation').map((t) => ({ el: desc(t), caption: text(t.querySelector('caption')) || null, th: t.querySelectorAll('th').length, thWithoutScope: [...t.querySelectorAll('th')].filter((th) => !th.hasAttribute('scope')).length }))

  // ─── Contrast (per element with visible text) ───
  const textEls = [...document.querySelectorAll('body *')].filter((el) => [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && visible(el) && !visuallyHidden(el) && !hiddenFromAT(el))
  const contrastList = []
  const contrastUnknown = []
  for (const el of textEls.slice(0, 1500)) {
    const cs = getComputedStyle(el)
    const fg = parseColor(cs.color)
    const bg = bgOf(el)
    if (!fg || !bg) {
      contrastUnknown.push(desc(el))
      continue
    }
    const size = parseFloat(cs.fontSize)
    const bold = Number(cs.fontWeight) >= 700
    const large = size >= 24 || (bold && size >= 18.66)
    contrastList.push({ el: desc(el), ratio: ratio(blend(fg, bg), bg), large, fg: hex(blend(fg, bg)), bg: hex(bg), size })
  }
  const contrast = {
    checked: contrastList.length,
    failures: contrastList.filter((c) => c.ratio < (c.large ? 3 : 4.5)),
    unknown: cut(contrastUnknown, 20),
    list: contrastList.filter((c) => c.ratio < (c.large ? 4.5 : 7)).slice(0, 60)
  }
  const uiContrast = ctrls.concat(btns).filter(visible).map((el) => {
    const cs = getComputedStyle(el)
    const border = parseColor(cs.borderTopColor)
    const own = parseColor(cs.backgroundColor)
    const around = bgOf(el.parentElement)
    if (!around) return null
    const edge = parseFloat(cs.borderTopWidth) > 0 && border?.a > 0 ? blend(border, around) : own?.a > 0 ? blend(own, around) : null
    return edge ? { el: desc(el), ratio: ratio(edge, around) } : { el: desc(el), ratio: null, note: 'no border or background' }
  }).filter(Boolean).filter((x) => x.ratio === null || x.ratio < 3)

  // ─── Target size ───
  const targetsAll = [...document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="switch"]')].filter((el) => visible(el) && !visuallyHidden(el) && !hiddenFromAT(el))
  const inline = (el) => el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p,li,td,dd') && text(el.closest('p,li,td,dd')).length > text(el).length + 10
  const sized = targetsAll.filter((el) => !inline(el)).map((el) => ({ el, r: el.getBoundingClientRect() }))
  const targets = {
    under24: sized.filter(({ r }) => r.width < 24 || r.height < 24).map(({ el, r }) => `${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`),
    under44: cut(sized.filter(({ r }) => r.width < 44 || r.height < 44).map(({ el, r }) => `${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`))
  }

  // ─── Layout and motion ───
  const layout = { viewport: `${innerWidth}x${innerHeight}`, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }
  layout.horizontalOverflow = layout.scrollWidth > layout.clientWidth + 1
  // Overflowing elements (excluding those inside horizontally scrolling boxes), so the cause can be noted in findings
  const inScroller = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(n).overflowX)) return true
    return false
  }
  layout.wideElements = layout.horizontalOverflow
    ? [...document.querySelectorAll('body *')].filter((el) => visible(el) && el.getBoundingClientRect().right > layout.clientWidth + 1 && !inScroller(el) && !(el.parentElement && el.parentElement.getBoundingClientRect().right > layout.clientWidth + 1 && !inScroller(el.parentElement))).map((el) => `${desc(el)} right=${Math.round(el.getBoundingClientRect().right)}`).slice(0, 10)
    : []
  const fixedElements = [...document.querySelectorAll('body *')].filter((el) => ['fixed', 'sticky'].includes(getComputedStyle(el).position) && visible(el)).map(desc)
  const sheets = []
  for (const s of document.styleSheets) {
    try {
      sheets.push(...s.cssRules)
    } catch {}
  }
  const ruleText = (rules) => rules.map((r) => r.cssText).join('\n')
  const css = {
    imports: sheets.filter((r) => r instanceof CSSImportRule).map((r) => r.href),
    orientationRules: sheets.filter((r) => r instanceof CSSMediaRule && /orientation/.test(r.conditionText)).map((r) => short(r.cssText, 160))
  }
  const motion = {
    reducedMotionRule: /prefers-reduced-motion/.test(ruleText(sheets.filter((r) => r instanceof CSSMediaRule))),
    runningAnimations: document.getAnimations().filter((a) => a.playState === 'running').length,
    autoplay: [
      ...mediaEls.filter((m) => !m.paused).map(desc),
      ...document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations === Infinity).map((a) => desc(a.effect.target))
    ].slice(0, 20)
  }

  // ─── Focusable elements and reading order ───
  const focusables = [...document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,summary,iframe,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]')].filter((el) => visible(el) && !el.disabled && !el.closest('[inert]'))
  const readingOrder = [...document.querySelectorAll('body > *, main > *, main > * > *')].filter((el) => visible(el) && text(el)).slice(0, 40).map((el) => {
    const r = el.getBoundingClientRect()
    return `${desc(el)} @(${Math.round(r.left)},${Math.round(r.top + scrollY)})`
  })
  const navOrder = [...banner, ...navs, ...contentinfo].map((n) => ({ region: desc(n).split(' ')[0], links: [...n.querySelectorAll('a[href]')].map((a) => short(accName(a).name, 30)) }))
  const breadcrumb = navs.filter((n) => /パンくず|breadcrumb/i.test(n.getAttribute('aria-label') ?? '') || n.querySelector('[aria-current="page"]')).map(desc)
  const textBlocks = [...document.querySelectorAll('main p')].filter(visible).slice(0, 5).map((p) => {
    const cs = getComputedStyle(p)
    const fs = parseFloat(cs.fontSize)
    return { el: desc(p), widthInChars: Math.round(p.getBoundingClientRect().width / fs), lineHeight: cs.lineHeight === 'normal' ? 'normal' : Math.round((parseFloat(cs.lineHeight) / fs) * 100) / 100, textAlign: cs.textAlign, marginBottomRatio: Math.round((parseFloat(cs.marginBottom) / fs) * 100) / 100 }
  })

  // ─── Helper functions (for keyboard and other checks) ───
  const baseStyle = new WeakMap()
  const styleKey = (el) => {
    const cs = getComputedStyle(el)
    return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.backgroundColor, cs.borderColor, cs.textDecorationLine, cs.color].join('|')
  }
  focusables.forEach((el) => baseStyle.set(el, styleKey(el)))
  const obscuredBy = (el) => {
    const r = el.getBoundingClientRect()
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2]]
    const hits = pts.map(([x, y]) => (x < 0 || y < 0 || x > innerWidth || y > innerHeight ? 'offscreen' : document.elementFromPoint(x, y)))
    // If the hit element or an ancestor is fixed / sticky and unrelated to the focused element, the focus is obscured
    const fixedAncestor = (h) => {
      for (let n = h; n && n !== document.body; n = n.parentElement) if (['fixed', 'sticky'].includes(getComputedStyle(n).position)) return n
      return null
    }
    const covered = hits.map((h) => {
      if (h === 'offscreen' || !h || el.contains(h) || h.contains(el)) return null
      const f = fixedAncestor(h)
      return f && !f.contains(el) ? desc(f) : null
    })
    return { all: covered.every(Boolean), some: covered.some(Boolean), by: covered.find(Boolean) ?? null }
  }
  const activeInfo = (el = document.activeElement) => {
    if (!el || el === document.body) return { el: 'body' }
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const o = obscuredBy(el)
    const oc = parseColor(cs.outlineColor)
    const around = bgOf(el.parentElement ?? el)
    return {
      el: desc(el),
      name: short(accName(el).name, 60),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      visible: r.width > 1 && r.height > 1 && !visuallyHidden(el),
      indicator: baseStyle.has(el) ? baseStyle.get(el) !== styleKey(el) : null,
      outlineWidth: cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth),
      outlineContrast: oc && around && cs.outlineStyle !== 'none' ? ratio(blend(oc, around), around) : null,
      obscured: o.all,
      partlyObscured: o.some,
      obscuredBy: o.by,
      inDialog: Boolean(el.closest('dialog,[role="dialog"],[role="alertdialog"]')),
      url: location.href
    }
  }
  let log = []
  // Record when focus moves (requestAnimationFrame is not used because it stops in background tabs)
  const onFocus = (e) => log.push(activeInfo(e.target))
  window.__wga = {
    version: 1,
    active: () => activeInfo(),
    startFocusLog() {
      log = []
      document.removeEventListener('focusin', onFocus, true)
      document.addEventListener('focusin', onFocus, true)
      document.activeElement?.blur?.()
      return 'Focus log started. Press Tab, then read __wga.focusLog()'
    },
    focusLog() {
      const reached = new Set(log.map((x) => x.el))
      return {
        steps: log,
        notReached: focusables.map(desc).filter((d) => !reached.has(d)),
        noIndicator: log.filter((x) => x.indicator === false).map((x) => x.el),
        obscured: log.filter((x) => x.obscured).map((x) => `${x.el} ← ${x.obscuredBy}`),
        partlyObscured: log.filter((x) => x.partlyObscured).map((x) => `${x.el} ← ${x.obscuredBy}`)
      }
    },
    // Current values of state attributes (compare before and after an interaction)
    states: () =>
      [...document.querySelectorAll('[aria-expanded],[aria-selected],[aria-pressed],[aria-current]')].map((el) => {
        const target = el.getAttribute('aria-controls') && document.getElementById(el.getAttribute('aria-controls').split(' ')[0])
        return { el: desc(el), expanded: el.getAttribute('aria-expanded') ?? undefined, selected: el.getAttribute('aria-selected') ?? undefined, pressed: el.getAttribute('aria-pressed') ?? undefined, current: el.getAttribute('aria-current') ?? undefined, controlsVisible: target ? visible(target) : undefined }
      }),
    async checkLinks(limit = 60) {
      const urls = [...new Set(as.map((a) => a.href.split('#')[0]).filter((u) => u.startsWith(location.origin)))].slice(0, limit)
      const broken = []
      for (const u of urls) {
        const s = await status(u)
        if (typeof s !== 'number' || s >= 400) broken.push({ url: u, status: s })
      }
      return { checked: urls.length, broken }
    },
    async notFound() {
      const u = new URL(`/__wga-not-found-${Date.now()}`, location.origin).href
      const res = await fetch(u)
      const html = await res.text()
      const d = new DOMParser().parseFromString(html, 'text/html')
      return { url: u, status: res.status, banner: Boolean(d.querySelector('header,[role="banner"]')), contentinfo: Boolean(d.querySelector('footer,[role="contentinfo"]')), title: d.title }
    },
    grayscale(on) {
      document.documentElement.style.filter = on ? 'grayscale(1)' : ''
      return on ? 'grayscale on' : 'grayscale off'
    },
    textZoom(scale) {
      document.documentElement.style.fontSize = scale === 1 ? '' : `${scale * 100}%`
      return `font-size ${scale * 100}%`
    },
    textSpacing(on) {
      let s = document.getElementById('__wga-spacing')
      if (on && !s) {
        s = document.createElement('style')
        s.id = '__wga-spacing'
        s.textContent = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}'
        document.head.append(s)
      }
      if (!on) s?.remove()
      return on ? 'text spacing on' : 'text spacing off'
    },
    // Elements whose content is clipped (overflow: hidden with content wider or taller than the box)
    clipped() {
      return [...document.querySelectorAll('body *')]
        .filter((el) => visible(el) && !visuallyHidden(el) && text(el))
        .filter((el) => {
          const cs = getComputedStyle(el)
          return (/(hidden|clip)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) || (/(hidden|clip)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1)
        })
        .map(desc)
        .slice(0, 30)
    },
    animations: () => document.getAnimations().filter((a) => a.playState === 'running').map((a) => desc(a.effect?.target)),
    // Send mousedown only (no mouseup or click) to find controls that act on press alone
    pressOnly(selector) {
      const el = document.querySelector(selector)
      if (!el) return 'not found'
      const before = location.href
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      return { el: desc(el), urlChanged: location.href !== before }
    },
    // Event-name hints in scripts (handlers added with addEventListener cannot be listed from outside, so search the source text)
    async listenerHints() {
      const srcs = [...document.scripts].map((s) => (s.src ? s.src : null))
      let all = [...document.scripts].filter((s) => !s.src).map((s) => s.textContent).join('\n')
      for (const s of srcs.filter((u) => u && u.startsWith(location.origin)).slice(0, 20)) {
        try {
          all += await (await fetch(s)).text()
        } catch {}
      }
      return Object.fromEntries(['devicemotion', 'deviceorientation', 'keydown', 'keypress', 'paste', 'mousedown', 'pointerdown', 'touchstart'].map((k) => [k, all.includes(k)]))
    }
  }

  return {
    url: location.href,
    probedAt: new Date().toISOString(),
    viewport: layout.viewport,
    doc,
    headings,
    landmarks,
    duplicateIds,
    sectionsWithoutHeading,
    images,
    media,
    links,
    mixedContent,
    buttons,
    clickableNonInteractive: cut(clickableNonInteractive, 20),
    controls,
    labelInName,
    ariaLabelOnVisibleText: cut(ariaLabelOnVisibleText, 20),
    ariaStates: cut(ariaStates, 20),
    liveRegions,
    langParts: cut(langParts, 20),
    tables,
    contrast,
    uiContrast: cut(uiContrast, 20),
    targets: { under24: cut(targets.under24, 30), under44: targets.under44 },
    layout,
    fixedElements,
    css,
    motion,
    focusables: { count: focusables.length, positiveTabindex: focusables.filter((el) => el.tabIndex > 0).map(desc), list: cut(focusables.map(desc), 80) },
    readingOrder,
    navOrder,
    breadcrumb,
    textBlocks
  }
}
