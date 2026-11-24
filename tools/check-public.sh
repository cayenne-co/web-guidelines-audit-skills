#!/bin/sh
# Blocks content that must not reach this public repository.
# Usage: tools/check-public.sh [<commit>]   (default: the working tree's tracked files, i.e. HEAD + staged)
# Exceptions: add the exact line or pattern to tools/public-allow.txt with a reason in the pull request.
set -u
REF="${1:-}"
ALLOW="$(dirname "$0")/public-allow.txt"
FLAG="$(mktemp)"
trap 'rm -f "$FLAG"' EXIT

list_files() {
  if [ -n "$REF" ]; then git ls-tree -r --name-only "$REF"; else git ls-files; fi
}
grep_files() { # $1 = extended regex; prints file:line:text
  if [ -n "$REF" ]; then git grep -nIE -e "$1" "$REF" -- . ':!tools/check-public.sh' ':!tools/public-allow.txt' | sed "s|^$REF:||"
  else git grep -nIE -e "$1" -- . ':!tools/check-public.sh' ':!tools/public-allow.txt'; fi
}
filter_allowed() {
  if [ -f "$ALLOW" ]; then grep -vF -f "$ALLOW" || true; else cat; fi
}
report() { # $1 = title; stdin = hits
  hits="$(filter_allowed)"
  if [ -n "$hits" ]; then
    printf '\n[check-public] %s\n%s\n' "$1" "$hits" >&2
    echo 1 > "$FLAG"
  fi
}

# 1. Files that must never be tracked: secrets, keys, audit output, screenshots
list_files | grep -E '(^|/)\.env(\..*)?$|\.(pem|key|p12|pfx|keystore)$|(^|/)id_(rsa|ed25519|ecdsa)|(^|/)(findings|probe-[^/]*)\.json$|-ai\.json$|\.(png|jpe?g|gif|webp|har)$|^web-guidelines-audit/' \
  | report 'Files that must not be published (secrets, keys, audit output or screenshots)'

# 2. Secrets and credentials
grep_files '-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|(password|passwd|secret|api[_-]?key|access[_-]?token)["'"'"' ]*[:=] *["'"'"'][^"'"'"' ]{6,}' \
  | report 'Possible secrets or credentials'

# 3. URLs outside the allowed hosts (real client sites must not appear; use example.com)
grep_files 'https?://[A-Za-z0-9.-]+' \
  | grep -vE 'https?://([A-Za-z0-9-]+\.)*example\.(com|org|net)|https?://(localhost|127\.0\.0\.1)([:/]|$)|https?://github\.com/cayenne-co/web-guidelines-audit-skills|https?://(semver\.org|www\.w3\.org|validator\.w3\.org|docs\.github\.com)' \
  | grep -E 'https?://' \
  | report 'URLs on hosts that are not allowed (use example.com for examples)'

# 4. E-mail addresses other than example domains
grep_files '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}' \
  | grep -vE '@([A-Za-z0-9-]+\.)*example\.(com|org|net)|noreply@anthropic\.com' \
  | report 'E-mail addresses (use name@example.com)'

# 5. Wording about internal matters (Japanese terms are the specification here)
grep_files '社内|自社|社外秘|部外秘|confidential|internal only|取引先|顧客名|クライアント名' \
  | report 'Wording about internal matters'

# 6. Private IP addresses and internal host names
grep_files '(^|[^0-9.])(10\.[0-9]+\.[0-9]+\.[0-9]+|192\.168\.[0-9]+\.[0-9]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+)([^0-9.]|$)|\.(local|internal|corp|lan)([:/"'"'"' ]|$)' \
  | report 'Private IP addresses or internal host names'

if [ -s "$FLAG" ]; then
  printf '\n[check-public] Blocked. Remove the content above, or, if it is safe to publish, add the exact text to tools/public-allow.txt.\n' >&2
  exit 1
fi
echo '[check-public] OK'
