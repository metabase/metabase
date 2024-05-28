#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

yarn precommit

# Run the formatter
# Note that this is stubbed in for now until we can gobally resolve some formatting issues such as what is described
# here: https://github.com/metabase/metabase/pull/35511#pullrequestreview-1721758128
# ATM, you can manually run ./bin/cljfmt_staged.sh if you want to format locally staged files and inspect after.
# ./bin/cljfmt_staged.sh

./hooks/pre-commit.nocommit