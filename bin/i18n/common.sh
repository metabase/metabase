#!/usr/bin/env bash

I18N_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
I18N_CACHE="$I18N_ROOT/locales/metabase-i18n"
I18N_PIN="$I18N_ROOT/locales/translations.pin"
I18N_URL="${METABASE_I18N_URL:-https://d3rmfk6uwjyg5s.cloudfront.net/translations}"
I18N_BUCKET="${METABASE_I18N_BUCKET:-metabase-ci-infra}"
I18N_PREFIX="${METABASE_I18N_PREFIX:-translations}"

i18n_pin() {
  local pin="${1:-$(cat "$I18N_PIN")}"
  if [[ ! "$pin" =~ ^(latest|v[0-9]+)/[0-9a-f]{40}$ ]]; then
    echo "Expected <version>/<commit> in $I18N_PIN, got: $pin" >&2
    return 1
  fi
  printf '%s\n' "$pin"
}

i18n_snapshot() {
  printf '%s\n' "$I18N_CACHE/${1/\//-}"
}

i18n_download() {
  local pin="$1" destination="$2"
  mkdir -p "$destination"
  curl -fsSL "$I18N_URL/$pin.tar.gz" | tar -xz -C "$destination"
  test -f "$destination/metabase.po"
}
