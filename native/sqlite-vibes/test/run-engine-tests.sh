#!/usr/bin/env bash
# Build SQLite's testfixture from the patched tree (build.sh must have run) and run the RERANK tests plus the
# upstream suites the patch touches. Pass test names to run others, e.g. `veryquick`.
set -euo pipefail
cd "$(dirname "$0")/.."
BUILD="$PWD/build"
SRC="$BUILD/sqlite-src-3500300"
TCLSH="${TCLSH:-$(command -v tclsh9.0 || command -v tclsh)}"
mkdir -p "$BUILD/bld-tcl"
cd "$BUILD/bld-tcl"
[ -f Makefile ] || "$SRC/configure" --with-tclsh="$TCLSH" > configure.log
make testfixture > make.log
tests=("$@")
if [ ${#tests[@]} -eq 0 ]; then
  tests=(vibesrerank select1 select4 select9 selectA with1 with2 window1 windowerr subquery view trigger1 insert
         alter altertab json101 keyword1 limit orderby1)
fi
status=0
for t in "${tests[@]}"; do
  summary=$(./testfixture "$SRC/test/$t.test" 2>&1 | grep -E "errors out of" | tail -1 || true)
  echo "$t: ${summary:-FAILED TO RUN}"
  case "$summary" in "0 errors out of"*) ;; *) status=1 ;; esac
done
exit $status
