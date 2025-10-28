(ns representations.schema.v0.metric
  (:require
   [representations.read.impl :as read-impl]
   [representations.schema.representation :as representation]
   [representations.schema.v0.column :as column]
   [representations.schema.v0.common :as common]
   [representations.util.malli.registry :as mr]))

(mr/def ::metric
  [:and
   [:merge
    ::representation/representation
    [:map
     {:closed true
      :description "v0 schema for human-writable metric representation"}
     [:name {:optional true} ::common/name]
     [:description {:optional true} ::common/description]
     [:database ::common/database]
     [:query {:optional true} ::common/query]
     [:mbql_query {:optional true} ::common/mbql-query]
     [:columns {:optional true} ::column/columns]
     [:collection {:optional true} ::common/collection]]]
   [:fn {:error/message "Must have exactly one of :query or :mbql_query"}
    (fn [{:keys [query mbql_query]}]
      (= 1 (count (filter some? [query mbql_query]))))]])

(defmethod read-impl/representation->schema [:v0 :metric] [_] ::metric)
