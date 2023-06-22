(ns metabase.lib.jvm.test-util
  (:require
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.test.data :as data]
   [metabase.util :as u]))

(defn pmbql-query-for-source-card
  "Create a pMBQL query against a source `card-or-id` using the application database metadata provider."
  [card-or-id]
  {:lib/type     :mbql/query
   :lib/metadata (lib.metadata.jvm/application-database-metadata-provider (data/id))
   :database     (data/id)
   :stages       [{:lib/type :mbql.stage/mbql, :source-card (u/the-id card-or-id)}]})
