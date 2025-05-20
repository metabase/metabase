#!/usr/bin/env bash
# This script merges translations from the given branch into the current branch.
#
# It's useful to run this after backporting a translation PR, since that PR may
# remove translations from the release branch that are still needed on that
# branch. With this script, you can restore these translations by merging the
# translations from the release branch into the backport branch.
#
# In case of a conflict, the translation in the current branch is used. To give
# precedence to translations in the other branch, use the -o flag.
#
# Example usage:
#   ./bin/i18n/merge-translations <branch-name> [-o]
#
# Run this script from the root directory since it assumes that .po files exist
# in a locales/ directory.

otherBranch="$1"
prioritizeOtherTranslations=false

shift

usage() {
  echo "Usage: $0 <branch> [-o]"
  echo "  <branch>    Specify the branch to merge translations from."
  echo "  -o          Prioritize translations from the other branch, in case of conflicts."
  exit 1
}

while getopts "o" opt; do
  case ${opt} in
    o)
      prioritizeOtherTranslations=true
      ;;
    *)
      usage
      ;;
  esac
done

# Ensure the other branch argument is provided
if [[ -z "$otherBranch" ]]; then
  usage
fi

remove_unnecessary_wrapping() {
  local input=""
  while IFS= read -r line; do
    input+="$line"$'EscapedNewlineInMergeScript'
  done

  echo -E "$input" | sed 's/\(msgid\|msgstr\) ""EscapedNewlineInMergeScript"/\1 "/g' | sed 's/EscapedNewlineInMergeScript/\n/g'
}

for po in locales/*.po; do
  set -f

  echo "Merging translations from $otherBranch:$po into $po"

  if [ "$prioritizeOtherTranslations" = true ]; then
    msgcat --no-wrap --use-first <(git show "$otherBranch:$po") "$po" | remove_unnecessary_wrapping > "$po.tmp"
  else
    msgcat --no-wrap --use-first "$po" <(git show "$otherBranch:$po") | remove_unnecessary_wrapping > "$po.tmp"
  fi

  # Outputting directly to $po while reading it causes problems, so we output
  # to a temporary file, then replace the .po file with it
  mv "$po.tmp" "$po"
done
