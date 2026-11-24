# Contributing

## How changes reach `main`

Every change reaches `main` through a pull request. A ruleset on GitHub enforces this for `main`: no direct pushes, no force pushes, no deletion. Repository admins can bypass it (see [Rewriting history](#rewriting-history)).

- Open pull requests in the browser. Creating them with the `gh` command (or other API clients) is refused by the organization's settings.
- Merge with **Squash and merge**, so each pull request becomes one commit on `main` and `main` stays linear. Merge commits are turned off.

## Branches

- Do every change on a branch off `main`.
  - `feat/<topic>`: new items, steps, or functions
  - `fix/<topic>`: bug fixes
  - `docs/<topic>`: README or documentation only
  - `chore/<topic>`: configuration or structure
- Push the branch, then open a pull request in the browser (GitHub shows a **Compare & pull request** button after the push).
- Write the pull request title in Conventional Commits form; it becomes the commit message on `main`.
- After merging, delete the branch on GitHub (the button on the pull request) and locally (`git branch -d <branch>` after `git pull` on `main`).

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

1. On the branch, bump `metadata.version` (and `metadata.guidelines` if needed) in `SKILL.md`.
2. Add a section for the new version at the top of `CHANGELOG.md` with its `Guidelines` range.
3. Open the pull request and merge it with **Squash and merge**. Put the version in the title, e.g. `feat(probe): split targets under 24px by the spacing exception (0.2.0)`.
4. Tag the resulting commit on `main` with an annotated tag, and push only that tag (tags are not covered by the pull request rule):
   ```bash
   git checkout main && git pull --ff-only
   git log --oneline -1   # check that this is the merged pull request with the version bump
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
5. Optional: create a GitHub Release in the browser (Releases → Draft a new release → choose the tag) and paste the changelog section.

Changes that are not releases (README wording, for example) go through a pull request the same way, without a tag; the next release includes them.

## Rewriting history

The repository has a single maintainer, so `main` and tags may be rewritten to keep the history clean (one commit per change, each release tag on its version bump commit).

- Only a repository admin does it, using the ruleset bypass. Everyone else follows the pull request flow.
- Use `git push --force-with-lease origin main`, never a plain `--force`, so a change you have not fetched is not overwritten.
- When moving a tag, delete it on GitHub and push it again: `git push origin :refs/tags/vX.Y.Z` and then `git push origin vX.Y.Z`.
- Check the result with `tools/check-public.sh` before pushing; a rewrite publishes the new commits like any other push.
- Once someone else clones or depends on the repository, stop rewriting `main` and published tags, and fix mistakes with a new patch version instead.

## What may be published

This repository is public. Anything pushed, even to a branch and even if deleted later, can be copied, cached, and indexed. Treat every push as publication.

### Never push

- Secrets: passwords, API keys, tokens, private keys, `.env` files.
- Real client names, real site URLs, e-mail addresses, or internal host names and IP addresses. Use `example.com` and `name@example.com`.
- Audit output: `findings.json`, `probe-*.json`, work files (`*-ai.json`), screenshots. They show real sites and are ignored by `.gitignore`.
- Wording that refers to a specific organization's internal matters.

### The pre-push check

`tools/check-public.sh` scans every commit you push and blocks the push when it finds any of the above. Turn it on once per clone:

```bash
git config core.hooksPath .githooks
```

- Run it by hand at any time: `tools/check-public.sh`.
- If it blocks something that is safe to publish (a public standards URL, for example), add the exact text to `tools/public-allow.txt` in the same branch and say why in the commit message.
- Do not bypass it with `git push --no-verify`.
- If a commit you have not pushed yet contains something unsafe, rewrite that commit (`git commit --amend` or `git rebase -i`) before pushing. Removing it in a later commit is not enough, because the old commit would still be pushed.

### If something unsafe was pushed

1. Revoke or rotate the secret first. Deleting it from Git does not make it safe.
2. Tell the repository administrator. Rewriting public history needs their decision.

GitHub secret scanning is a second line of defense. It covers only known secret formats, not URLs or wording.
