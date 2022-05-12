# Set the script to fail fast if there
# is an error or a missing variable

set -eu
set -o pipefail

#!/bin/sh

##
## metabase で解析する postgres データベースに uuuo-web 環境のデータベースからデータをコピーするスクリプt。
## heroku Addons Schedular から実行。
## 注意：uuuo-metabase は２基データベースを持つ。解析側（HEROKU_POSTGRESQL_BLUE_URL 現在27/4/2022）を指定すること。
##
## 結果は Slack へ通知する。
readonly WEBHOOKURL=https://hooks.slack.com/services/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
readonly EMOJI_FAIL=":waning_crescent_moon:"
readonly EMOJI_SUCCESS=":sun_with_face:"
##
## 引数は、text欄に表示する文字列
function toSlack() {
  SLACKTEXT=$1
  curl -X POST \
    --data-urlencode "payload={\"channel\": \"#healthcheck\", \"username\": \"uuuo-metabase\", \"text\": \"${SLACKTEXT} \" }" \
    $WEBHOOKURL
}

## エラーが発生したときに「どのファイルの」「どの行で」「どのコマンドが」エラーとなったのかをSlackに通知するtrap用関数
function err() {
  status=$?
  lineno=$1
  err_str="データベースコピー失敗: [`date +'%Y-%m-%d %H:%M:%S'`] [$BASH_SOURCE:${lineno}] - '$BASH_COMMAND' returns non-zero status = ${status}."
  echo ${err_str}
  toSlack "${err_str} ${EMOJI_FAIL}"
}

trap 'err ${LINENO[0]}' ERR

echo -e "\n`date -R`"
echo -e "<<<<<  Copying DB from uuuo-web to uuuo-metabase. >>>>>"

heroku pg:reset HEROKU_POSTGRESQL_BLUE_URL -a uuuo-metabase --confirm uuuo-metabase
heroku pg:copy uuuo-web::HEROKU_POSTGRESQL_CHARCOAL_URL HEROKU_POSTGRESQL_BLUE_URL --app uuuo-metabase --confirm uuuo-metabase

## 本スクリプトに引数を与えると成功時にSlackに通知する。
## Heroku Scheduler で通知したい日時を設定する。
## 例えば、'Every day at 9:15AM UTC 本スクリプト 成功表示'
if [ $# -ne 0 ]; then
  toSlack "データベースコピー成功　${EMOJI_SUCCESS}"
fi
