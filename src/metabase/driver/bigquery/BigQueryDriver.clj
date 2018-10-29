(ns metabase.driver.bigquery.BigQueryDriver
  (:gen-class :implements [clojure.lang.Named]))

(defn -getName
  "clojure.lang.Named.getName() implementation"
  [_]
  "BigQuery")
