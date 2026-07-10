#!/bin/bash
# Baseline-confirm kill candidates deterministically. For each candidate: mutate (-R its
# patch), run ONLY its non-flaky failing spec files IN ISOLATION (light load), record
# which still FAIL, restore. A file that fails mutated-in-isolation AND passed the clean
# baseline == real kill (mutation-caused). A file that passes here == load-flake, discount.
# Flaky files (FormDateInput, SmartScalar/compute) are excluded upfront.
set -u
cd "$(dirname "$0")/../.."
CORPUS="regression-corpus"
CANDS="5334 42723 44499 47005 49319 56839"

restore_all(){ for i in $CANDS; do git apply "$CORPUS/bugs/$i/inverse.patch" 2>/dev/null; done; }
trap restore_all EXIT

files_for(){ case "$1" in
  5334) cat <<'EOF'
enterprise/frontend/src/metabase-enterprise/whitelabel/components/IllustrationWidget/ImageUploadWidget.unit.spec.tsx
frontend/src/metabase/querying/common/utils/question.unit.spec.ts
frontend/src/metabase/querying/drills/utils/query-drill.unit.spec.ts
frontend/src/metabase/visualizations/visualizations/PieChart/use-chart-events.unit.spec.ts
EOF
;;
  42723) cat <<'EOF'
enterprise/frontend/src/metabase-enterprise/metabot/components/MetabotAdmin/MetabaseAIProviderSetup.unit.spec.tsx
frontend/src/metabase/common/components/Pickers/EntityPicker/hooks/use-get-path-from-value.unit.spec.tsx
EOF
;;
  44499) cat <<'EOF'
frontend/src/metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper.unit.spec.tsx
frontend/src/metabase/dashboard/actions/data-fetching.unit.spec.ts
frontend/src/metabase/data-studio/data-model/pages/DataModel/DataModel.unit.spec.tsx
frontend/src/metabase/timelines/collections/components/TimelineDetailsModal/TimelineDetailsModal.unit.spec.tsx
EOF
;;
  47005) cat <<'EOF'
enterprise/frontend/src/metabase-enterprise/content_translation/tests/use-translate-content.common.unit.spec.tsx
frontend/src/metabase/parameters/components/ValuesSourceModal/tests/common.unit.spec.tsx
EOF
;;
  49319) cat <<'EOF'
frontend/src/metabase/admin/settings/tests/premium.unit.spec.tsx
EOF
;;
  56839) cat <<'EOF'
frontend/src/metabase/admin/datamodel/containers/SegmentApp.unit.spec.tsx
frontend/src/metabase/data-studio/data-model/pages/DataModel/DataModel.unit.spec.tsx
frontend/src/metabase/metadata/components/FkTargetPicker/FkTargetPicker.unit.spec.tsx
frontend/src/metabase/metadata/pages/DataModelV1/DataModelV1.unit.spec.tsx
EOF
;;
esac; }

for i in $CANDS; do
  echo "######## $i ########"
  git apply -R "$CORPUS/bugs/$i/inverse.patch" 2>/dev/null && echo "  [mutated]" || { echo "  [MUTATE FAILED]"; continue; }
  files_for "$i" > /tmp/bc-$i.txt
  xargs bun run test-unit-keep-cljs < /tmp/bc-$i.txt > "$CORPUS/logs/bc-$i.log" 2>&1
  echo "  FAIL-on-mutated-isolated (= REAL KILL):"
  grep -E '^FAIL ' "$CORPUS/logs/bc-$i.log" | sed -E 's/ \([0-9.]+ s\)//; s/^FAIL (core )?//' | sort -u | sed 's/^/    /'
  grep -E '^Tests:' "$CORPUS/logs/bc-$i.log" | tail -1 | sed 's/^/  /'
  # BE leg for 5334 (drill-thru): confirm the matching test flips
  if [ "$i" = 5334 ]; then
    echo "  BE isolate: chart-other-slice-click-test"
    ./bin/test-agent :only '[metabase.lib.drill-thru.underlying-records-test/chart-other-slice-click-test]' > "$CORPUS/logs/bc-5334-be.log" 2>&1
    grep -iE '[0-9]+ failures?, [0-9]+ errors?|Ran [0-9]+ tests' "$CORPUS/logs/bc-5334-be.log" | tail -2 | sed 's/^/    /'
  fi
  git apply "$CORPUS/bugs/$i/inverse.patch" 2>/dev/null && echo "  [restored]" || echo "  [RESTORE FAILED]"
done
trap - EXIT; restore_all
echo "=== product tree after ==="
git status --porcelain | grep -v '^??' | grep -vE 'unit.spec.tsx' || echo "product clean"
