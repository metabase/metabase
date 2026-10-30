(ns metabase-enterprise.semantic-layer-import.dbt.adapter
  "Which Metabase driver connects to the warehouse a dbt adapter writes for. The manifest records the adapter it was
  written with (`metadata.adapter_type`), and [[warehouse]] says what that means in the IR's terms, which
  [[metabase-enterprise.semantic-layer-import.core/check-driver]] checks the config's `:driver` against."
  (:require
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase.util.malli :as mu]))

(def adapter->driver
  "dbt adapter name (`metadata.adapter_type`, the `type` of the profile `dbt parse` ran with) → the Metabase driver for
  the warehouse it connects to. An adapter with no entry is a warehouse Metabase has no driver for (`duckdb`), or one
  this map does not know; the import then takes the config at its word, with a warning."
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

(mu/defn warehouse :- ::ir/warehouse
  "The IR's warehouse for a manifest written with the dbt adapter `adapter-type`: the adapter's name and the driver
  [[adapter->driver]] maps it to; both nil when the manifest records none."
  [adapter-type :- [:maybe :string]]
  {:type   adapter-type
   :driver (get adapter->driver adapter-type)})
