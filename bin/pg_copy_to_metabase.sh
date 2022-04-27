# Set the script to fail fast if there
# is an error or a missing variable

set -eu
set -o pipefail

#!/bin/sh

##
## metabase で解析する postgres データベースに uuuo-web（または uuuo-web-stg ）環境のデータベースからデータをコピーするスクリプt。
## heroku Addons Schedular から実行。
## 注意：uuuo-metabase は２基データベースを持つ。解析側（HEROKU_POSTGRESQL_COLOR_URL 現在27/4/2022）を指定すること。
##

METABASE_COLOR_URL=HEROKU_POSTGRESQL_BLUE_URL

echo -e "\n`date -R`"
echo -e "<<<<<  Copying DB from uuuo-web to uuuo-metabase. >>>>>"

heroku pg:reset METABASE_COLOR_URL -a uuuo-metabase --confirm uuuo-metabase
heroku pg:copy uuuo-web-stg::HEROKU_POSTGRESQL_MAROON_URL METABASE_COLOR_URL --app uuuo-metabase --confirm uuuo-metabase
