(ns metabase-enterprise.transforms.schema
  (:require
   [metabase.lib.schema.common :as schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::source-strategy-type
  [:enum
   "full-table"
   "keyset-paginated" ; pagination on strictly monotonic key(s)
   "custom-filter"])  ; user-provided filter expression

(mr/def ::keyset-pagination-config
  [:map
   [:type [:= "keyset-paginated"]]
   [:keyset-columns [:sequential :string]]
   [:chunk-size {:optional true} :int]
   [:table-name {:optional true} :string]]) ; for python transforms with multiple tables

(mr/def ::custom-filter-config
  [:map
   [:type [:= "custom-filter"]]
   [:filter-query :map] ; native or mbql, can refer to `watermark-variable` e.g. `timestamp < {{watermark-name}}`
   [:watermark-variable {:optional true} :string]

   ;; but how do we tie the knot? if we want to refer to the last watermark
   [:watermark-expression {:optional true} :map]])

(mr/def ::target-strategy-type
  [:enum "replace" "append" "merge"])

(mr/def ::replace-config
  [:map
   [:type [:= "replace"]]])

(mr/def ::append-config
  [:map
   [:type [:= "append"]]
   [:tag-run-id? {:optional true} :boolean]]) ; whether to tag rows with run_id

(mr/def ::merge-config
  [:map
   [:type [:= "merge"]]
   [:primary-key [:sequential :string]]
   [:update-columns {:optional true} [:sequential :string]]]) ; columns to update on conflict

(mr/def ::target-strategy
  [:multi {:dispatch :type}
   ["replace" ::replace-config]
   ["append" ::append-config]
   ["merge" ::merge-config]])

(mr/def ::transform-source
  [:multi {:dispatch (comp keyword :type)}
   [:query
    [:map
     [:type [:= "query"]]
     [:query [:map [:database :int]]]
     [:source-strategy {:optional true} ::source-strategy]]] ; defaults to :full-table
   [:python
    [:map {:closed true}
     [:source-database {:optional true} :int]
     [:source-tables   [:map-of :string :int]]
     [:type [:= "python"]]
     [:body :string]
     [:source-strategy {:optional true} ::source-strategy]]]])

(mr/def ::transform-target
  [:map
   [:database {:optional true} :int]
   [:type [:enum {:decode/normalize schema.common/normalize-keyword}
           :table :table-incremental]]
   [:schema {:optional true} [:or ms/NonBlankString :nil]]
   [:name :string]
   [:target-strategy {:optional true} ::target-strategy]])
