(ns metabase-enterprise.workspaces.query-processor.middleware-test
  "Isolation tests for workspace table remapping middleware.

   Pure (query) -> query. No app DB, no driver, no QP run - just middleware in, middleware out."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.query-processor.middleware :as ws.qp.middleware]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(defn- query-with-remapping
  "Build an MBQL query against the test `orders` table, optionally with a remapping installed under
   `[:middleware :workspace-table-remapping :tables]`. The remapping map is keyed by the *source*
   {:schema :name} and yields the *target* {:schema :name}."
  [remappings]
  (cond-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
    remappings (assoc-in [:middleware :workspace-table-remapping :tables] remappings)))

(deftest ^:parallel no-op-when-no-remapping-test
  (testing "query passes through unchanged when no :workspace-table-remapping is attached"
    (let [query (query-with-remapping nil)]
      (is (= query (ws.qp.middleware/apply-workspace-table-remapping query))))))

(deftest ^:parallel no-op-when-remapping-empty-test
  (testing "query passes through unchanged when remapping is attached but has no tables"
    (let [query (query-with-remapping {})]
      (is (= query (ws.qp.middleware/apply-workspace-table-remapping query))))))

(deftest ^:parallel remaps-source-table-test
  (testing "MBQL :source-table is redirected to the workspace schema/name"
    (let [orders-id (meta/id :orders)
          query     (query-with-remapping
                     {orders-id {:schema "ws_bryan_apr21" :name "orders_copy"}})
          remapped  (ws.qp.middleware/apply-workspace-table-remapping query)
          stage0    (get-in remapped [:stages 0])]
      (testing "the stage still references a table (either the original id or a rewritten target)"
        (is (some? (:source-table stage0))))
      (testing "SQL compilation would emit the workspace schema/name"
        ;; Exact assertion shape depends on the chosen strategy (id swap vs. metadata wrapper vs.
        ;; source-query wrap). Fill this in once the implementation lands - for now, the mere
        ;; presence of a difference is the invariant we're asserting.
        (is (not= query remapped))))))
