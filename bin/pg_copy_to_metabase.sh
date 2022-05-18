# Set the script to fail fast if there
# is an error or a missing variable

set -eu
set -o pipefail

#!/bin/sh

##
## metabase で解析する postgres データベースに uuuo-web 環境のデータベースからデータをコピーするスクリプト。
## スクリプトは heroku Addons Schedular から実行。
## 注意：uuuo-metabase は２基データベースを持つ。解析側（HEROKU_POSTGRESQL_BLUE_URL 現在27/4/2022）を指定すること。
##
## 結果を Slack へ通知する。成功は1日1回、失敗は常に通知。
## WEBHOOKURL は heroku 環境変数に事前に設定する事。
readonly EMOJI_FAIL=":waning_crescent_moon:"
readonly EMOJI_SUCCESS=":sun_with_face:"
##
## 引数は、Slackのtext欄に表示する文字列
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

## 成功はSlackに通知する。
## 通知頻度を指定：　現時刻が Heroku 環境変数（NOTIFY_WHEN_SUCCESS）の条件に合えば通知する。
## 例：時刻が 13:00-13:30 の範囲であれば通知したい場合、次の様に指定。
## 　　NOTIFY_WHEN_SUCCESS='-ge 1300 -a 1330 -gt'
now=$(date '+%H%M')
cmp=${NOTIFY_WHEN_SUCCESS-'-ge 1300 -a 1330 -gt'}
if [ $now $cmp $now ]; then
  toSlack "データベースコピー成功　${EMOJI_SUCCESS}"
fi
