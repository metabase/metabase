(ns dev.dbt-import.schemas.resolved
  "Schemas for the converter config and for the resolve stage's output: IR metrics bound to Lib queries, ready for the
  emit stage."
  (:require
   [dev.dbt-import.schemas.ir :as ir]
   [metabase.driver :as driver]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mu/defn- loadable-driver? :- :boolean
  "Whether `driver` names a driver the instance can load: drivers register when their namespace loads, which
  [[driver/the-initialized-driver]] does on first use, so an unloaded `:mysql` is as good as a loaded one and only a
  name no driver answers to fails."
  [driver :- :keyword]
  (boolean (try
             (driver/the-initialized-driver driver)
             (catch Throwable _
               false))))

(mu/defn jdbc-driver? :- :boolean
  "Whether `driver`, once loaded, is a JDBC driver: one derived from `:sql-jdbc`. Only a JDBC driver has the
  [[metabase.driver.sql-jdbc.sync/database-type->base-type]] mapping the converter types the project's columns with,
  so `:mongo` or `:bigquery-cloud-sdk` cannot be converted for."
  [driver :- :keyword]
  (isa? driver/hierarchy driver :sql-jdbc))

(mr/def ::driver
  "A Metabase driver by name, `:postgres`: one the instance can load (see [[loadable-driver?]]) and a JDBC one (see
  [[jdbc-driver?]]). Column base types come from the driver's own
  [[metabase.driver.sql-jdbc.sync/database-type->base-type]]; a warehouse type the driver does not map is reported,
  and the fix is a mapping in the driver, which is meant to have one for every type its warehouse has."
  [:and
   :keyword
   [:fn {:error/fn (fn [{:keys [value]} _]
                     (if (loadable-driver? value)
                       "not a JDBC driver: the converter types columns through the driver's sql-jdbc type mapping"
                       "not a driver the instance can load"))}
    (fn [driver]
      (and (loadable-driver? driver) (jdbc-driver? driver)))]])

(mr/def ::identifier-case
  "How a warehouse stores an identifier written without quotes, which is how sync sees it: `:upper` (Snowflake,
  Oracle, H2), `:lower` (Postgres, Redshift, the Trino family) or `:as-is`, the spelling kept (MySQL, SQL Server,
  SQLite, BigQuery). See [[dev.dbt-import.metadata/identifier-case]] for how the converter picks one."
  [:enum :upper :lower :as-is])

(mr/def ::config
  "The converter's configuration: what the manifest cannot supply, and how the metrics are written."
  [:map {:closed true}
   ;; `:databases` maps the warehouse database name as dbt knows it (`node_relation.database`) to the name of the
   ;; Metabase Database it is connected as, as typed, letter case included. This is the one thing the manifest cannot
   ;; supply. The key is nil for an adapter that writes `database: null` (dbt-mysql, whose MySQL database is the
   ;; `schema_name`).
   [:databases       [:map-of [:maybe :string] :string]]
   ;; `:driver` is the Metabase driver those databases use.
   [:driver          ::driver]
   ;; `:identifier-case` overrides what the driver says about an identifier dbt wrote without quotes (see
   ;; [[dev.dbt-import.metadata/identifier-case]]); a part dbt quoted is never folded.
   [:identifier-case {:optional true} ::identifier-case]
   ;; `:schema-mapping` maps a dbt `schema_name` to the schema the instance has the table under, nil for none,
   ;; overriding the default (the schema as the driver stores it, or nil for a driver without schemas) for that
   ;; schema only.
   [:schema-mapping  {:optional true} [:map-of :string [:maybe :string]]]
   ;; `:creator-email` is the user the cards are created as. Serdes resolves it by email and synthesizes an inactive
   ;; user when none exists, but a card cannot be imported without one.
   [:creator-email   :string]
   ;; `:collection-name` names the collection the metrics are written to; `\"dbt metrics\"` when it is not given.
   [:collection-name {:optional true} :string]
   ;; `:entity-models` says which semantic model a foreign or unique entity joins to when more than one other
   ;; semantic model is keyed by it, as its primary entity or as a unique one: entity name → semantic model name. An
   ;; entity exactly one model is keyed by needs no entry.
   [:entity-models   {:optional true} [:map-of :string :string]]])

(mr/def ::unsupported-dimension
  "A dbt dimension of a converted metric that could not become one of its curated dimensions, and why."
  [:map {:closed true}
   [:name   :string]
   [:reason :string]])

(mr/def ::metric
  "An IR metric (`ir`) bound to Metabase: the Lib query that computes it and its curated dimensions and mappings, built
  against the [[dev.dbt-import.metadata]] provider for its database, which is what turns their ids back into names
  when they are written out. `semantic-model` names the model the query is over and `agg-time-dimension` its default
  time dimension; for a ratio or derived metric both come from its inputs. `unsupported-dimensions` lists the dbt
  dimensions that could not be curated dimensions. `card-id` is the metric's id in that provider, which a ratio or
  derived metric's `[:metric id]` references use. `notes` is what a user of the metric should know that the query does
  not say (see [[dev.dbt-import.resolve/notes]]): where it agrees with dbt only under some conditions."
  [:map {:closed true}
   [:ir                     ::ir/metric]
   [:entity-id              ms/NanoIdString]
   [:card-id                ::lib.schema.id/card]
   [:metadata-provider      ::lib.schema.metadata/metadata-provider]
   [:semantic-model         :string]
   [:agg-time-dimension     [:maybe :string]]
   [:query                  ::lib.schema/query]
   [:notes                  [:sequential :string]]
   [:dimensions             ::lib-metric.schema/persisted-dimensions]
   [:dimension-mappings     [:sequential ::lib-metric.schema/dimension-mapping]]
   [:unsupported-dimensions [:sequential ::unsupported-dimension]]])

(mr/def ::error
  "A metric the converter failed on: an unexpected exception while resolving it, which is a bug in the converter or an
  input it did not anticipate, not something dbt can say that Metabase cannot (that is an `::ir/unsupported`).
  `message` names the exception."
  [:map {:closed true}
   [:name      :string]
   [:unique-id :string]
   [:message   :string]])

(mr/def ::collection
  "The collection the metrics are written into."
  [:map {:closed true}
   [:name      :string]
   [:entity-id ms/NanoIdString]])

(mr/def ::manifest
  "The resolve stage's output: what the emit stage needs, plus everything that could not be resolved and why.
  `unsupported` carries over the parse stage's entries too, so it is the complete list for the run; `errors` are the
  metrics the converter itself failed on (see `::error`)."
  [:map {:closed true}
   [:collection  ::collection]
   [:metrics     [:sequential ::metric]]
   [:unsupported [:sequential ::ir/unsupported]]
   [:errors      [:sequential ::error]]])
