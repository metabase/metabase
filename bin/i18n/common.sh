#!/usr/bin/env bash

I18N_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
I18N_CACHE="$I18N_ROOT/locales/metabase-i18n"
I18N_PIN="$I18N_ROOT/locales/metabase-i18n.commit"
I18N_REPOSITORY="${METABASE_I18N_REPOSITORY:-https://github.com/ChrisVandoo/metabase-i18n.git}"

i18n_commit() {
  local commit="${1:-$(cat "$I18N_PIN")}"
  if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Expected a full commit SHA in $I18N_PIN, got: $commit" >&2
    return 1
  fi
  printf '%s\n' "$commit"
}

i18n_clone() {
  local commit="$1" destination="$2"
  git clone --quiet --no-checkout --depth 1 "$I18N_REPOSITORY" "$destination" >&2
  git -C "$destination" fetch --quiet --depth 1 origin "$commit" >&2
  git -C "$destination" checkout --quiet --detach "$commit" >&2
  test "$(git -C "$destination" rev-parse HEAD)" = "$commit"
  test -f "$destination/locales/metabase.po"
  test -f "$destination/locales/en-ZZ.po"
}
