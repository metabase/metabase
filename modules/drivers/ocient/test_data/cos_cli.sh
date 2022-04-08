#!/bin/bash
COS="http://cos"
BUCKET="misc"
#BUCKET="customer_data"
access_key="lkYhafPJa3nUiC6WEiM7"
secret_access_key="Fdbuzei8s8mw982IjeBlIpTDiQxW9ujQO3Orq9De"

export AWS_ACCESS_KEY_ID=${access_key}
export AWS_SECRET_ACCESS_KEY=${secret_access_key}

#aws --endpoint-url ${COS} s3 rm s3://${BUCKET}/hcalzaretta/metabase
aws --endpoint-url ${COS} s3 cp categories.jsonl.gz s3://${BUCKET}/hcalzaretta/metabase/
aws --endpoint-url ${COS} s3 cp checkins.jsonl.gz s3://${BUCKET}/hcalzaretta/metabase/
aws --endpoint-url ${COS} s3 cp users.jsonl.gz s3://${BUCKET}/hcalzaretta/metabase/
aws --endpoint-url ${COS} s3 cp venues.jsonl.gz s3://${BUCKET}/hcalzaretta/metabase/
aws --endpoint-url ${COS} s3 ls s3://${BUCKET}/hcalzaretta/metabase/
#aws --endpoint-url ${COS} s3 rm s3://${BUCKET}/mc/smf101.jsonl.gz
#aws --endpoint-url ${COS} s3 cp /mnt/staging/smf/smf101.jsonl.gz s3://${BUCKET}/mc/
#aws --endpoint-url ${COS} s3 cp /mnt/staging/smf/smf100.jsonl.gz s3://${BUCKET}/mc/
#aws --endpoint-url ${COS} s3 ls s3://${BUCKET}/mc/

#aws --endpoint-url ${COS} s3 rm s3://${BUCKET}/hcalzaretta/stations.jsonl.gz
#aws --endpoint-url ${COS} s3 cp wmo/stations.jsonl.gz s3://${BUCKET}/hcalzaretta/stations/
#aws --endpoint-url ${COS} s3 ls s3://${BUCKET}/canal/bdh/location_d/
#aws --endpoint-url ${COS} s3 ls s3://${BUCKET}/canal/bdh/campaign_group_d/
#aws --endpoint-url ${COS} s3 ls s3://${BUCKET}/canal/bdh/ --recursive --human-readable --summarize
#aws --endpoint-url ${COS} s3 ls s3://${BUCKET}/canal/bdh/auction_won_fs/date_wid=20210429//part-00000-0f764ef4-29ff-4178-8e76-5d784d6cc8d3.c000.json.gz
#aws --endpoint-url ${COS} s3 ls s3://${BUCKET}/canal/bdh/auction_won_fs/date_wid=20210429//part-00000-0897878c-4841-49b7-8723-597bcac3069f.c000.json.gz
#aws --endpoint-url ${COS} s3 ls s3://${BUCKET}/canal/bdh/auction_won_fs/date_wid=20210429//part-00000-0ca16fac-f379-4996-b7bc-1a90c6b76f2a.c000.json.gz
#aws --endpoint-url ${COS} s3 ls s3://${BUCKET}/canal/bdh/auction_won_fs/date_wid=20210429//part-00000-0e0315ef-97cc-4c9e-b0b0-823c28bbf919.c000.json.gz
