#!/usr/bin/env bash
# One-off: run once, by hand, after the tech writers approve the docs-images-to-CDN workflow.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

branch=$(git branch --show-current)
if [ -z "$branch" ] || [ "$branch" = master ]; then
  echo "Check out a branch other than master first." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "The working tree isn't clean." >&2
  exit 1
fi

images=$(git ls-files docs | grep -iE '\.(png|gif)$')
not_images=$(xargs file --mime-type <<<"$images" | grep -vE ': +image/(png|gif)$' || true)
if [ -n "$not_images" ]; then
  printf 'Convert these to PNG first (sips -s format png FILE --out FILE):\n%s\n' "$not_images" >&2
  exit 1
fi

export BUCKET=metabase-dot-com-cdn AWS_REGION=us-east-1 SKIP_UNLINKED=1
if [ -n "${DRY_RUN:-}" ]; then
  stubs=$(mktemp -d)
  trap 'rm -rf "$stubs"' EXIT
  printf '#!/bin/sh\nexit 0\n' > "$stubs/aws"
  command -v oxipng >/dev/null || cp "$stubs/aws" "$stubs/oxipng"
  chmod +x "$stubs"/*
  export PATH="$stubs:$PATH"
elif [ "$(aws sts get-caller-identity --query Account --output text)" != 488208231899 ]; then
  echo "Log in to AWS account 488208231899 first (aws sso login)." >&2
  exit 1
fi

total=$(wc -l <<<"$images" | tr -d ' ')
bun .github/scripts/docs-images-cdn.ts <<<"$images"
# The script runs oxipng on skipped images too; keep them byte-identical.
git diff -z --name-only --diff-filter=M -- ':(icase)docs/*.png' ':(icase)docs/*.gif' | xargs -0 git checkout --

moved=$(git diff --name-only --diff-filter=D | wc -l | tr -d ' ')
pages=$(git diff --name-only --diff-filter=M | wc -l | tr -d ' ')
echo "Moved $moved of $total images to the CDN and changed $pages pages in ${SECONDS}s${DRY_RUN:+ (dry run, nothing uploaded)}."
echo "Skipped $((total - moved)) images that no page links inline (listed above)."
