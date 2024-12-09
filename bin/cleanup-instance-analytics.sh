#!/usr/bin/env bash

set -eE -o errexit -o functrace

### Utility

failure() {
  local lineno=$1
  local msg=$2
  echo "Failed at $lineno: $msg"
}

trap 'failure ${LINENO} "$BASH_COMMAND"' ERR

err() {
    echo "Error: $1"
    exit 1
}

rename() {
    dirname=$(dirname "$1")
    basename=$(basename "$1")

    target="${basename//$2/$3}"
    mv "$1" "${dirname}/${target}"
}

### Main

main() {
    target="${1}"
    if [ -z "${target}" ]; then
        echo "Usage: $0 path/to/export"
        exit 0
    fi


    if [ ! -d "${target}/collections" ]; then
        err "No 'collections' directory in '${target}'"
    fi

    find "${target}"/databases -maxdepth 1 -mindepth 1 \
         -name audit_development_app_db -prune \
         -o -exec rm -rf "{}" \;

    find "${target}"/databases/audit_development_app_db/schemas/public/tables -maxdepth 1 -mindepth 1 \
         -name "v_*" -prune \
         -o -exec rm -rf "{}" \;

    old_db="audit_development_app_db"
    new_db="Internal Metabase Database"

    old_coll="audit_internal_col_id"
    new_coll="vG58R8k-QddHWA7_47umn"

    # Replace database_name and collection_id
    find "${target}" -depth -name "*${old_db}*" | while IFS= read -r path; do rename "${path}" "${old_db}" "${new_db}"; done
    find "${target}" -depth -name "*${old_coll}*" | while IFS= read -r path; do rename "${path}" "${old_coll}" "${new_coll}"; done
    find "${target}" -name '*.yaml' -exec sed -i '' "s/${old_db}/${new_db}/g" {} \;
    find "${target}" -name '*.yaml' -exec sed -i '' "s/${old_coll}/${new_coll}/g" {} \;
}

main "$@"
