COS="http://cos"
BUCKET="misc"
access_key="lkYhafPJa3nUiC6WEiM7"
secret_access_key="Fdbuzei8s8mw982IjeBlIpTDiQxW9ujQO3Orq9De"
export AWS_ACCESS_KEY_ID=${access_key}
export AWS_SECRET_ACCESS_KEY=${secret_access_key}

aws --endpoint-url ${COS} s3 cp original s3://${BUCKET}/jkelley/metabase/original --recursive
aws --endpoint-url ${COS} s3 cp converted s3://${BUCKET}/jkelley/metabase/converted --recursive

cd output

aws --endpoint-url ${COS} s3 cp csv s3://${BUCKET}/jkelley/metabase/csv --recursive
aws --endpoint-url ${COS} s3 cp jsonl s3://${BUCKET}/jkelley/metabase/jsonl --recursive
aws --endpoint-url ${COS} s3 cp pipelines s3://${BUCKET}/jkelley/metabase/pipelines --recursive
aws --endpoint-url ${COS} s3 cp ddl s3://${BUCKET}/jkelley/metabase/ddl --recursive


