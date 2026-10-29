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

(mr/def ::driver
  "A Metabase driver by name, `:postgres`, one the instance can load (see [[loadable-driver?]]). Column base types
  come from the driver's own [[metabase.driver.sql-jdbc.sync/database-type->base-type]]; a warehouse type the driver
  does not map is reported, and the fix is a mapping in the driver, which is meant to have one for every type its
  warehouse has."
  [:and
   :keyword
   [:fn {:error/message "not a driver the instance can load"} loadable-driver?]])

(mr/def ::config
  "The converter's configuration: what the manifest cannot supply, and how the metrics are written."
  [:map {:closed true}
   ;; `:databases` maps the warehouse database name as dbt knows it (`node_relation.database`) to the name of the
   ;; Metabase Database it is connected as. This is the one thing the manifest cannot supply.
   [:databases       [:map-of :string :string]]
   ;; `:driver` is the Metabase driver those databases use.
   [:driver          ::driver]
   ;; `:creator-email` is the user the cards are created as. Serdes resolves it by email and synthesizes an inactive
   ;; user when none exists, but a card cannot be imported without one.
   [:creator-email   :string]
   ;; `:collection-name` names the collection the metrics are written to; `\"dbt metrics\"` when it is not given.
   [:collection-name {:optional true} :string]
   ;; `:entity-models` says which semantic model a foreign entity joins to when more than one semantic model has the
   ;; entity as its primary entity: entity name → semantic model name. An entity exactly one model is primary for
   ;; needs no entry.
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
  derived metric's `[:metric id]` references use."
  [:map {:closed true}
   [:ir                     ::ir/metric]
   [:entity-id              ms/NanoIdString]
   [:card-id                ::lib.schema.id/card]
   [:metadata-provider      ::lib.schema.metadata/metadata-provider]
   [:semantic-model         :string]
   [:agg-time-dimension     [:maybe :string]]
   [:query                  ::lib.schema/query]
   [:dimensions             ::lib-metric.schema/persisted-dimensions]
   [:dimension-mappings     [:sequential ::lib-metric.schema/dimension-mapping]]
   [:unsupported-dimensions [:sequential ::unsupported-dimension]]])

(mr/def ::collection
  "The collection the metrics are written into."
  [:map {:closed true}
   [:name      :string]
   [:entity-id ms/NanoIdString]])

(mr/def ::manifest
  "The resolve stage's output: what the emit stage needs, plus everything that could not be resolved and why.
  `unsupported` carries over the parse stage's entries too, so it is the complete list for the run."
  [:map {:closed true}
   [:collection  ::collection]
   [:metrics     [:sequential ::metric]]
   [:unsupported [:sequential ::ir/unsupported]]])
