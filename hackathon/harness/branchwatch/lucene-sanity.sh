#!/usr/bin/env bash
# Agent J: first-run sanity checks for a lucene pipeline run (branches.md, "lucene (Paolo)"). Read-only.
#   branchwatch/lucene-sanity.sh <run_id> [<instance dir name under local/pipeline>]
# The instance dir defaults to the run's notes.instance.
set -uo pipefail
RUN="$1"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
q() { docker exec -i semantic_search-postgres-1 psql -U postgres -d harness -At -F' | ' -c "$1"; }

INST="${2:-$(q "select (notes::jsonb)->>'instance' from harness_run where run_id='$RUN'")}"
DIR="$REPO/local/pipeline/$INST"
echo "run $RUN  instance $INST"

echo "== run record"
q "select finished_at is not null as finished, embedder, embedding_text,
          (notes::jsonb)->>'engineSha', (notes::jsonb)->>'appDb', (notes::jsonb)->'fallbackGuard',
          (notes::jsonb)->'liveVectorArm'  -- BL-42 (key name per A's implementation; per-scorer scores aren't stored in returned)
   from harness_run where run_id='$RUN'"

echo "== engines, observations, errors"
q "select engine, count(*), count(error) from harness_query_result where run_id='$RUN' group by 1 order by 1"

echo "== permission leaks (empty-04 and overall)"
q "select engine, scenario_id, value from harness_metric where run_id='$RUN' and metric='permission_leak'
     and (scenario_id='empty-04' or scenario_id is null) and tag is null and engine_b is null order by 1,2"

echo "== scores (min, zero-score rows) for lucene columns"
q "select q.engine, min((e->>'score')::float), count(*) filter (where (e->>'score')::float = 0)
   from harness_query_result q, jsonb_array_elements(q.returned) e
   where run_id='$RUN' and engine like 'lucene%' group by 1"

echo "== boot proof (metabase.log)"
if [ -f "$DIR/metabase.log" ]; then
  grep -m2 'Opened semantic search Lucene index at' "$DIR/metabase.log" | cut -c1-220 || true
  echo "opened lines: $(grep -c 'Opened semantic search Lucene index at' "$DIR/metabase.log")"
  echo "'Another process holds' lines (must be 0): $(grep -c 'Another process holds the semantic search Lucene index' "$DIR/metabase.log")"
  echo "'Error executing semantic search' lines (must be 0): $(grep -c 'Error executing semantic search' "$DIR/metabase.log")"
  echo "'Keyword arm of semantic search failed' lines: $(grep -c 'Keyword arm of semantic search failed' "$DIR/metabase.log")"
  echo "'Failed to generate semantic search embeddings' lines: $(grep -c 'Failed to generate semantic search embeddings' "$DIR/metabase.log")"
  echo "hs_err files: $(ls "$DIR"/hs_err_pid*.log 2>/dev/null | wc -l | tr -d ' ')"
else
  echo "no $DIR/metabase.log"
fi
echo "== index dir under the instance's plugins dir"
ls -d "$DIR"/plugins/semantic-search/* 2>/dev/null || echo "(none under $DIR/plugins; check MB_PLUGINS_DIR)"
