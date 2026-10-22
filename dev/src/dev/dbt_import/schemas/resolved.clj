(ns dev.dbt-import.schemas.resolved
  "Schemas for the converter config and for the resolve stage's output: IR metrics bound to Metabase portable refs
  and base types, ready for the emit stage."
  (:require
   [dev.dbt-import.schemas.ir :as ir]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::config
  "Converter configuration.

  * `:databases` maps the warehouse database name as dbt knows it (`node_relation.database`) to the name of the
    Metabase Database it is connected as. This is the one thing the manifest cannot supply.
  * `:driver` is the Metabase driver those databases use, e.g. `:postgres`. Column base types come from the
    driver's own `database-type->base-type`.
  * `:creator-email` is the user the cards are created as. Serdes resolves it by email and synthesizes an inactive
    user when none exists, but a card cannot be imported without one.
  * `:base-types` overrides the driver's mapping for warehouse types it does not know. Keys are lower-case
    warehouse type names without length suffixes, e.g. `\"geography\"`.
  * `:collection-name` names the collection the metrics are written to."
  [:map
   [:databases [:map-of :string :string]]
   [:driver :keyword]
   [:creator-email :string]
   [:base-types {:optional true} [:map-of :string :keyword]]
   [:collection-name {:optional true} :string]])

(mr/def ::entity-id
  "A 21-character NanoID, as used for `entity_id`."
  [:re #"^[A-Za-z0-9_-]{21}$"])

(mr/def ::table-ref
  "Serdes portable table reference: `[database schema table]`, all by name."
  [:tuple :string :string :string])

(mr/def ::field-ref
  "Serdes portable field reference: `[database schema table column]`, all by name."
  [:tuple :string :string :string :string])

(mr/def ::field
  "A resolved column: its portable ref and Metabase base type."
  [:map
   [:ref ::field-ref]
   [:base-type :keyword]])

(mr/def ::metric
  "An IR metric whose source table and aggregated column are resolved. `field` is nil when the aggregation is over
  the literal `1`, i.e. a row count."
  [:map
   [:metric ::ir/metric]
   [:entity-id ::entity-id]
   [:database :string]
   [:source-table ::table-ref]
   [:field [:maybe ::field]]])

(mr/def ::collection
  "The collection the metrics are written into."
  [:map
   [:name :string]
   [:entity-id ::entity-id]])

(mr/def ::manifest
  "The resolve stage's output: what the emit stage needs, plus everything that could not be resolved and why.
  `unsupported` carries over the parse stage's entries too, so it is the complete list for the run."
  [:map
   [:collection ::collection]
   [:metrics [:sequential ::metric]]
   [:unsupported [:sequential ::ir/unsupported]]])
