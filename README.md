# web-guidelines-audit

[日本語](README.ja.md)

An AI agent skill that opens pages in a browser and checks them against the Web Guidelines checklists (Page Quality and Accessibility).
The results become a checklist work file (JSON), which a reviewer loads into the checklist app (`/checklist-app`) to confirm.

## Structure

```text
skills/
  web-guidelines-audit/
    SKILL.md         # Instructions
    scripts/
      probe.js       # Runs inside the page and collects values
      workfile.mjs   # Builds the work file from findings.json
```

## Installation

Copy the skill folder into your Claude Code skills folder.

```bash
git clone https://github.com/cayenne-co/web-guidelines-audit-skills.git
cp -R web-guidelines-audit-skills/skills/web-guidelines-audit ~/.claude/skills/
```

## Requirements

- A browser automation tool (Claude in Chrome or Playwright MCP)
- Node.js 18 or later (to run `workfile.mjs`)
- A Web Guidelines site (the skill reads `/checklist.json`)

## Versions

- The skill version is `metadata.version` in `skills/web-guidelines-audit/SKILL.md`. Release tags (`vX.Y.Z`) match it.
- `metadata.guidelines` is the range of guidelines versions the skill supports (e.g. `>=0.1.0 <0.2.0`).
- `workfile.mjs` prints the skill version and warns when the guidelines version is outside that range.
- Changes are listed in [CHANGELOG.md](CHANGELOG.md).

Check the installed version:

```bash
grep -A2 '^metadata:' ~/.claude/skills/web-guidelines-audit/SKILL.md
```

## Updating

Pull the latest release (or check out a specific tag) and copy the skill folder again.

```bash
cd web-guidelines-audit-skills
git fetch --tags
git checkout vX.Y.Z   # or: git checkout main && git pull
rm -rf ~/.claude/skills/web-guidelines-audit
cp -R skills/web-guidelines-audit ~/.claude/skills/
```

Pick the release whose `guidelines` range includes the version of the guidelines site you audit against.

## Safety

The skill audits only sites the user has approved, and stays read-only. It never submits forms, signs in, or enters personal data.
See "Rules" in `skills/web-guidelines-audit/SKILL.md` for details.

## License

[MIT](LICENSE)
