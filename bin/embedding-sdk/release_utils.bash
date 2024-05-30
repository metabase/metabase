#!/bin/bash
function update_readme() {
  sed -i -E 's|(embedding-sdk-)[0-9.]+|\1'"$1"'|' enterprise/frontend/src/embedding-sdk/README.md
  sed -i -E 's|(http://downloads.metabase.com/sdk/v)[0-9.]+|\1'"$1"'|' enterprise/frontend/src/embedding-sdk/README.md
}

function update_package_json_template() {
  sed -i -E 's/("version": ").*"/\1'"$1"'"/' enterprise/frontend/src/embedding-sdk/package.template.json
}

$1 $2
