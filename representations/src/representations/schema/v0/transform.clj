(ns representations.schema.v0.transform
  (:require
   [representations.read.impl :as read-impl]
   [representations.schema.representation :as representation]
   [representations.schema.v0.common :as common]
   [representations.util.malli.common :as mc]
   [representations.util.malli.registry :as mr]))

(mr/def ::target-table
  [:and
   {:description "Name of the destination table"}
   ::mc/non-blank-string])

(mr/def ::target-schema
  [:and
   {:description "Database schema for the target table (e.g., 'public', 'reporting')"}
   ::mc/non-blank-string])

(mr/def ::tags
  [:sequential
   {:description "Optional tags for categorizing and organizing transforms"}
   ::mc/non-blank-string])

(mr/def ::source
  [:map
   {:closed true
    :description "Source for the transform - either a SQL query or MBQL query"}
   [:query {:optional true} ::common/query]
   [:mbql_query {:optional true} ::common/mbql-query]])

(mr/def ::target
  [:map
   {:closed true
    :description "Target table configuration for the transform output"}
   [:table ::target-table]
   [:schema {:optional true} ::target-schema]])

(mr/def ::transform
  [:and
   [:merge
    ::representation/representation
    [:map
     {:closed true
      :description "v0 schema for human-writable transform representation"}
     [:name {:optional true} ::common/name]
     [:description {:optional true} ::common/description]
     [:database ::common/database]
     [:source {:optional true} ::source]
     [:target {:optional true} ::target]
     [:target_table {:optional true} ::target]
     [:query {:optional true} ::common/query]
     [:mbql_query {:optional true} ::common/mbql-query]
     [:lib_query {:optional true} ::common/lib-query]
     [:tags {:optional true} ::tags]]]
   [:fn {:error/message "Source must have exactly one of :query or :mbql_query"}
    (fn [{:keys [query mbql_query lib_query] :as _transform}]
      (= 1 (count (filter some? [query mbql_query lib_query]))))]])

(defmethod read-impl/representation->schema [:v0 :transform] [_] ::transform)
