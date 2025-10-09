(ns metabase-enterprise.transforms.schema
  (:require
   [metabase.lib.schema.common :as schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::append-config
  [:map
   [:type [:= "append"]]
   #_[:tag-run-id? {:optional true} :boolean]]) ; whether to tag rows with run_id

#_(mr/def ::merge-config
    [:map
     [:type [:= "merge"]]
     [:primary-key [:sequential :string]]
     [:update-columns {:optional true} [:sequential :string]]]) ; columns to update on conflict

(mr/def ::target-strategy
  [:multi {:dispatch :type}
   ["append" ::append-config]
   #_["merge" ::merge-config]])

(mr/def ::transform-source
  [:multi {:dispatch (comp keyword :type)}
   [:query
    [:map
     [:type [:= "query"]]
     [:query [:map [:database :int]]]]]
   [:python
    [:map {:closed true}
     [:source-database {:optional true} :int]
     [:source-tables   [:map-of :string :int]]
     [:type [:= "python"]]
     [:body :string]]]])

(mr/def ::transform-target
  [:map
   [:database {:optional true} :int]
   [:type [:enum {:decode/normalize schema.common/normalize-keyword}
           :table :table-incremental]]
   [:schema {:optional true} [:or ms/NonBlankString :nil]]
   [:name :string]

   ;; only for table-incremental, TODO: specify with a multi spec
   [:target-strategy {:optional true} ::target-strategy]])
