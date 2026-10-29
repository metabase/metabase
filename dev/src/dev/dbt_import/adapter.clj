(ns dev.dbt-import.adapter
  "Which Metabase driver connects to the warehouse a dbt adapter writes for, and the check that the config's `:driver`
  agrees with the adapter the manifest was written with (`metadata.adapter_type`, carried in the IR as
  `:adapter-type`). The driver decides the type map the column types go through and the sqlglot dialect the SQL is
  parsed in, so a `:driver` that disagrees with the manifest would silently give wrong base types and misread SQL;
  [[check-driver]] makes it fail instead."
  (:require
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(def adapter->driver
  "dbt adapter name (`metadata.adapter_type`, the `type` of the profile `dbt parse` ran with) → the Metabase driver for
  the warehouse it connects to. An adapter with no entry is a warehouse Metabase has no driver for (`duckdb`), or one
  this map does not know; [[check-driver]] then takes the config at its word, with a warning."
  {"postgres"   :postgres
   "redshift"   :redshift
   "snowflake"  :snowflake
   "bigquery"   :bigquery-cloud-sdk
   "databricks" :databricks
   "spark"      :sparksql
   "trino"      :starburst
   "presto"     :presto-jdbc
   "athena"     :athena
   "sqlserver"  :sqlserver
   "fabric"     :sqlserver
   "synapse"    :sqlserver
   "mysql"      :mysql
   "oracle"     :oracle
   "vertica"    :vertica
   "sqlite"     :sqlite
   "clickhouse" :clickhouse
   "druid"      :druid})

(mu/defn check-driver :- :nil
  "Check the config's `driver` against `adapter-type`, the dbt adapter the manifest was written with. Throws when
  [[adapter->driver]] maps the adapter to another driver: the type map and the SQL dialect would be the wrong
  warehouse's. Logs a warning, and lets the config stand, when the manifest names no adapter or one with no entry,
  since there is nothing to check against."
  [driver       :- :keyword
   adapter-type :- [:maybe :string]]
  (let [expected (get adapter->driver adapter-type)]
    (cond
      (nil? adapter-type)
      (log/warnf "The manifest records no adapter_type; taking the config's :driver %s at its word" driver)

      (nil? expected)
      (log/warnf "No Metabase driver is known for the dbt adapter %s; taking the config's :driver %s at its word"
                 (pr-str adapter-type) driver)

      (not= expected driver)
      (throw (ex-info (format (str "The manifest was written with the dbt adapter %s, whose warehouse Metabase connects"
                                   " to with the %s driver, but the config's :driver is %s: the column types and the"
                                   " SQL would be read as another warehouse's")
                              (pr-str adapter-type) expected driver)
                      {:adapter-type    adapter-type
                       :expected-driver expected
                       :driver          driver})))))
