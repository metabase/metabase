(ns metabase-enterprise.workspaces.table-remapping-test
  "Tests for the public writer API in `metabase-enterprise.workspaces.table-remapping`.
   Exercises the round-trip between `add-schema+table-mapping!`, `remap-table`,
   `remove-schema+table-mapping!`, `all-mappings-for-db`, `clear-mappings-for-db!`,
   and `record-remapping!`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.models.workspace]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver :as driver]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:workspaces} (f))))

(defn- clean-db-fixture
  "Run `f` with mappings cleared before and after so tests don't leak state."
  [db-id f]
  (ws.table-remapping/clear-mappings-for-db! db-id)
  (try (f)
       (finally (ws.table-remapping/clear-mappings-for-db! db-id))))

(defn- with-provisioned-workspace-db
  "Set the in-process workspace atom so `db-workspace-schema` returns
   `output-schema` for `db-id`, run `f`, clear the atom on the way out."
  [db-id output-schema f]
  (try
    (ws/set-instance-workspace! {:name "table-remapping-test-ws"
                                 :databases {db-id {:input_schemas []
                                                    :output_schema output-schema}}})
    (f)
    (finally
      (ws/clear-instance-workspace!))))

(deftest remap-table-returns-nil-when-no-mapping-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (is (nil? (ws.table-remapping/remap-table (mt/id) "nope_schema" "nope_table"))))))

(deftest add-then-remap-table-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (is (= ["ws_schema" "orders_copy"]
            (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))))))

(deftest all-mappings-for-db-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "PRODUCTS"] ["ws_schema" "products_copy"])
     (is (= {["PUBLIC" "ORDERS"]   ["ws_schema" "orders_copy"]
             ["PUBLIC" "PRODUCTS"] ["ws_schema" "products_copy"]}
            (ws.table-remapping/all-mappings-for-db (mt/id)))))))

(deftest remove-schema+table-mapping!-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (ws.table-remapping/remove-schema+table-mapping! (mt/id) ["PUBLIC" "ORDERS"])
     (is (nil? (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))))))

(deftest clear-mappings-for-db!-test
  (clean-db-fixture
   (mt/id)
   (fn []
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
     (ws.table-remapping/add-schema+table-mapping!
      (mt/id) ["PUBLIC" "PRODUCTS"] ["ws_schema" "products_copy"])
     (ws.table-remapping/clear-mappings-for-db! (mt/id))
     (is (= {} (ws.table-remapping/all-mappings-for-db (mt/id)))))))

