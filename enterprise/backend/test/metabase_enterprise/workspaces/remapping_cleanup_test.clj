(ns metabase-enterprise.workspaces.remapping-cleanup-test
  "Tests for [[metabase-enterprise.workspaces.remapping-cleanup]] — the iso-scoped
   `TableRemapping` deletion path invoked from `provisioning/deprovision-workspace-database!`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.remapping-cleanup :as ws.remapping-cleanup]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- clean-db-fixture!
  "Run `f` with mappings cleared before and after so tests don't leak state."
  [db-id f]
  (ws.table-remapping/clear-mappings-for-db! db-id)
  (try (f)
       (finally (ws.table-remapping/clear-mappings-for-db! db-id))))

(deftest deletes-only-iso-scoped-rows-test
  (testing "clear-mappings-for-iso! deletes only rows whose to_* match the given iso namespace"
    (clean-db-fixture!
     (mt/id)
     (fn []
       ;; Workspace A's mappings, iso = ws_a.
       (ws.table-remapping/add-mapping!
        (mt/id) {:schema "public" :table "orders"} {:schema "ws_a" :table "orders_copy"})
       (ws.table-remapping/add-mapping!
        (mt/id) {:schema "public" :table "products"} {:schema "ws_a" :table "products_copy"})
       ;; Workspace B's mapping (different canonical table, same DB, different iso).
       (ws.table-remapping/add-mapping!
        (mt/id) {:schema "public" :table "customers"} {:schema "ws_b" :table "customers_copy"})

       (is (= 3 (count (ws.table-remapping/all-mappings-for-db (mt/id))))
           "all three mappings registered")

       ;; Deprovisioning workspace A: pass a fake Database row that won't trigger the
       ;; 3-slot :db branch — Postgres-shaped, no :details :db. iso :db slot stays "".
       (let [n (ws.remapping-cleanup/clear-mappings-for-iso!
                {:engine :postgres :details {}}
                (mt/id)
                "ws_a")]
         (is (= 2 n) "two ws_a rows deleted"))

       (let [remaining (ws.table-remapping/all-mappings-for-db (mt/id))]
         (is (= 1 (count remaining)) "ws_b's row survives")
         (is (= {:db "" :schema "ws_b" :table "customers_copy"}
                (-> remaining vals first))
             "the surviving row is ws_b's"))))))

(deftest noop-when-no-rows-test
  (testing "clear-mappings-for-iso! is idempotent — returns 0 when nothing matches"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (is (= 0
              (ws.remapping-cleanup/clear-mappings-for-iso!
               {:engine :postgres :details {}}
               (mt/id)
               "never_provisioned"))
           "no rows, returns 0")
       (is (= 0
              (ws.remapping-cleanup/clear-mappings-for-iso!
               {:engine :postgres :details {}}
               (mt/id)
               ""))
           "empty output_namespace, returns 0")))))

(deftest three-slot-engine-test
  (testing "clear-mappings-for-iso! matches the iso :db slot for 3-slot engines (SQL Server)"
    (clean-db-fixture!
     (mt/id)
     (fn []
       ;; Two workspaces on the same Metabase Database, different iso :db.
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:db "AnalyticsDB" :schema "dbo" :table "orders"}
        {:db "AnalyticsDB" :schema "ws_a" :table "orders_copy"})
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:db "AnalyticsDB" :schema "dbo" :table "products"}
        {:db "AnalyticsDB" :schema "ws_b" :table "products_copy"})

       (let [n (ws.remapping-cleanup/clear-mappings-for-iso!
                {:engine :sqlserver :details {:db "AnalyticsDB"}}
                (mt/id)
                "ws_a")]
         (is (= 1 n) "only ws_a's row deleted"))

       (is (= [{:to_schema "ws_b"}]
              (->> (t2/select :model/TableRemapping :database_id (mt/id))
                   (map #(select-keys % [:to_schema]))))
           "ws_b's row survives")))))
