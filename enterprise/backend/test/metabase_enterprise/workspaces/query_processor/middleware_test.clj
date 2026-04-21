(ns metabase-enterprise.workspaces.query-processor.middleware-test
  "Isolation tests for workspace table remapping middleware.

   Pure (query) -> query. No app DB, no driver, no QP run - just middleware in, middleware out.

   Contract: the middleware does NOT rewrite the query structure. It installs overrides on the
   metadata provider attached at `[:lib/metadata]` so that downstream code (HoneySQL compilation
   via `apply-top-level-clause [:sql :source-table]`) reads the workspace schema/name when it
   resolves `:source-table <id>`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.query-processor.middleware :as ws.qp.middleware]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.test-metadata :as meta]))

(defn- query-with-remapping
  "Build an MBQL query against the test `orders` table with a cached provider (so the middleware
   can write override metadata into the cache), optionally with a remapping installed under
   `[:middleware :workspace-table-remapping :tables]`. Remapping is keyed by source table-id and
   yields the target `{:schema :name}`."
  [remappings]
  (let [mp (lib.metadata.cached-provider/cached-metadata-provider meta/metadata-provider)]
    (cond-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
      remappings (assoc-in [:middleware :workspace-table-remapping :tables] remappings))))

(deftest ^:parallel no-op-when-no-remapping-test
  (testing "query passes through unchanged when no :workspace-table-remapping is attached"
    (let [query (query-with-remapping nil)]
      (is (= query (ws.qp.middleware/apply-workspace-table-remapping query))))))

(deftest ^:parallel no-op-when-remapping-empty-test
  (testing "query passes through unchanged when remapping is attached but has no tables"
    (let [query (query-with-remapping {})]
      (is (= query (ws.qp.middleware/apply-workspace-table-remapping query))))))

(deftest ^:parallel remaps-source-table-metadata-test
  (testing "after the middleware runs, the provider returns the workspace schema/name for the remapped table id"
    (let [orders-id (meta/id :orders)
          query     (query-with-remapping
                     {orders-id {:schema "ws_bryan_apr21" :name "orders_copy"}})
          remapped  (ws.qp.middleware/apply-workspace-table-remapping query)
          mp        (:lib/metadata remapped)
          table     (lib.metadata/table mp orders-id)]
      (testing "query structure is unchanged - this is a metadata-level override, not a rewrite"
        (is (= (:stages query) (:stages remapped)))
        (is (= orders-id (get-in remapped [:stages 0 :source-table]))))
      (testing "provider now yields the workspace schema/name for this table id"
        (is (= "ws_bryan_apr21" (:schema table)))
        (is (= "orders_copy" (:name table))))
      (testing "other tables are untouched"
        (let [products (lib.metadata/table mp (meta/id :products))]
          (is (not= "ws_bryan_apr21" (:schema products))))))))
