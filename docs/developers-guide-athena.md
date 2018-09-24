# AWS Athena Tests

NOTE: These instructions are only for running tests with AWS Athena Driver, 
for general developers instructions see our [developers' guide](developers-guide.md).

##### I'm using `metabase-athena/test-db` but you can choose your preferred s3 target

## Generation Data Files

To generate data files for AWS Athena tables execute:
```clojure
(metabase.test.data.athena/export-data)
```

## Upload generated data to S3

If you have AWS Cli you can sync your output folder with

```
aws s3 sync /tmp/metabase/test/ s3://metabase-athena/test-db/
```

## Create the Test DB

 * Go to [AWS Glue Console](https://console.aws.amazon.com/glue/home) and create a test db;
 * Go to [AWS Athena Console](https://console.aws.amazon.com/athena/home), 
choose your db and create the tables.

#### Why do not run crawler

Some fields are identified as `string` and should be `date` or `timestamp`. 
You can execute crawler and change it manually.

##### Categories

```
CREATE EXTERNAL TABLE `categories`(
  `name` string COMMENT 'from deserializer', 
  `id` int COMMENT 'from deserializer')
ROW FORMAT SERDE 
  'org.openx.data.jsonserde.JsonSerDe' 
WITH SERDEPROPERTIES ( 
  'paths'='id,name') 
STORED AS INPUTFORMAT 
  'org.apache.hadoop.mapred.TextInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://metabase-athena/test-db/categories/'
TBLPROPERTIES (
  'CrawlerSchemaDeserializerVersion'='1.0', 
  'CrawlerSchemaSerializerVersion'='1.0', 
  'UPDATED_BY_CRAWLER'='metabase', 
  'averageRecordSize'='28', 
  'classification'='json', 
  'compressionType'='none', 
  'objectCount'='1', 
  'recordCount'='75', 
  'sizeKey'='2118', 
  'typeOfData'='file')
```

##### Checkins

```
CREATE EXTERNAL TABLE `checkins`(
  `user_id` int COMMENT 'from deserializer', 
  `venue_id` int COMMENT 'from deserializer', 
  `date` timestamp COMMENT 'from deserializer', 
  `id` int COMMENT 'from deserializer')
ROW FORMAT SERDE 
  'org.openx.data.jsonserde.JsonSerDe' 
WITH SERDEPROPERTIES ( 
  'paths'='date,id,user_id,venue_id') 
STORED AS INPUTFORMAT 
  'org.apache.hadoop.mapred.TextInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://metabase-athena/test-db/checkins/'
TBLPROPERTIES (
  'CrawlerSchemaDeserializerVersion'='1.0', 
  'CrawlerSchemaSerializerVersion'='1.0', 
  'UPDATED_BY_CRAWLER'='metabase', 
  'averageRecordSize'='66', 
  'classification'='json', 
  'compressionType'='none', 
  'objectCount'='1', 
  'recordCount'='1003', 
  'sizeKey'='66203', 
  'typeOfData'='file')
```

##### Cities

```
CREATE EXTERNAL TABLE `cities`(
  `name` string COMMENT 'from deserializer', 
  `latitude` double COMMENT 'from deserializer', 
  `longitude` double COMMENT 'from deserializer', 
  `id` int COMMENT 'from deserializer')
ROW FORMAT SERDE 
  'org.openx.data.jsonserde.JsonSerDe' 
WITH SERDEPROPERTIES ( 
  'paths'='id,latitude,longitude,name') 
STORED AS INPUTFORMAT 
  'org.apache.hadoop.mapred.TextInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://metabase-athena/test-db/cities/'
TBLPROPERTIES (
  'CrawlerSchemaDeserializerVersion'='1.0', 
  'CrawlerSchemaSerializerVersion'='1.0', 
  'UPDATED_BY_CRAWLER'='metabase', 
  'averageRecordSize'='87', 
  'classification'='json', 
  'compressionType'='none', 
  'objectCount'='1', 
  'recordCount'='151', 
  'sizeKey'='13179', 
  'typeOfData'='file')
```

##### Incidents

```
CREATE EXTERNAL TABLE `incidents`(
  `severity` int COMMENT 'from deserializer', 
  `timestamp` bigint COMMENT 'from deserializer', 
  `id` int COMMENT 'from deserializer')
ROW FORMAT SERDE 
  'org.openx.data.jsonserde.JsonSerDe' 
WITH SERDEPROPERTIES ( 
  'paths'='id,severity,timestamp') 
STORED AS INPUTFORMAT 
  'org.apache.hadoop.mapred.TextInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://metabase-athena/test-db/incidents/'
TBLPROPERTIES (
  'CrawlerSchemaDeserializerVersion'='1.0', 
  'CrawlerSchemaSerializerVersion'='1.0', 
  'UPDATED_BY_CRAWLER'='metabase', 
  'averageRecordSize'='49', 
  'classification'='json', 
  'compressionType'='none', 
  'objectCount'='1', 
  'recordCount'='201', 
  'sizeKey'='9892', 
  'typeOfData'='file')
```

##### Places

```
CREATE EXTERNAL TABLE `places`(
  `name` string COMMENT 'from deserializer', 
  `liked` boolean COMMENT 'from deserializer', 
  `id` int COMMENT 'from deserializer')
ROW FORMAT SERDE 
  'org.openx.data.jsonserde.JsonSerDe' 
WITH SERDEPROPERTIES ( 
  'paths'='id,liked,name') 
STORED AS INPUTFORMAT 
  'org.apache.hadoop.mapred.TextInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://metabase-athena/test-db/places/'
TBLPROPERTIES (
  'CrawlerSchemaDeserializerVersion'='1.0', 
  'CrawlerSchemaSerializerVersion'='1.0', 
  'UPDATED_BY_CRAWLER'='metabase', 
  'averageRecordSize'='40', 
  'classification'='json', 
  'compressionType'='none', 
  'objectCount'='1', 
  'recordCount'='3', 
  'sizeKey'='121', 
  'typeOfData'='file')
```

##### Sightings

```
CREATE EXTERNAL TABLE `sightings`(
  `city_id` int COMMENT 'from deserializer', 
  `category_id` int COMMENT 'from deserializer', 
  `timestamp` int COMMENT 'from deserializer', 
  `id` int COMMENT 'from deserializer')
ROW FORMAT SERDE 
  'org.openx.data.jsonserde.JsonSerDe' 
WITH SERDEPROPERTIES ( 
  'paths'='category_id,city_id,id,timestamp') 
STORED AS INPUTFORMAT 
  'org.apache.hadoop.mapred.TextInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://metabase-athena/test-db/sightings/'
TBLPROPERTIES (
  'CrawlerSchemaDeserializerVersion'='1.0', 
  'CrawlerSchemaSerializerVersion'='1.0', 
  'UPDATED_BY_CRAWLER'='metabase', 
  'averageRecordSize'='63', 
  'classification'='json', 
  'compressionType'='none', 
  'objectCount'='1', 
  'recordCount'='1004', 
  'sizeKey'='63264', 
  'typeOfData'='file')
```

##### Tips

```
CREATE EXTERNAL TABLE `tips`(
  `text` string COMMENT 'from deserializer', 
  `url` struct<small:string,medium:string,large:string> COMMENT 'from deserializer', 
  `venue` struct<name:string,categories:array<string>,phone:string,id:string> COMMENT 'from deserializer', 
  `source` struct<service:string,facebookphotoid:string,url:string,username:string,mentions:array<string>,tags:array<string>,yelpphotoid:string,categories:array<string>,foursquarephotoid:string,mayor:string> COMMENT 'from deserializer', 
  `id` int COMMENT 'from deserializer')
ROW FORMAT SERDE 
  'org.openx.data.jsonserde.JsonSerDe' 
WITH SERDEPROPERTIES ( 
  'paths'='id,source,text,url,venue') 
STORED AS INPUTFORMAT 
  'org.apache.hadoop.mapred.TextInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://metabase-athena/test-db/tips/'
TBLPROPERTIES (
  'CrawlerSchemaDeserializerVersion'='1.0', 
  'CrawlerSchemaSerializerVersion'='1.0', 
  'UPDATED_BY_CRAWLER'='metabase', 
  'averageRecordSize'='637', 
  'classification'='json', 
  'compressionType'='none', 
  'objectCount'='1', 
  'recordCount'='500', 
  'sizeKey'='318670', 
  'typeOfData'='file')
```

##### Users

```
CREATE EXTERNAL TABLE `users`(
  `name` string COMMENT 'from deserializer', 
  `last_login` timestamp COMMENT 'from deserializer', 
  `password` string COMMENT 'from deserializer', 
  `id` int COMMENT 'from deserializer')
ROW FORMAT SERDE 
  'org.openx.data.jsonserde.JsonSerDe' 
WITH SERDEPROPERTIES ( 
  'paths'='id,last_login,name,password') 
STORED AS INPUTFORMAT 
  'org.apache.hadoop.mapred.TextInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://metabase-athena/test-db/users/'
TBLPROPERTIES (
  'CrawlerSchemaDeserializerVersion'='1.0', 
  'CrawlerSchemaSerializerVersion'='1.0', 
  'UPDATED_BY_CRAWLER'='metabase', 
  'averageRecordSize'='117', 
  'classification'='json', 
  'compressionType'='none', 
  'objectCount'='1', 
  'recordCount'='15', 
  'sizeKey'='1768', 
  'typeOfData'='file')
```

##### Venues

```
CREATE EXTERNAL TABLE `venues`(
  `name` string COMMENT 'from deserializer', 
  `latitude` double COMMENT 'from deserializer', 
  `longitude` double COMMENT 'from deserializer', 
  `price` int COMMENT 'from deserializer', 
  `category_id` int COMMENT 'from deserializer', 
  `id` int COMMENT 'from deserializer')
ROW FORMAT SERDE 
  'org.openx.data.jsonserde.JsonSerDe' 
WITH SERDEPROPERTIES ( 
  'paths'='category_id,id,latitude,longitude,name,price') 
STORED AS INPUTFORMAT 
  'org.apache.hadoop.mapred.TextInputFormat' 
OUTPUTFORMAT 
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://metabase-athena/test-db/venues/'
TBLPROPERTIES (
  'CrawlerSchemaDeserializerVersion'='1.0', 
  'CrawlerSchemaSerializerVersion'='1.0', 
  'UPDATED_BY_CRAWLER'='metabase', 
  'averageRecordSize'='102', 
  'classification'='json', 
  'compressionType'='none', 
  'objectCount'='1', 
  'recordCount'='100', 
  'sizeKey'='10206', 
  'typeOfData'='file')
```

## Run it!

```
MB_ATHENA_S3_STAGING_DIR=[bucket to save queries] MB_ATHENA_SCHEMA=[your test db] MB_ATHENA_REGION=[same region of athena db and staging dir] MB_ATHENA_USER=[AWS KEY] MB_ATHENA_PASSWORD=[AWS SECRET] ENGINES=h2,athena lein test # we need to add h2 too
```
