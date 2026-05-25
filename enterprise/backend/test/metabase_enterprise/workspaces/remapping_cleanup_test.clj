(ns metabase-enterprise.workspaces.remapping-cleanup-test
  "Tests for [[metabase-enterprise.workspaces.remapping-cleanup]] — the iso-scoped
   `TableRemapping` deletion path invoked from `provisioning/deprovision-workspace-database!`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase-enterprise.workspaces.remapping-cleanup :as ws.remapping-cleanup]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.test :as mt]
   [metabase.test.util.thread-local :as tu.thread-local]
   [toucan2.core :as t2]))

;;; Register a fake `db-schema-table`-shape engine so this test can exercise the
;;; 3-slot iso-db-slot path without depending on the sqlserver driver module
;;; being on the test classpath.
(driver/register! ::fake-3-slot, :abstract? true)

(defmethod driver.sql/table-qualification-style ::fake-3-slot [_]
  :table-qualification-style/db-schema-table)

(defmethod driver.sql/db-slot-value ::fake-3-slot [_ database]
  (:db (:details database)))

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
                {:engine ::fake-3-slot :details {:db "AnalyticsDB"}}
                (mt/id)
                "ws_a")]
         (is (= 1 n) "only ws_a's row deleted"))

       (is (= [{:to_schema "ws_b"}]
              (->> (t2/select :model/TableRemapping :database_id (mt/id))
                   (map #(select-keys % [:to_schema]))))
           "ws_b's row survives")))))

(deftest deprovision-clears-rows-even-when-destroy-throws-test
  (testing "When the driver's `destroy!` step throws (e.g. BQ dataset gone but SA delete fails),
            `deprovision-workspace-database!` must still clear the workspace's `TableRemapping`
            rows. Without that, future queries against canonical tables on this DB rewrite to
            an iso namespace that no longer exists on the warehouse and 500 in the QP. The
            warehouse-side leak (orphan SA / dataset) is acceptable -- app-DB state must match
            the deprovision intent so the workspace stops routing queries."
    ;; Disable the rollback-only tx wrap that `metabase.test.redefs` adds around `with-temp`.
    ;; `deprovision-workspace-database!` rebinds `*current-connectable*` to nil for the
    ;; `TableRemapping` cleanup so the DELETE survives a `with-cluster-lock` rollback when
    ;; `destroy!` throws. Under the rollback-only wrap, that fresh connection can't see
    ;; the fixture rows -- they live only inside the wrap's open transaction. Real
    ;; production callers persist `TableRemapping` rows before deprovision runs.
    (binding [tu.thread-local/*thread-local* false]
      (mt/with-temp [:model/Database {db-id :id} {:engine :postgres :details {}}
                     :model/Workspace {ws-id :id} {:name       "tear-down"
                                                   :creator_id (mt/user->id :crowberto)}
                     :model/WorkspaceDatabase {wsd-id :id} {:workspace_id     ws-id
                                                            :database_id      db-id
                                                            :input_schemas    ["public"]
                                                            :database_details {}
                                                            :output_namespace "ws_alice"
                                                            :status           :deprovisioning}]
        (ws.table-remapping/add-mapping!
         db-id {:schema "public" :table "orders"} {:schema "ws_alice" :table "orders_copy"})
        (ws.table-remapping/add-mapping!
         db-id {:schema "public" :table "products"} {:schema "ws_alice" :table "products_copy"})
        (is (= 2 (count (ws.table-remapping/all-mappings-for-db db-id)))
            "fixture: two remap rows registered before deprovision")
        ;; Provisioner that fails on destroy! to simulate partial warehouse teardown
        ;; (e.g. BQ dataset deleted, SA delete throws).
        (let [failing-provisioner (reify provisioning/Provisioner
                                    (init!    [_ _ _ _]     (throw (ex-info "not used" {})))
                                    (grant!   [_ _ _ _ _]   (throw (ex-info "not used" {})))
                                    (destroy! [_ _ _ _]     (throw (ex-info "warehouse teardown blew up" {}))))]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"warehouse teardown blew up"
               (provisioning/deprovision-workspace-database! wsd-id failing-provisioner))
              "deprovision rethrows the destroy failure so the caller knows"))
        (is (zero? (count (ws.table-remapping/all-mappings-for-db db-id)))
            "remap rows must be cleared even when destroy! threw -- otherwise canonical-table queries 500")
        (is (= :provisioned (:status (t2/select-one :model/WorkspaceDatabase :id wsd-id)))
            "current rollback semantic: failed deprovision flips status back to :provisioned")))))
