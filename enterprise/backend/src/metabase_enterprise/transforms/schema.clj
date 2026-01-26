(ns metabase-enterprise.transforms.schema
  (:require
   [metabase.lib.metadata.column :as lib.metadata.column]
   [metabase.lib.schema.common :as lib.schema.common]
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
   ;; for native
   [:checkpoint-filter {:optional true} :string]
   ;; for mbql and python
   [:checkpoint-filter-unique-key {:optional true}
    ::lib.metadata.column/column-unique-key]])

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
   [:schema {:optional true} [:or ms/NonBlankString :nil]]
   [:name :string]])

(mr/def ::table-incremental-target
  [:map
   [:database {:optional true} :int]
   [:type [:= "table-incremental"]]
   [:schema {:optional true} [:or ms/NonBlankString :nil]]
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

;;; -------------------------------------------------- Inspector Schemas ---------------------------------------------------

(mr/def ::inspector-source-type
  "The type of transform source being inspected."
  [:enum :mbql :native :python])

(mr/def ::inspector-status
  "Status of the inspector result."
  [:enum :not-run :ready])

(mr/def ::inspector-table-summary
  "Summary statistics for a table."
  [:map
   [:table-name :string]
   [:row-count {:optional true} [:maybe :int]]
   [:column-count {:optional true} :int]])

(mr/def ::inspector-summary
  "Summary section of inspector output."
  [:map
   [:inputs [:sequential ::inspector-table-summary]]
   [:output ::inspector-table-summary]])

(mr/def ::inspector-join
  "Join information from MBQL transform."
  [:map
   [:strategy :keyword]
   [:alias {:optional true} [:maybe :string]]
   [:source-table {:optional true} [:maybe :any]]])

(mr/def ::inspector-field-stats
  "Statistics for a field from fingerprints."
  [:map
   ;; Global stats
   [:distinct-count {:optional true} :int]
   [:nil-percent {:optional true} :double]
   ;; Number stats
   [:min {:optional true} :double]
   [:max {:optional true} :double]
   [:avg {:optional true} :double]
   [:q1 {:optional true} :double]
   [:q3 {:optional true} :double]
   ;; Temporal stats
   [:earliest {:optional true} :string]
   [:latest {:optional true} :string]])

(mr/def ::inspector-field
  "Field metadata for inspector."
  [:map
   [:id {:optional true} pos-int?]
   [:name :string]
   [:display-name {:optional true} [:maybe :string]]
   [:base-type {:optional true} [:maybe :keyword]]
   [:semantic-type {:optional true} [:maybe :keyword]]
   [:stats {:optional true} [:maybe ::inspector-field-stats]]])

(mr/def ::inspector-source-detail
  "Detailed information about a source table."
  [:map
   [:table-id {:optional true} pos-int?]
   [:table-name :string]
   [:schema {:optional true} [:maybe :string]]
   [:db-id {:optional true} pos-int?]
   [:row-count {:optional true} [:maybe :int]]
   [:column-count {:optional true} :int]
   [:fields {:optional true} [:sequential ::inspector-field]]])

(mr/def ::inspector-target-detail
  "Detailed information about the target table."
  [:map
   [:table-id pos-int?]
   [:table-name :string]
   [:schema {:optional true} [:maybe :string]]
   [:row-count {:optional true} [:maybe :int]]
   [:column-count :int]
   [:fields [:sequential ::inspector-field]]])

(mr/def ::inspector-card
  "A visualization card in the inspector output."
  [:map
   [:id :string]
   [:source :keyword]
   [:table-name :string]
   [:field-name :string]
   [:title :string]
   [:display :keyword]
   [:dataset_query :map]])

(mr/def ::inspector-column-comparison
  "A group of cards comparing input/output columns."
  [:map
   [:id :string]
   [:output-column :string]
   [:cards [:sequential ::inspector-card]]])

(mr/def ::inspector-result
  "Complete result from transform inspection."
  [:map
   [:name :string]
   [:description :string]
   [:status ::inspector-status]
   [:source-type ::inspector-source-type]
   [:summary {:optional true} ::inspector-summary]
   [:joins {:optional true} [:maybe [:sequential ::inspector-join]]]
   [:sources [:sequential ::inspector-source-detail]]
   [:target {:optional true} ::inspector-target-detail]
   [:column-comparisons {:optional true} [:sequential ::inspector-column-comparison]]])
