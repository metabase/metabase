# Set the script to fail fast if there
# is an error or a missing variable

set -eux
set -o pipefail

#!/bin/sh

##
## metabase で解析する postgres データベースに uuuo-web（または uuuo-web-stg ）環境のデータベースからデータをコピーするスクリプt。
## heroku Addons Schedular から実行。
## 注意：uuuo-metabase は２基データベースを持つ。解析側（HEROKU_POSTGRESQL_COLOR_URL 現在27/4/2022）を指定すること。
##

echo -e "\n`date -R`"
echo -e "<<<<<  Copying DB from uuuo-web to uuuo-metabase. >>>>>"

heroku pg:reset HEROKU_POSTGRESQL_BLUE_URL -a uuuo-metabase --confirm uuuo-metabase
heroku pg:copy uuuo-web-stg::HEROKU_POSTGRESQL_MAROON_URL HEROKU_POSTGRESQL_BLUE_URL --app uuuo-metabase --confirm uuuo-metabase
