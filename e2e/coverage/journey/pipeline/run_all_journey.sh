#!/usr/bin/env bash
# Usage: e2e/coverage/journey/pipeline/run_all_journey.sh <run id | run dir> [--out <dir>] [--rerun <run id | run dir>]...
#          [--backend-baseline union|shard] [--kills <file>] [--min-mutants <k>] [--require-strata <s,...>]
# Builds the step graph and the overlap analysis of an e2e journey-capture run.
# A run id is downloaded into $JOURNEY_ANALYSIS_DIR/<run id>/artifacts first.
# A run dir holds the downloaded shard directories.
# A rerun supplies passing attempts for tests that never passed in the main run, and second samples of the others.
# --backend-baseline union (the default) also drops backend classes that any shard's coverage baseline ran,
# and shard subtracts each shard's own baseline only.
# --kills takes a kill matrix for keep, delete or unmeasured verdicts (kills.py has the format).
# Outputs go to --out (default $JOURNEY_ANALYSIS_DIR/<run id or dir name>): journey-graph.json, journey-overlap.json, report.txt, work/.
# JOURNEY_ANALYSIS_DIR defaults to journey-analysis/ at the repo root, which is gitignored.
# JOURNEY_PYTHON is a python with numpy and scipy.
# Without it, one is set up in $JOURNEY_ANALYSIS_DIR/.venv.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
ANALYSIS="${JOURNEY_ANALYSIS_DIR:-$REPO/journey-analysis}"
mkdir -p "$ANALYSIS"
ANALYSIS="$(cd "$ANALYSIS" && pwd)"
if [ -z "${JOURNEY_PYTHON:-}" ]; then
  [ -d "$ANALYSIS/.venv" ] || { python3 -m venv "$ANALYSIS/.venv" && "$ANALYSIS/.venv/bin/pip" install -q numpy scipy; }
  JOURNEY_PYTHON="$ANALYSIS/.venv/bin/python"
fi
PY="$JOURNEY_PYTHON"

run_dir() {
  if [ -d "$1" ]; then
    (cd "$1" && pwd)
  else
    "$HERE/fetch_journey.sh" "$1" "$ANALYSIS/$1/artifacts" >&2
    echo "$ANALYSIS/$1/artifacts"
  fi
}

ARG="${1:?run id or run dir}"
shift
OUT=""
RERUN_ARGS=()
OVERLAP_ARGS=()
export JOURNEY_BACKEND_BASELINE="${JOURNEY_BACKEND_BASELINE:-union}"
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --rerun) RERUN_ARGS+=(--rerun "$(run_dir "$2")"); shift 2 ;;
    --backend-baseline) JOURNEY_BACKEND_BASELINE="$2"; shift 2 ;;
    --kills|--min-mutants|--require-strata) OVERLAP_ARGS+=("$1" "$2"); shift 2 ;;
    *) OUT="$1"; shift ;;
  esac
done
RUN_DIR="$(run_dir "$ARG")"
if [ -d "$ARG" ]; then NAME="$(basename "$RUN_DIR")"; else NAME="$ARG"; fi
OUT="${OUT:-$ANALYSIS/$NAME}"
mkdir -p "$OUT/work"

META="$( [ -f "$RUN_DIR/meta.json" ] && echo "$RUN_DIR/meta.json" || ls "$RUN_DIR"/*/meta.json | head -1 )"
SHA="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).sha)' "$META")"
echo "run $NAME at $SHA"
"$HERE/repo_files.sh" "$SHA" "$OUT/src"

if [ -z "${OPENAPI:-}" ]; then
  for candidate in "$RUN_DIR/journey-capture-openapi/openapi.json" "$RUN_DIR/openapi/openapi.json"; do
    [ -f "$candidate" ] && OPENAPI="$candidate" && break
  done
  [ -n "${OPENAPI:-}" ] || echo "warning: no openapi.json in $RUN_DIR, so routes keep their literal shapes" >&2
fi
time node --max-old-space-size=8192 "$HERE/extract.mjs" "$RUN_DIR" "$OUT/work" "$OUT/src" "${OPENAPI:-none}" ${RERUN_ARGS[@]+"${RERUN_ARGS[@]}"}

# jest runs every *.unit.spec.js under the repo root, including those in e2e/,
# so the e2e sources at the capture's SHA go to a temporary directory outside it.
STATIC="$OUT/static"
if git -C "$REPO" cat-file -e "$SHA^{commit}" 2>/dev/null; then
  mkdir -p "$STATIC"
  E2E_SRC="$(mktemp -d)"
  trap 'rm -rf "$E2E_SRC"' EXIT
  git -C "$REPO" archive "$SHA" e2e | tar -x -C "$E2E_SRC"
  "$PY" - "$OUT/work" "$STATIC/tests.json" <<'EOF'
import json, sys
work, dest = sys.argv[1], sys.argv[2]
specs = json.load(open(f"{work}/vocab.json"))["specs"]
tests = [{"id": r["id"], "spec": specs[r["spec"]], "title": r["title"]} for r in map(json.loads, open(f"{work}/tests.jsonl"))]
json.dump({"tests": tests}, open(dest, "w"))
EOF
  time node --max-old-space-size=8192 "$HERE/static-tests.mjs" "$E2E_SRC" "$STATIC/tests.json" "$STATIC/static-tests.json"
  time "$PY" "$HERE/static_align.py" "$OUT/work" "$STATIC/static-tests.json"
else
  echo "warning: $SHA is not in $REPO, so assertions are keyed by their messages only" >&2
  rm -f "$OUT/work/static-align.json"
fi

time "$PY" "$HERE/graph.py" "$OUT/work" "$OUT" > "$OUT/graph.txt"
time "$PY" "$HERE/overlap.py" "$OUT/work" "$OUT" ${OVERLAP_ARGS[@]+"${OVERLAP_ARGS[@]}"}
"$PY" "$HERE/report.py" "$OUT" > "$OUT/report.txt"
echo "done: $OUT/report.txt"
