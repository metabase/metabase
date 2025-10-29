(ns representations.schema.v0.question
  (:require
   [representations.read.impl :as read-impl]
   [representations.schema.representation :as representation]
   [representations.schema.v0.common :as common]
   [representations.util.malli.registry :as mr]))

(mr/def ::question
  [:and
   [:merge
    ::representation/representation
    [:map
     {:closed true
      :description "v0 schema for human-writable question representation"}
     [:display_name {:optional true} ::common/display-name]
     [:description {:optional true} ::common/description]
     [:database ::common/database]
     [:query {:optional true} ::common/query]
     [:mbql_query {:optional true} ::common/mbql-query]
     [:lib_query {:optional true} ::common/lib-query]
     [:collection {:optional true} ::common/collection]]]
   [:fn {:error/message "Must have exactly one of :query or :mbql_query"}
    (fn [{:keys [query mbql_query lib_query]}]
      (= 1 (count (filter some? [query mbql_query lib_query]))))]])

(defmethod read-impl/representation->schema [:v0 :question] [_] ::question)
