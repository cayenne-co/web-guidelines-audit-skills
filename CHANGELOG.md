# Changelog

All notable changes to this skill. Versions follow [Semantic Versioning](https://semver.org/).
"Guidelines" shows the guidelines versions each release supports.

## 0.2.0

Guidelines: `>=0.6.0 <0.7.0`

- `probe.js`: `targets.under24Crowded` and `targets.under24Spaced` split the targets under 24px by the WCAG 2.5.8 spacing exception (a 24px circle centered on each must not overlap another target or another small target's circle). `targets.under24` is kept.
- Supported guidelines move to 0.6.x, where `QA-55` (target size) is MUST and its AI steps use `under24Crowded`.

## 0.1.0

Guidelines: `>=0.1.0 <0.2.0`

- Initial release: `SKILL.md`, `scripts/probe.js`, `scripts/workfile.mjs`.
