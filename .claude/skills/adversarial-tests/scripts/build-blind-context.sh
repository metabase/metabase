#!/usr/bin/env bash
# Writes <run-dir>/blind/context.md, the only input the blind generator sees.
#
#   build-blind-context.sh <run-dir> <head-worktree> <parent-worktree>
#
# It reads <run-dir>/context/pr.json and <run-dir>/context/issues/*.md when they exist.
# Diff hunks and function bodies never reach the output: source files go through the surface extractors,
# and the only test code included is the setup half of neighbouring specs as they are on the parent commit.

set -euo pipefail

RUN_DIR=$(cd "$1" && pwd)
HEAD_DIR=$(cd "$2" && pwd)
PARENT_DIR=$(cd "$3" && pwd)
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
NEUTRAL_DIR=${TMPDIR:-/tmp}

MERGE_BASE=$(git -C "$PARENT_DIR" rev-parse HEAD)
OUT="$RUN_DIR/blind/context.md"
mkdir -p "$RUN_DIR/blind"

is_test_file() {
  case "$1" in
    *.unit.spec.* | *.spec.* | *.stories.* | *_test.clj | *_test.cljc | *_test.cljs) return 0 ;;
    test/* | */test/* | e2e/* | frontend/test/* | */__mocks__/* | */__support__/*) return 0 ;;
    *) return 1 ;;
  esac
}

touched_ranges() {
  git -C "$HEAD_DIR" diff -U0 "$MERGE_BASE" HEAD -- "$1" |
    sed -n 's/^@@ -[0-9,]* +\([0-9]*\)\(,\([0-9]*\)\)\{0,1\} @@.*/\1 \3/p' |
    awk '{ len = ($2 == "") ? 1 : $2; if (len == 0) len = 1; printf "%s%d-%d", sep, $1, $1 + len - 1; sep = "," }'
}

fence_lang() {
  case "$1" in
    *.tsx) echo tsx ;;
    *.ts) echo ts ;;
    *.js | *.jsx) echo js ;;
    *.clj | *.cljc | *.cljs) echo clojure ;;
    *) echo "" ;;
  esac
}

ts_surface() {
  (cd "$HEAD_DIR" && node "$SCRIPT_DIR/ts-surface.mjs" "$@")
}

clj_surface() {
  (cd "$NEUTRAL_DIR" && bb "$SCRIPT_DIR/clj-surface.bb" "$@")
}

{
  echo "# Context for the blind test generator"
  echo
  echo "## What the author says the change does"
  echo
  if [[ -f "$RUN_DIR/context/pr.json" ]]; then
    jq -r '"PR #\(.number): \(.title)\n\n\(.body // "(no description)")"' "$RUN_DIR/context/pr.json"
  else
    echo "There is no PR. These are the branch's commit messages:"
    echo
    git -C "$HEAD_DIR" log --reverse --format='- %s%n%n%b' "$MERGE_BASE"..HEAD
  fi
  echo

  if compgen -G "$RUN_DIR/context/issues/*.md" > /dev/null; then
    echo "## Linked issues"
    echo
    for issue in "$RUN_DIR"/context/issues/*.md; do
      cat "$issue"
      echo
    done
  fi

  echo "## Public surface of the changed files, at the PR head"
  echo
  echo "Bodies are elided as \`{ … }\` or \`…\`. A \"Changed by the PR\" line names the declarations the diff touches."
  echo

  harness_files=()
  frontend_changed=false

  while IFS=$'\t' read -r status path rest; do
    [[ -z "$status" ]] && continue
    if [[ "$status" == R* ]]; then
      path=$rest
    fi
    is_test_file "$path" && continue

    if [[ "$status" == D ]]; then
      echo "### $path (deleted)"
      echo
      continue
    fi

    lang=$(fence_lang "$path")
    label=$path
    [[ "$status" == A ]] && label="$path (new file)"
    echo "### $label"
    echo

    case "$path" in
      *.ts | *.tsx | *.js | *.jsx)
        frontend_changed=true
        echo '```'"$lang"
        ts_surface surface "$path" --touched "$(touched_ranges "$path")"
        echo '```'
        dir=$(dirname "$path")
        for spec in "$PARENT_DIR/$dir"/*.unit.spec.ts "$PARENT_DIR/$dir"/*.unit.spec.tsx \
          "$PARENT_DIR/$dir"/tests/*.unit.spec.ts "$PARENT_DIR/$dir"/tests/*.unit.spec.tsx; do
          [[ -f "$spec" ]] && harness_files+=("${spec#"$PARENT_DIR"/}")
        done
        ;;
      src/*.clj | src/*.cljc | enterprise/backend/src/*.clj | enterprise/backend/src/*.cljc)
        echo '```clojure'
        clj_surface surface "$HEAD_DIR/$path" --touched "$(touched_ranges "$path")"
        echo '```'
        test_path=$(echo "$path" | sed -e 's#^src/#test/#' -e 's#^enterprise/backend/src/#enterprise/backend/test/#' -e 's#\.\(cljc\{0,1\}\)$#_test.\1#')
        [[ -f "$PARENT_DIR/$test_path" ]] && harness_files+=("$test_path")
        ;;
      *)
        echo "Content not shown for this file type."
        ;;
    esac
    echo
  done < <(git -C "$HEAD_DIR" diff --name-status "$MERGE_BASE" HEAD)

  echo "## Test harness reference"
  echo
  echo "These are the setup parts of the existing tests next to the changed files, as they are on the parent commit."
  echo "Test bodies are removed. Use them to see how the code is rendered or called, not as a list of what to test."
  echo

  if [[ ${#harness_files[@]} -gt 0 ]]; then
    for spec in $(printf '%s\n' "${harness_files[@]}" | sort -u); do
      lang=$(fence_lang "$spec")
      echo "### $spec"
      echo
      echo '```'"$lang"
      case "$spec" in
        *.clj | *.cljc) clj_surface harness "$PARENT_DIR/$spec" ;;
        *) ts_surface harness "$PARENT_DIR/$spec" ;;
      esac
      echo '```'
      echo
    done
  else
    echo "No neighbouring tests exist on the parent commit."
    echo
  fi

  if [[ "$frontend_changed" == true ]]; then
    echo "### frontend/test/__support__/ui.tsx (exported helpers)"
    echo
    echo '```tsx'
    ts_surface surface "$PARENT_DIR/frontend/test/__support__/ui.tsx"
    echo '```'
  fi
} > "$OUT"

echo "$OUT"
