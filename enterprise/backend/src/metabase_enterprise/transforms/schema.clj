(ns metabase-enterprise.transforms.schema
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::keyset-strategy
  [:map
   [:type [:= "keyset"]]
   [:keyset-column :string]
   [:table-name {:optional true} :string]]) ; for python transforms with multiple tables

(mr/def ::source-strategy
  [:multi {:dispatch :type}
   ["keyset" ::keyset-strategy]])

(mr/def ::transform-source
  [:multi {:dispatch (comp keyword :type)}
   [:query
    [:map
     [:type [:= "query"]]
     [:query [:map [:database :int]]]
     [:source-strategy {:optional true} ::source-strategy]]]
   [:python
    [:map {:closed true}
     [:source-database {:optional true} :int]
     [:source-tables   [:map-of :string :int]]
     [:type [:= "python"]]
     [:body :string]
     [:source-strategy {:optional true} ::source-strategy]]]])

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

(mr/def ::transform-target
  [:map
   [:database {:optional true} :int]
   [:type [:enum "table" "table-incremental"]]
   [:schema {:optional true} [:or ms/NonBlankString :nil]]
   [:name :string]

   ;; only for table-incremental, TODO: specify with a multi spec
   [:target-incremental-strategy {:optional true} ::target-incremental-strategy]])