(deftest add-schema+table-mapping!-is-idempotent-test
  (testing "duplicate inserts swallow the SQLSTATE 23505 unique-constraint violation"
    (clean-db-fixture
     (mt/id)
     (fn []
       (ws.table-remapping/add-schema+table-mapping!
        (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"])
       (is (nil? (ws.table-remapping/add-schema+table-mapping!
                  (mt/id) ["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"]))
           "second identical insert no-ops instead of throwing")
       (is (= {["PUBLIC" "ORDERS"] ["ws_schema" "orders_copy"]}
              (ws.table-remapping/all-mappings-for-db (mt/id)))
           "only one row persists")))))

;; ------------------------------------------------- record-remapping! -------------------------------------------------

(deftest record-remapping!-writes-app-db-test
  (testing "record-remapping! writes the app-db cache using the workspace's output schema as the to-schema"
    (clean-db-fixture
     (mt/id)
     (fn []
       (with-provisioned-workspace-db
         (mt/id) "ws_fresh"
         (fn []
           (ws.table-remapping/record-remapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")
           (is (= ["ws_fresh" "orders_copy"]
                  (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS")))))))))

(deftest record-remapping!-is-idempotent-test
  (testing "calling record-remapping! twice leaves the app-db with a single row (no duplicate-key explosion)"
    (clean-db-fixture
     (mt/id)
     (fn []
       (with-provisioned-workspace-db
         (mt/id) "ws_idem"
         (fn []
           (ws.table-remapping/record-remapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")
           (ws.table-remapping/record-remapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")
           (is (= {["PUBLIC" "ORDERS"] ["ws_idem" "orders_copy"]}
                  (ws.table-remapping/all-mappings-for-db (mt/id))))))))))

(deftest workspace-remap-schema+name-redirects-sync-fetch-test
  (testing "sync's fetch-metadata hook returns [to-schema to-table-name] when a TableRemapping exists"
    (let [db-id (mt/id)]
      (clean-db-fixture
       db-id
       (fn []
         (is (nil? (ws.table-remapping/workspace-remap-schema+name db-id "PUBLIC" "ORDERS"))
             "without a remapping, the hook returns nil so sync queries the logical table")
         (ws.table-remapping/add-schema+table-mapping! db-id ["PUBLIC" "ORDERS"] ["mb_iso_ws" "orders_copy"])
         (is (= ["mb_iso_ws" "orders_copy"]
                (ws.table-remapping/workspace-remap-schema+name db-id "PUBLIC" "ORDERS"))
             "with a remapping, the hook returns the isolated warehouse location so sync asks the driver there"))))))

(deftest table-fields-metadata-honors-workspace-remapping-test
  (testing "sync/fetch-metadata/table-fields-metadata asks the driver about the remapped warehouse table"
    (let [db-id          (mt/id)
          describe-calls (atom [])]
      (clean-db-fixture
       db-id
       (fn []
         (ws.table-remapping/add-schema+table-mapping! db-id ["PUBLIC" "ORDERS"] ["mb_iso_ws" "orders_copy"])
         (with-redefs [driver/describe-fields
                       (fn [_driver _db & {:keys [table-names schema-names]}]
                         (swap! describe-calls conj {:path         :describe-fields
                                                     :table-names  table-names
                                                     :schema-names schema-names})
                         #{})
                       driver/describe-table
                       (fn [_driver _db table]
                         (swap! describe-calls conj {:path   :describe-table
                                                     :schema (:schema table)
                                                     :name   (:name table)})
                         {:fields #{}})]
           (let [logical-table (t2/instance :model/Table
                                            {:id 999 :name "ORDERS" :schema "PUBLIC" :db_id db-id})]
             (fetch-metadata/table-fields-metadata
              (t2/select-one :model/Database :id db-id)
              logical-table))
           (is (= 1 (count @describe-calls)))
           (let [call (first @describe-calls)]
             (testing "driver is asked about the remapped (to_schema, to_table_name), not the logical source"
               (case (:path call)
                 :describe-fields
                 (do (is (= ["orders_copy"] (:table-names call)))
                     (is (= ["mb_iso_ws"]   (:schema-names call))))
                 :describe-table
                 (do (is (= "orders_copy" (:name call)))
                     (is (= "mb_iso_ws"   (:schema call))))
                 (is false (str "unexpected path " (:path call))))))))))))

(deftest record-remapping!-requires-workspaced-db-test
  (testing "throws with a clear error when db is not workspaced (db-workspace-schema returns nil)"
    ;; Defensive: ensure no provisioned WorkspaceDatabase row leaks in from another test.
    (t2/delete! :model/WorkspaceDatabase :database_id (mt/id) :status :provisioned)
    (clean-db-fixture
     (mt/id)
     (fn []
       (let [ex (try
                  (ws.table-remapping/record-remapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")
                  nil
                  (catch clojure.lang.ExceptionInfo e e))]
         (is (some? ex) "record-remapping! must throw when the db is not workspaced")
         (is (re-find #"not workspaced" (ex-message ex)))
         (is (= (mt/id) (:db-id (ex-data ex)))))
       (testing "no app-db row was written"
         (is (nil? (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))))))))

;;; --------------------------- Pre-sync ordering: to-side has no :model/Table yet -------------------------------
;;;
;;; A `TableRemapping` row can be inserted before sync has run on the workspace's destination schema, so the
;;; `(to_schema, to_table_name)` pair has no corresponding `:model/Table` row in the app DB yet. Every code path
;;; that consumes the remapping must operate on the schema/table strings alone — none should require a hydrated
;;; `:model/Table` for the to-side. These tests pin that contract so a future change that adds `:model/Table`
;;; lookup on the to-side surfaces immediately.

(deftest remap-table-works-without-to-side-model-table-test
  (testing "remap-table returns the [to-schema to-table-name] pair even when no :model/Table exists for it"
    (clean-db-fixture
     (mt/id)
     (fn []
       (let [to-schema "ws_unsynced"
             to-table  "orders_workspace_copy"]
         (testing "precondition: no :model/Table row exists for the to-side"
           (is (nil? (t2/select-one :model/Table :db_id (mt/id) :schema to-schema :name to-table))))
         (ws.table-remapping/add-schema+table-mapping! (mt/id) ["PUBLIC" "ORDERS"] [to-schema to-table])
         (is (= [to-schema to-table]
                (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))
             "remap-table operates on strings only — no :model/Table lookup on the to-side"))))))

(deftest workspace-remap-schema+name-works-without-to-side-model-table-test
  (testing "the sync hook returns [to-schema to-table-name] even when no :model/Table exists for it"
    (clean-db-fixture
     (mt/id)
     (fn []
       (let [to-schema "ws_unsynced"
             to-table  "orders_workspace_copy"]
         (is (nil? (t2/select-one :model/Table :db_id (mt/id) :schema to-schema :name to-table))
             "precondition: no :model/Table row exists for the to-side")
         (ws.table-remapping/add-schema+table-mapping! (mt/id) ["PUBLIC" "ORDERS"] [to-schema to-table])
         (is (= [to-schema to-table]
                (ws.table-remapping/workspace-remap-schema+name (mt/id) "PUBLIC" "ORDERS"))
             "sync hook returns the remap pair regardless of to-side sync state"))))))

(deftest all-mappings-for-db-works-without-to-side-model-tables-test
  (testing "all-mappings-for-db returns rows whose to-side has no :model/Table yet"
    (clean-db-fixture
     (mt/id)
     (fn []
       (ws.table-remapping/add-schema+table-mapping! (mt/id) ["PUBLIC" "ORDERS"]    ["ws_unsynced" "orders_copy"])
       (ws.table-remapping/add-schema+table-mapping! (mt/id) ["PUBLIC" "PEOPLE"]    ["ws_unsynced" "people_copy"])
       (ws.table-remapping/add-schema+table-mapping! (mt/id) ["PUBLIC" "PRODUCTS"]  ["ws_unsynced" "products_copy"])
       (let [mappings (ws.table-remapping/all-mappings-for-db (mt/id))]
         (is (= {["PUBLIC" "ORDERS"]   ["ws_unsynced" "orders_copy"]
                 ["PUBLIC" "PEOPLE"]   ["ws_unsynced" "people_copy"]
                 ["PUBLIC" "PRODUCTS"] ["ws_unsynced" "products_copy"]}
                mappings)
             "all-mappings-for-db is purely (schema, name) string-based — no :model/Table required"))))))
