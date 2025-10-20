(ns metabase-enterprise.transforms.schema
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::keyset-strategy
  [:map
   [:type [:= "keyset"]]
   [:keyset-column :string]])

(mr/def ::source-incremental-strategy
  [:multi {:dispatch :type}
   ["keyset" ::keyset-strategy]])

(mr/def ::transform-source
  [:multi {:dispatch (comp keyword :type)}
   [:query
    [:map
     [:type [:= "query"]]
     [:query [:map [:database :int]]]
     [:source-incremental-strategy {:optional true} ::source-incremental-strategy]]]
   [:python
    [:map {:closed true}
     [:source-database {:optional true} :int]
     ;; NB: if source is keyset, only one table allowed
     [:source-tables   [:map-of :string :int]]
     [:type [:= "python"]]
     [:body :string]
     [:source-incremental-strategy {:optional true} ::source-incremental-strategy]]]])

(mr/def ::append-config
  [:map [:type [:= "append"]]])

#_(mr/def ::merge-config
    [:map
     [:type [:= "merge"]]
     [:primary-key [:sequential :string]]
     [:update-columns {:optional true} [:sequential :string]]]) ; columns to update on conflict

(mr/def ::target-incremental-strategy
  [:multi {:dispatch :type}
   ["append" ::append-config]
   #_["merge" ::merge-config]])

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
