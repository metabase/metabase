(ns dev.dbt-import.schemas.resolved
  "Schemas for the converter config and for the resolve stage's output: IR metrics bound to Metabase portable refs
  and base types, ready for the emit stage."
  (:require
   [dev.dbt-import.schemas.ir :as ir]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::config
  [:map
   ;; `:databases` maps the warehouse database name as dbt knows it (`node_relation.database`) to the name of the
   ;; Metabase Database it is connected as. This is the one thing the manifest cannot supply.
   [:databases       [:map-of :string :string]]
   ;; `:driver` is the Metabase driver those databases use, e.g. `:postgres`. Column base types come from the driver's
   ;; own `database-type->base-type`.
   [:driver          :keyword]
   ;; `:creator-email` is the user the cards are created as. Serdes resolves it by email and synthesizes an inactive
   ;; user when none exists, but a card cannot be imported without one.
   [:creator-email   :string]
   ;; `:base-types` overrides the driver's mapping for warehouse types it does not know. Keys are lower-case warehouse
   ;; type names without length suffixes, e.g. `\"geography\"`.
   ;;
   ;; TODO (Cam 2026-10-22) -- I don't think we need or WANT this, drivers should have complete mappings of all
   ;; database types and if we're missing any we should add them there.
   [:base-types      {:optional true} [:map-of :string ::lib.schema.common/base-type]]
   ;; `:collection-name` names the collection the metrics are written to.
   [:collection-name {:optional true} :string]])

;; TODO (Cam 2026-10-22) there has to be an existing schema for this somewhere in the codebase already
(mr/def ::entity-id
  "A 21-character NanoID, as used for `entity_id`."
  [:re #"^[A-Za-z0-9_-]{21}$"])

;; TODO (Cam 2026-10-22) aren't there already schemas for this and `::field-ref` somewhere already?
(mr/def ::table-ref
  "Serdes portable table reference: `[database schema table]`, all by name."
  [:tuple :string :string :string])

(mr/def ::field-ref
  "Serdes portable field reference: `[database schema table column]`, all by name."
  [:tuple :string :string :string :string])

(mr/def ::field
  "A resolved column: its portable ref and Metabase base type."
  [:map
   [:ref       ::field-ref]
   [:base-type ::lib.schema.common/base-type]])

(mr/def ::metric
  "An IR metric whose source table and aggregated column are resolved. `field` is nil when the aggregation is over
  the literal `1`, i.e. a row count."
  [:map
   [:metric       ::ir/metric]
   [:entity-id    ::entity-id]
   [:database     :string]
   [:source-table ::table-ref]
   [:field        [:maybe ::field]]])

(mr/def ::collection
  "The collection the metrics are written into."
  [:map
   [:name      :string]
   [:entity-id ::entity-id]])

(mr/def ::manifest
  "The resolve stage's output: what the emit stage needs, plus everything that could not be resolved and why.
  `unsupported` carries over the parse stage's entries too, so it is the complete list for the run."
  [:map
   [:collection  ::collection]
   [:metrics     [:sequential ::metric]]
   [:unsupported [:sequential ::ir/unsupported]]])
