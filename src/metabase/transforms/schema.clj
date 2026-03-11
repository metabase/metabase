(ns metabase.transforms.schema
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.queries.schema :as queries.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::checkpoint-strategy
  [:map
   [:type [:= "checkpoint"]]
   ;; for native
   [:checkpoint-filter {:optional true} :string]
   ;; for mbql and python
   [:checkpoint-filter-unique-key {:optional true}
    ::lib.schema/column-unique-key]])

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
     ;; decode/normalize: convert FE map format to vec and enrich with DB metadata
     [:source-tables   [:sequential {:decode/normalize (fn [st]
                                                         (if (map? st)
                                                           (transforms-base.u/source-tables-map->vec st)
                                                           st))}
                        ::transforms-base.u/source-table-entry]]
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

(mr/def ::transform
  [:map
   [:id ::id]
   [:description {:optional true} [:maybe :string]]
   [:name :string]
   [:source [:ref ::transform-source]]
   [:target [:ref ::transform-target]]])
