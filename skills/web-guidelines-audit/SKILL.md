---
name: web-guidelines-audit
description: Inspects live or in-development pages in a browser against the Web Guidelines checklists (Page Quality and Accessibility) and writes the AI results to a checklist work file (JSON). Use for requests such as "audit this page with the guidelines", "check the checklist with AI", "run an AI accessibility check", "ガイドラインで検査して", "チェックリストを AI で確認", or "アクセシビリティを AI でチェック". Requires a browser automation tool (Claude in Chrome or Playwright MCP).
metadata:
  version: 0.2.0
  guidelines: ">=0.6.0 <0.7.0"
---

# web-guidelines-audit

Opens pages in a browser and checks the items of the guidelines checklist (`/checklist.json`).
The results become a checklist work file, which a reviewer loads into the checklist app (`/checklist-app`) to confirm.

The skill version and the supported guidelines versions are in `metadata` above. If `scripts/workfile.mjs` warns that the guidelines version is outside the supported range, tell the user and suggest updating the skill.

## Rules (follow these first)

1. **Only audit sites you have been cleared to audit.** Limit the audit to sites the user named in this conversation and said may be audited. Do not follow links to other domains (except checking the status of same-site links).
2. **Stay read-only.** Do not submit forms. Do not purchase, book, contact, or log in. Do not enter passwords, personal data, or real values into fields. Do not clear cookies or storage. Make page-altering changes (grayscale, text spacing, etc.) only through the `__wga` functions, and revert them after the check.
3. **Let the user open pages that require sign-in.** If a login screen appears, stop and ask the user to sign in in the browser, then continue. Never ask for or enter IDs or passwords.
4. **AI results are advisory.** Do not write to the work file's `verdict`. Put results in `ai` (pass / fail / not applicable) and `ai_note` (evidence). The reviewer sets the verdict after checking the evidence.
5. **Do not send pages to external services.** Send URLs or HTML to services such as the W3C Nu HTML Checker only for live pages the user has approved.

## Inputs

Before starting, confirm the following with the user (ask only for what is unknown).

| Item | Example |
| --- | --- |
| Target pages | Pairs of name and URL, one per distinct page type (top, list, detail, form, etc.). These become the work file's target pages |
| Audit type | `live`: audit of a live site (Accessibility QA items and Page Quality items checked in the browser). `build`: page in development (same items on the dev environment) |
| Conformance level | `A` / `AA` (default) / `AAA`. Check MAY items only for AAA |
| Guidelines site | Where to read `checklist.json`. e.g. `https://web-guidelines.example.com`, or `http://localhost:5173` in development |
| Project and reviewer | Stored in the work file's `record` |
| External validators | Whether pages may be sent to the Nu HTML Checker (default: no) |

## Tools

- **Claude in Chrome**: `navigate`, `javascript_tool`, `computer` (`key` for Tab / Enter / Escape, `screenshot`), `resize_window`, `read_page`
- **Playwright MCP**: `browser_navigate`, `browser_evaluate`, `browser_press_key`, `browser_take_screenshot` (save with `filename`), `browser_resize`

`scripts/probe.js` is a function that runs inside the page.
In Chrome, pass `await (<contents of probe.js>)()` to `javascript_tool`; in Playwright, pass the contents as is to `function` of `browser_evaluate`.
It returns the collected values and places helper functions on `window.__wga` (run it again after reloading the page).

| Function | Items |
| --- | --- |
| `__wga.startFocusLog()` → press Tab → `__wga.focusLog()` | Focus order, unreachable elements, focus visibility, obscured focus (QA-01, 04, 05, 07, 44, 45, 76, 94) |
| `__wga.active()` | Element that currently has focus (QA-10, STR-10) |
| `__wga.states()` | Current values of `aria-expanded` etc. (QA-06, 24) |
| `__wga.checkLinks()` | Status of same-site links (LNK-05) |
| `__wga.notFound()` | Response for a non-existent URL (PRF-05) |
| `__wga.grayscale(true/false)` | Grayscale the page (QA-31, 42) |
| `__wga.textSpacing(true/false)`, `__wga.textZoom(2/1)`, `__wga.clipped()` | Change text spacing and size and look for clipping (QA-51, 60) |
| `__wga.animations()`, `__wga.listenerHints()`, `__wga.pressOnly(selector)` | Hints about motion and events (QA-12, 13, 47, 71, 93) |

## Steps

