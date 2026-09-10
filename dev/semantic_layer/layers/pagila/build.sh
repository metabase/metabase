#!/usr/bin/env bash
# Pagila semantic layer. load.py runs this with MB_PROFILE, MB_URL, SL_SCHEMA, SL_WAREHOUSE_DB_ID, SL_LAYER_DIR set.
# The instance is pristine on every `make layer-fresh`, so nothing here is idempotent.
#
# Body files are JSON templates. `render` swaps id tokens for the ids the instance hands out at run time:
#   {{db}}  {{t:<table>}}  {{f:<table>.<field>}}  {{c:<collection>}}  {{card:questions/<slug>}}  {{transform:<name>}}
# A token that is the whole string becomes a number; a token inside a longer string is spliced as text.
set -euo pipefail
cd "$SL_LAYER_DIR"
P=(--profile "$MB_PROFILE")
DB="$SL_WAREHOUSE_DB_ID"
TABLES=(rentals payments films customers)
mkdir -p .scratch
IDS=.scratch/ids.json
echo "{\"db\": $DB}" > "$IDS"

say()   { printf '\033[1;34m[pagila]\033[0m %s\n' "$*"; }
die()   { printf '\033[1;31m[pagila] error:\033[0m %s\n' "$*" >&2; exit 1; }
setid() { jq --arg k "$1" --argjson v "$2" '. + {($k): $v}' "$IDS" > "$IDS.tmp" && mv "$IDS.tmp" "$IDS"; }
getid() { jq -r --arg k "$1" '.[$k] // empty' "$IDS"; }
render() {
  local out=".scratch/$(basename "$(dirname "$1")")-$(basename "$1")"
  jq --slurpfile ids "$IDS" '
    def lookup: . as $k | $ids[0][$k] // error("unresolved id token: " + $k);
    walk(if type == "string" then
           if test("^\\{\\{[^}]+\\}\\}$") then .[2:-2] | lookup
           else gsub("\\{\\{(?<k>[^}]+)\\}\\}"; .k | lookup | tostring) end
         else . end)' "$1" > "$out" && echo "$out"
}

# ---- 1. transforms: raw OLTP tables -> one wide table per thing ---------------------------------------------
say "creating transforms"
for name in "${TABLES[@]}"; do
  jq -n --rawfile q "transforms/$name.sql" --arg name "$name" --argjson db "$DB" --arg schema "$SL_SCHEMA" \
        --arg desc "$(head -1 "transforms/$name.sql" | sed 's/^-- //')" \
    '{name: $name, description: $desc,
      source: {type: "query", query: {"lib/type": "mbql/query", database: $db, stages: [{"lib/type": "mbql.stage/native", native: $q}]}},
      target: {type: "table", database: $db, schema: $schema, name: $name}}' > ".scratch/transform-$name.json"
  id=$(mb transform create --file ".scratch/transform-$name.json" "${P[@]}" --json | jq -r .id)
  setid "transform:$name" "$id"
done
for name in "${TABLES[@]}"; do
  say "running transform $name"
  result=$(mb transform run "$(getid "transform:$name")" --wait "${P[@]}" --json) || true
  status=$(echo "$result" | jq -r '.final.status')
  [ "$status" = "succeeded" ] || die "transform $name: $status — $(echo "$result" | jq -r '.final.message')"
done
say "syncing schema"
mb db sync-schema "$DB" --wait "${P[@]}" --json > /dev/null

# ---- 2. resolve the new tables' ids and field ids ------------------------------------------------------------
tables=$(mb table list --db-id "$DB" --limit 500 --fields id,name,schema "${P[@]}" --json)
for name in "${TABLES[@]}"; do
  tid=$(echo "$tables" | jq -r --arg n "$name" --arg s "$SL_SCHEMA" '.data[] | select(.name == $n and .schema == $s) | .id')
  [ -n "$tid" ] || die "table $SL_SCHEMA.$name not found after sync"
  setid "t:$name" "$tid"
  mb table get "$tid" --include fields "${P[@]}" --json > ".scratch/fields-$name.json"
  jq --arg n "$name" '[.fields[] | {key: ("f:" + $n + "." + .name), value: .id}] | from_entries' ".scratch/fields-$name.json" \
    | jq -s '.[0] + .[1]' "$IDS" - > "$IDS.tmp" && mv "$IDS.tmp" "$IDS"
