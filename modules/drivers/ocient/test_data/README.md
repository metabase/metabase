# Prereq:
Easily Convert EDN to JSON. Visit this site to take any edn file from original folder and turn into a JSON version of the file for converted/
http://cljson.com/


## Convert JSON to CSV for file loading:
python3 json_of_edn_to_csv.py

NOTE: Some settings exist in the python file to control what is generated (JSONL, CSV, pipelines, etc)

Also Note: some of the generated pipelines are "dumb" and require custom transformations to handle the timestamp format in different metabase data sets. Some have optional decimal seconds and different timezone handling. If you rerun the generation, those will be overwritten.


## Metabase Test Data in `test_data`
* original - the original EDN files from Metabase's repo
* converted - JSON version of EDN files


## Metabase Test Data in `test_data/output` folder:

* csv - csv output of the metabase data
* jsonl - newline delimited json of the metabase test data
* pipelines - generated pipelines for use in loading JSONL into tables; Both COS and file system versions exist. Will need customization for file system location depending on your load setup. A combined pipeline exists for all tables at once as separate file groups.
* ddl - ddl to create tables. A combined version exists for all tables.

## Databases seen during test run:

Metabases tries to work with the following databases. More are defined in dataset_definitions.clj:

sample-dataset
test-data
test-data-with-time
places-cam-likes
sad-toucan-incidents
toucan-microsecond-incidents
string-times
checkins_interval_86400
office-checkins
checkins_interval_15
enteredcheckins_interval_900
attempted-murders
bird-flocks
daily-bird-counts
airports
tupac-sightings
avian-singles
test-data-self-referencing-user


# Setup
1. Create tables:
```
 source /Users/jkelley/src/sales/metabase_ocient_driver/test_data/output/ddl/consolidated_ddl.sql;
```

2. Create user mb on databases:
```
source /Users/jkelley/src/sales/metabase_ocient_driver/test_data/output/ddl/grant_user_mb.sql;
```

3. Run pipeline.json
```
 lat_client pipeline create --scheme http --pipeline ~/src/sales/metabase_ocient_driver/test_data/output/pipelines/master_pipeline_cos.json --hosts 10.10.110.4:8080

 lat_client pipeline start --scheme http --hosts 10.10.110.4:8080
```

4. Create the extra databases (derivatives). This also creates the mb user and grants Analyst role:
```
source /Users/jkelley/src/sales/metabase_ocient_driver/test_data/output/ddl/consolidated_ddl_extras.sql;
```

5. Run second pipeline for these tables:
```
 lat_client pipeline start --scheme http --hosts 10.10.110.4:8080
 lat_client pipeline delete --scheme http --hosts 10.10.110.4:8080
 lat_client pipeline create --scheme http --pipeline ~/src/sales/metabase_ocient_driver/test_data/output/pipelines/extras_pipeline_cos.json --hosts 10.10.110.4:8080

 lat_client pipeline start --scheme http --hosts 10.10.110.4:8080
```
6. Run the DDL for databases we aren't populating yet. These are databases the test suite looks for but we haven't built the data loading for (or may need to be populated at runtime to have relative datetimes which is a little more challenging):
```
source /Users/jkelley/src/sales/metabase_ocient_driver/test_data/output/ddl/consolidated_ddl_not_created.sql;

```
7. Run the driver test from the /metabase root directory :

```
DRIVERS=ocient clojure -X:dev:drivers:drivers-dev:test
```
NOTE: This creates lots of errors like the following that we haven't resolved yet, but many tests pass:
```
clojure.lang.ExceptionInfo: Couldn't find Field "price" for Table "venues".
                            Found:
                            {}

     all-fields: {}
       database: "test-data"
    database-id: 82
     field-name: "price"
          table: "venues"
       table-id: 120
                        metabase.test.data.impl/the-field-id*              impl.clj:  223
                        metabase.test.data.impl/the-field-id*              impl.clj:  216
                                                          ...
                         metabase.test.data.impl/the-field-id              impl.clj:  241
                         metabase.test.data.impl/the-field-id              impl.clj:  232
                                                          ...
                                           clojure.core/apply              core.clj:  669
                                        metabase.test.data/id              data.clj:  202
                                        metabase.test.data/id              data.clj:  191
                                                          ...
      metabase.query-processor-test.aggregation-test/fn/fn/fn  aggregation_test.clj:   38
         metabase.query-processor-test.aggregation-test/fn/fn  aggregation_test.clj:   35
metabase.test.data.datasets/do-with-driver-when-testing/fn/fn          datasets.clj:   41
                               metabase.driver/do-with-driver            driver.clj:   60

```
