(ns metabase.transforms.schema
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::source-table-ref
  "A reference to a source table by name, for cases where table_id may not exist yet.
  Also saves querying metadata in situations where we'll need the name."
  [:map
   [:database_id :int]
   [:schema {:optional true} [:maybe :string]]
   [:table :string]
   [:table_id {:optional true} [:maybe :int]]])

(mr/def ::source-table-value
  "Either a table ID (int) or a reference map."
  [:or :int ::source-table-ref])

(mr/def ::checkpoint-strategy
  [:map
   [:type [:= "checkpoint"]]
   [:checkpoint-filter-field-id {:optional true} ::lib.schema.id/field]])

(mr/def ::source-incremental-strategy
  [:multi {:dispatch :type}
   ["checkpoint" ::checkpoint-strategy]])

(mr/def ::transform-source
  [:multi {:dispatch (comp keyword :type)}
   [:query
    [:map
     [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :query]]
     [:query ::queries.schema/query]
     [:source-incremental-strategy {:optional true} ::source-incremental-strategy]]]
   [:python
    [:map
     [:source-database {:optional true} :int]
     ;; NB: if source is checkpoint, only one table allowed
     [:source-tables   [:map-of :string ::source-table-value]]
     [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :python]]
     [:body :string]
     [:source-incremental-strategy {:optional true} ::source-incremental-strategy]]]])

(mr/def ::append-config
  [:map [:type [:= "append"]]])

(mr/def ::target-incremental-strategy
  [:multi {:dispatch :type}
   ["append" ::append-config]])

(mr/def ::table-target
  [:map
   [:database {:optional true} :int]
   [:type [:= "table"]]
   [:schema {:optional true} [:maybe ms/NonBlankString]]
   [:name :string]])

(mr/def ::table-incremental-target
  [:map
   [:database {:optional true} :int]
   [:type [:= "table-incremental"]]
   [:schema {:optional true} [:maybe ms/NonBlankString]]
   [:name :string]
   [:target-incremental-strategy ::target-incremental-strategy]])

(mr/def ::transform-target
  [:multi {:dispatch :type}
   ["table" ::table-target]
   ["table-incremental" ::table-incremental-target]])

(mr/def ::id pos-int?)

(mr/def ::run-id pos-int?)

(mr/def ::transform
  [:map
   [:id ::id]
   [:description {:optional true} [:maybe :string]]
   [:name :string]
   [:source [:ref ::transform-source]]
   [:target [:ref ::transform-target]]])

;;; ----------------------------------------- Source Range Params -----------------------------------------------

(mr/def ::checkpoint-bound
  "A bound (lo or hi) for incremental checkpoint filtering."
  [:map
   [:value :any]])

(mr/def ::source-range-params
  "Parameters for incremental range filtering on a source query.
   Returned by get-source-range-params."
  [:map
   [:column ::lib.schema.metadata/column]
   [:checkpoint-filter-field-id ::lib.schema.id/field]
   [:lo {:optional true} [:maybe ::checkpoint-bound]]
   [:hi {:optional true} [:maybe ::checkpoint-bound]]])