1. **Select items.** Read `/checklist.json` from the guidelines site and keep these items:
   - Items whose `needs` is `browser` (Page Quality items checked in the browser, and Accessibility QA). Skip `code` / `docs` items.
   - Items whose `ai` is `auto` or `assist`. Skip `none` (the reason is in `ai_why`).
   - Drop items whose `severity` is `MAY`, unless the level is AAA.
   - Check items with `same_as` together with the referenced item (`ai_steps` says "same as …").
   - Check items whose `unit` is `site` only once per site.
2. **Create a work folder.** Put `probe-<name>.json` per page and screenshots in `web-guidelines-audit/<yyyy-mm-dd>/`.
3. **Check each page.** For each URL:
   1. Open the page. If it is a login screen, stop and ask the user (rule 3).
   2. Take a screenshot at 1280px wide.
   3. Run `probe.js` and save the result to `probe-<name>.json`.
   4. Keyboard check: reload, run `probe.js`, call `__wga.startFocusLog()`, then press Tab 40 times at a time and read `__wga.focusLog()`, until `notReached` is empty or focus returns to the top (focus also stops on elements outside the visible `focusables`, so expect more presses than the count). Also go back a few steps with Shift+Tab.
   5. If there are disclosures or dialogs, operate them with the keyboard and check with `__wga.states()` and `__wga.active()` (never press submit buttons).
   6. Resize to 320px wide, run `probe.js` again, and check `layout`, `__wga.clipped()`, and a screenshot. Restore the width afterwards.
   7. Judge each item following its `ai_steps`.
4. **Write results.** Add one entry per item to `results` in `findings.json`:
   - `auto` items: if the steps decide the outcome, set `ai` to `pass` / `fail` / `na` (the item's applicability condition is not met).
   - `assist` items: put the proposed result in `ai`, start `note` with "Proposed: ", and state what the reviewer should confirm.
   - If you cannot judge, omit `ai` and give the reason in `note` (e.g. Lighthouse unavailable).
   - Write `note` in the user's language (the language of their request).
   - In `note`, include measured values, the relevant elements (as in `el` from `probe`), and screenshot file names. Never write a result without evidence.
   - Claude in Chrome cannot save screenshots to files. In that case leave `evidence` empty and write "Checked by screenshot (not saved)" in `note`.
5. **Build the work file.**
   ```bash
   node <this skill's folder>/scripts/workfile.mjs --guidelines <guidelines site> --findings web-guidelines-audit/<date>/findings.json --out web-guidelines-audit/<date>/<project>-ai.json
   ```
6. **Report** in the user's language. Briefly give the counts of pass, fail, not applicable, and not judged, list the failed items (ID and summary), and point to the work file. Tell the reviewer how to use it:
   - Open it in the checklist app (`/checklist-app` on the guidelines site) with "Load work file".
   - Check the "AI result (advisory)" and evidence on each row, and set the verdict.
   - When exported to the record sheet (Excel), AI results appear in the "AI result (advisory, not counted)" column.

## Shape of findings.json

```json
{
  "record": {
    "project": "Example project",
    "site": "https://www.example.com",
    "pages": [
      { "name": "Top", "url": "https://www.example.com/" },
      { "name": "News", "url": "https://www.example.com/news/" },
      { "name": "Contact", "url": "https://www.example.com/contact/" }
    ],
    "scope": "both",
    "kind": "live",
    "target": "AA",
    "reviewer": "AI (Claude Code)",
    "browsers": "Chrome 142"
  },
  "results": [
    { "id": "QA-18", "url": "https://www.example.com/", "ai": "pass", "note": "One h1 (\"Example\"). No skipped heading levels (probe headings.skips: 0)", "evidence": ["top-1280.png"] },
    { "id": "QA-21", "url": "https://www.example.com/", "ai": "fail", "note": "Proposed: button.menu-toggle has an empty name. Confirm a name such as \"Menu\"", "evidence": [] }
  ]
}
```

The ID prefix decides the domain (Page Quality: `DOC` `STR` `LNK` `IMG` `FRM` `PRF`; Accessibility: `IA` `DS` `DEV` `QA` `OPS`).
When the same item is checked on several pages, write one entry per page (a single failing page makes the item fail).
If `record.pages` is omitted, target pages are built from the `url` of `results` (name = path). The reviewer picks which page failed in the checklist app's "Page" column, so begin each line of `ai_note` with the page (the script prefixes `[path]`).
