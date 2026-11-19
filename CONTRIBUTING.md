# Contributing

## Branches

- Keep `main` releasable at all times. Do not commit to it directly.
- Branch off `main` and merge back through a pull request.
  - `feat/<topic>`: new items, steps, or functions
  - `fix/<topic>`: bug fixes
  - `docs/<topic>`: README or documentation only
  - `chore/<topic>`: configuration or structure
- Delete the branch after merging.

## Commits

Follow Conventional Commits.

```text
feat(probe): add check for focus not obscured
fix(workfile): keep page order from record.pages
```

## Versions

The single source of truth is `metadata` in `skills/web-guidelines-audit/SKILL.md`:

- `version`: the skill version, following Semantic Versioning (while `0.x`, bump minor for breaking changes).
  - major: the shape of `findings.json` or the work file changes, or the skill stops supporting a guidelines version it used to
  - minor: new checks, steps, or `__wga` functions
  - patch: fixes and wording that do not change results
- `guidelines`: the supported guidelines versions, as space-separated comparators (`>=0.1.0 <0.2.0`). Widen or move it when the guidelines' `checklist.json` changes, and test against that version.

Do not edit tags or the version outside the release steps below.

## Release steps

1. On a branch, bump `metadata.version` (and `metadata.guidelines` if needed) in `SKILL.md`.
2. Add a section for the new version at the top of `CHANGELOG.md` with its `Guidelines` range.
3. Open a pull request and merge it into `main`.
4. Tag the merge commit on `main` and push the tag:
   ```bash
   git checkout main && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
5. Optionally create a GitHub Release from the tag, pasting the changelog section.

Never move or delete a pushed tag; release a new patch version instead.

## What may be published

- Never include real client names, URLs, or credentials (use `example.com`).
- Do not include wording that refers to a specific organization's internal matters.
