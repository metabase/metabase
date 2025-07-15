(ns metabase-enterprise.semantic-search.core
  "Enterprise implementations of semantic search core functions using defenterprise."
  (:require
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase.premium-features.core :refer [defenterprise]]))

;; TODO: Update :feature from :none to the appropriate token feature once semantic search feature is added

(defenterprise maybe-init-db!
  "Enterprise implementation of semantic database initialization."
  :feature :none
  []
  (semantic.db/maybe-init-db!))

(defenterprise test-connection!
  "Enterprise implementation of semantic database connection testing."
  :feature :none
  []
  (semantic.db/test-connection!))

(defenterprise init-db!
  "Enterprise implementation of semantic database initialization."
  :feature :none
  []
  (semantic.db/init-db!))

(defenterprise query-index
  "Enterprise implementation of semantic index querying."
  :feature :none
  [search-string]
  (semantic.index/query-index search-string))

(defenterprise upsert-index!
  "Enterprise implementation of semantic index upserting."
  :feature :none
  [documents]
  (semantic.index/upsert-index! documents))

(defenterprise delete-from-index!
  "Enterprise implementation of semantic index deletion."
  :feature :none
  [model ids]
  (semantic.index/delete-from-index! model ids))

(defenterprise create-index-table!
  "Enterprise implementation of semantic index table creation."
  :feature :none
  [opts]
  (semantic.index/create-index-table! opts))