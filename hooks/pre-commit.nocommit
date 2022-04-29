#!/bin/sh

if git rev-parse --verify HEAD >/dev/null 2>&1
then
    against=HEAD
else
    # Initial commit: diff against an empty tree object
    against=$(git hash-object -t tree /dev/null)
fi

# Redirect output to stderr.
exec 1>&2

# Check user defined nocommit words
if [ -z "$NOCOMMIT_RE" ]; then
  RE="nocommit"
else
  RE="nocommit|$NOCOMMIT_RE"
fi

NOCOMMIT_FOUND=$(git diff --cached --diff-filter=ACM $against | egrep -i "$RE")

if [ -z "$NOCOMMIT_FOUND" ]; then
  exit 0
else
  echo "\033[2m$ $(readlink -f $0)\033[0m"
  echo "File(s) being committed matching '$RE' (add --no-verify to ignore):"
  for f in $(git diff --cached --name-only --diff-filter=ACM $against); do
    FILE_DIFF=$(git diff --cached --diff-filter=ACM $against -- $f | egrep -i "$RE")
    if [ -z "$FILE_DIFF" ]; then
      true
    else
      echo "\t$f"
    fi
  done
  exit 1
fi
