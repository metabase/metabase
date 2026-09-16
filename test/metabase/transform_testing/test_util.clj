(ns metabase.transform-testing.test-util
  "Helpers shared by the transform-testing tests that run against a real warehouse."
  (:require
   [metabase.driver :as driver]))

(defn cast-types
  "An integer and a text `database_type` the current driver accepts as a `CAST` target.

  A test's declared types are raw SQL, so a fixture has to spell them the way the warehouse under test does."
  []
  (case driver/*driver*
    :mysql              ["SIGNED" "CHAR(50)"]
    :sqlserver          ["int" "nvarchar(50)"]
    ;; ClickHouse casts NULL only to a nullable type
    :clickhouse         ["Nullable(Int32)" "Nullable(String)"]
    :bigquery-cloud-sdk ["INT64" "STRING"]
    ["INTEGER" "VARCHAR(50)"]))
