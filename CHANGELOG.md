# Changelog

All notable changes to this skill. Versions follow [Semantic Versioning](https://semver.org/).
"Guidelines" shows the guidelines versions each release supports.

## 0.3.2

Guidelines: `>=1.0.0 <2.0.0`

- Fixed: `checkLinks()` skips logout and delete-style links, because it requests links with the signed-in session, and lists them in `skipped`.

## 0.3.1

Guidelines: `>=1.0.0 <2.0.0`

- Fixed: `SKILL.md` uses the record sheet's current column name 「AI 判定（参考）」 ("AI result (reference)").

## 0.3.0

Guidelines: `>=1.0.0 <2.0.0`

- Changed: supports guidelines 1.x (the first published version) and no longer 0.6.x.
- Changed: `SKILL.md` uses the guidelines' names for AI involvement (Decides / Assists / Cannot) and the checklist app's current labels, notes that only `auto` results may be adopted as the verdict, and asks for the browser and tool in each note.
- Added: how to check items whose `unit` is `build`.

## 0.2.0

Guidelines: `>=0.6.0 <0.7.0`

- `probe.js`: `targets.under24Crowded` and `targets.under24Spaced` split the targets under 24px by the WCAG 2.5.8 spacing exception (a 24px circle centered on each must not overlap another target or another small target's circle). `targets.under24` is kept.
- Supported guidelines move to 0.6.x, where `QA-55` (target size) is MUST and its AI steps use `under24Crowded`.

## 0.1.0

Guidelines: `>=0.1.0 <0.2.0`

- Initial release: `SKILL.md`, `scripts/probe.js`, `scripts/workfile.mjs`.