done

# ---- 3. table + field metadata (display names, descriptions, semantic types, foreign keys) -------------------
say "setting metadata"
for name in "${TABLES[@]}"; do
  jq -c --arg t "$name" '.[$t] | {display_name, description}' metadata/tables.json \
    | mb table update "$(getid "t:$name")" --file - "${P[@]}" --json > /dev/null
  jq -r --arg t "$name" '.[$t].fields | to_entries[] | "\(.key)\t\(.value | tojson)"' metadata/tables.json \
  | while IFS=$'\t' read -r fname body; do
      fid=$(getid "f:$name.$fname"); [ -n "$fid" ] || die "$name.$fname: no such field"
      fk=$(echo "$body" | jq -r '.fk // empty')
      if [ -n "$fk" ]; then
        target=$(getid "f:$fk"); [ -n "$target" ] || die "$name.$fname: FK target $fk not found"
        body=$(echo "$body" | jq --argjson target "$target" 'del(.fk) + {fk_target_field_id: $target}')
      fi
      echo "$body" | mb field update "$fid" --file - "${P[@]}" --json > /dev/null
    done
done

# ---- 4. publish the clean tables to the Library; collections for metrics and questions -----------------------
say "publishing to the Library"
ids=$(for name in "${TABLES[@]}"; do getid "t:$name"; done | paste -sd, -)
mb library publish --table-ids "$ids" "${P[@]}" --json > /dev/null
setid "c:metrics" "$(mb library get "${P[@]}" --json | jq '.effective_children[] | select(.type == "library-metrics") | .id')"
setid "c:pagila"  "$(mb collection create --body '{"name": "Pagila", "description": "Questions and dashboards for the DVD rental business."}' "${P[@]}" --json | jq .id)"

# ---- 5. measures and segments on the clean tables ------------------------------------------------------------
say "creating measures and segments"
for f in measures/*.json; do mb measure create --file "$(render "$f")" "${P[@]}" --json > /dev/null; done
for f in segments/*.json; do mb segment create --file "$(render "$f")" "${P[@]}" --json > /dev/null; done

# ---- 6. metrics (Library / Metrics) and questions (Pagila collection) ---------------------------------------
say "creating metrics and questions"
for f in metrics/*.json questions/*.json; do
  slug="$(basename "$(dirname "$f")")/$(basename "$f" .json)"   # metrics/revenue, questions/revenue_by_month
  id=$(mb card create --file "$(render "$f")" "${P[@]}" --json | jq -r .id)
  setid "card:$slug" "$id"
done

# ---- 7. dashboards --------------------------------------------------------------------------------------------
say "creating dashboards"
for f in dashboards/*.json; do
  id=$(mb dashboard create --file "$(render "$f")" "${P[@]}" --json | jq -r .id)
  setid "dashboard:$(basename "$f" .json)" "$id"
done

# ---- 8. smoke: every card runs and returns rows -----------------------------------------------------------------
say "smoke-testing cards"
jq -r 'to_entries[] | select(.key | startswith("card:")) | "\(.key)\t\(.value)"' "$IDS" | while IFS=$'\t' read -r key id; do
  rows=$(mb card query "$id" "${P[@]}" --json | jq '.data.rows | length') || die "$key (card $id) failed to run"
  [ "$rows" -gt 0 ] || die "$key (card $id) returned no rows"
  printf '  %-36s card %-4s %s rows\n' "$key" "$id" "$rows"
done

say "done"
say "dashboard:  $MB_URL/dashboard/$(getid dashboard:overview)"
say "library:    $MB_URL/collection/$(getid c:metrics)"
say "rentals:    $MB_URL/table/$(getid t:rentals)   cube: $MB_URL/explore/table/$(getid t:rentals)"
