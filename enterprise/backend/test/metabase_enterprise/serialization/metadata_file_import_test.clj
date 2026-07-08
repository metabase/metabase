(ns metabase-enterprise.serialization.metadata-file-import-test
  "End-to-end orchestrator tests for [[metabase-enterprise.serialization.metadata-file-import/import-metadata-file!]].
  Each test writes a temp JSON file in the wire format, sets up matching
  `mt/with-temp` Database/Table/Field rows where needed, runs the loader, and
  asserts on the appdb state. See
  [[metabase-enterprise.serialization.metadata-file-import.schemas]] for the
  wire-format primer."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import :as loader]
   [metabase-enterprise.serialization.metadata-file-import.processors :as processors]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.models.table :as schema.table]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;; NOT ^:parallel — test-helpers-set-global-values! asserts non-parallel.
;; See note in concurrency_test.clj fixture — intentional opt-out from the
;; parallel-safe contract that kondo's `validate-deftest` enforces.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :once
  (fn [thunk]
    ;; Warm test-data (load + sync) before disabling auto-sync: the first load must not happen with
    ;; sync off, or with-temp defaults that resolve test-data tables (e.g. `(data/id :checkins)`) fail.
    (mt/db)
    (mt/with-temporary-setting-values [disable-auto-sync true]
      (mt/test-helpers-set-global-values!
        (thunk)))))

;;; ============================== Test helpers ==============================

(defn- temp-file ^File [suffix content]
  (let [f (File/createTempFile "loader-test-" suffix)]
    (.deleteOnExit f)
    (spit f content)
    f))

(defn- json-file ^File [data]
  (temp-file ".json" (json/encode data)))

;;; ============================== Happy paths ==============================

(deftest end-to-end-happy-path-with-json-file-test
  (testing "given a target Database that matches by (name, engine) and a metadata file
            describing one table with one root field and one nested field, the loader
            inserts the missing rows and updates initial_sync_status on the matched DB"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "happy-path-db" :engine :postgres
                                                 :initial_sync_status "incomplete"}]
      (let [meta-file (json-file
                       {:databases [{:id 7 :name "happy-path-db" :engine "postgres"}]
                        :tables    [{:id 100 :db_id 7 :schema "public" :name "orders"}]
                        :fields    [{:id 1000 :table_id 100 :name "id"
                                     :base_type "type/Integer" :database_type "integer"}
                                    {:id 1001 :table_id 100 :name "address"
                                     :base_type "type/Structured" :database_type "json"}
                                    {:id 1002 :table_id 100 :name "zip"
                                     :parent_id 1001 :nfc_path ["address"]
                                     :base_type "type/Text" :database_type "text"}]})]
        (loader/import-metadata-file! meta-file)
        (testing "the matched Database's initial_sync_status was flipped to complete"
          (is (= "complete" (:initial_sync_status (t2/select-one :model/Database :id tgt-db)))))
        (testing "the table was inserted, attached to the target DB"
          (let [tbl (t2/select-one :model/Table :db_id tgt-db :name "orders")]
            (is (some? tbl))
            (is (= "public" (:schema tbl)))))
        (testing "the root and nested fields were inserted with correct parent linkage"
          (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "orders"))
                root   (t2/select-one :model/Field :table_id tbl-id :name "id")
                addr   (t2/select-one :model/Field :table_id tbl-id :name "address")
                zip    (t2/select-one :model/Field :table_id tbl-id :name "zip")]
            (is (some? root))
            (is (some? addr))
            (is (some? zip))
            (is (nil? (:parent_id root)))
            (is (nil? (:parent_id addr)))
            (is (= (:id addr) (:parent_id zip))
                "the nested field's parent_id is the address field's target id")
            (is (= ["address"] (:nfc_path zip)))))))))

;;; ============================== No-match skipping ==============================

(deftest unmatched-source-database-skips-its-tables-and-fields-test
  (testing "a source database with no (name, engine) match in target: WARN logged,
            its tables/fields are silently dropped during merge"
    (let [meta-file (json-file
                     {:databases [{:id 7 :name "no-such-db" :engine "postgres"}]
                      :tables    [{:id 100 :db_id 7 :schema "public" :name "ghost"}]
                      :fields    [{:id 1000 :table_id 100 :name "x"
                                   :base_type "type/Integer" :database_type "int"}]})]
      (loader/import-metadata-file! meta-file)
      (is (zero? (t2/count :model/Table :name "ghost"))
          "no metabase_table row was created for the unmatched-DB's table")
      (is (zero? (t2/count :model/Field :name "x"))
          "no metabase_field row either"))))

;;; ============================== FK resolution ==============================

(deftest fk-target-field-id-resolved-after-import-test
  (testing "two tables, one with a field that has fk_target_field_id pointing at the
            other table's id field — after import, target appdb's fk_target_field_id
            points at the correctly-resolved target field id"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "fk-test-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 7 :name "fk-test-db" :engine "postgres"}]
                        :tables    [{:id 100 :db_id 7 :schema "public" :name "users"}
                                    {:id 101 :db_id 7 :schema "public" :name "orders"}]
                        :fields    [{:id 1000 :table_id 100 :name "id"
                                     :base_type "type/Integer" :database_type "integer"}
                                    {:id 1001 :table_id 101 :name "user_id"
                                     :base_type "type/Integer" :database_type "integer"
                                     :fk_target_field_id 1000}]})]
        (loader/import-metadata-file! meta-file)
        (let [users-tbl   (:id (t2/select-one :model/Table :db_id tgt-db :name "users"))
              orders-tbl  (:id (t2/select-one :model/Table :db_id tgt-db :name "orders"))
              users-id    (:id (t2/select-one :model/Field :table_id users-tbl :name "id"))
              orders-fk   (t2/select-one :model/Field :table_id orders-tbl :name "user_id")]
          (is (= users-id (:fk_target_field_id orders-fk))
              "orders.user_id's fk_target_field_id is users.id's resolved target id"))))))

;;; ============================== Per-table default permissions ==============================

(deftest newly-imported-tables-get-default-permissions-test
  (testing "Tables inserted by the importer flow through `set-new-tables-permissions!`
            in batch, mirroring what the `:after-insert` hook on `:model/Table`
            would do for single-row inserts (just in one call instead of N).
            Verified via a spy on the bulk grant function — asserting which
            rows actually land in `data_permissions` would couple the test to
            permission-graph semantics (db-level perms cover new tables ⇒ no
            table-level rows), which isn't what we're checking here."
    (mt/with-temp [:model/Database {tgt-db :id} {:name "perms-bulk-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 7 :name "perms-bulk-db" :engine "postgres"}]
                        :tables    [{:id 100 :db_id 7 :schema "public" :name "alpha"}
                                    {:id 101 :db_id 7 :schema "public" :name "beta"}]
                        :fields    [{:id 1000 :table_id 100 :name "id"
                                     :base_type "type/Integer" :database_type "integer"}
                                    {:id 1001 :table_id 101 :name "id"
                                     :base_type "type/Integer" :database_type "integer"}]})
            spy       (atom [])
            real-bulk @#'schema.table/set-new-tables-permissions!]
        (with-redefs [schema.table/set-new-tables-permissions!
                      (fn [db-id rows]
                        (swap! spy conj {:db-id db-id :rows rows})
                        (real-bulk db-id rows))]
          (loader/import-metadata-file! meta-file))
        (let [calls @spy]
          (is (= 1 (count calls)) "set-new-tables-permissions! fired exactly once (per db_id)")
          (let [{:keys [db-id rows]} (first calls)]
            (is (= tgt-db db-id) "called with the target db_id")
            (is (= 2 (count rows)) "passed both newly-inserted tables")
            (is (= #{"alpha" "beta"}
                   (set (map :name
                             (t2/select [:model/Table :name] :id [:in (map :id rows)]))))
                "rows correspond to alpha and beta")))))))

;;; ============================== Idempotence ==============================

(deftest re-import-is-idempotent-test
  (testing "running the same file twice produces the same final appdb state
            — no duplicate rows, no error"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "idem-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 7 :name "idem-db" :engine "postgres"}]
                        :tables    [{:id 100 :db_id 7 :schema "public" :name "t"}]
                        :fields    [{:id 1000 :table_id 100 :name "x"
                                     :base_type "type/Integer" :database_type "int"
                                     :description "v1"}]})]
        (loader/import-metadata-file! meta-file)
        (loader/import-metadata-file! meta-file)
        (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "t"))]
          (is (= 1 (t2/count :model/Table :db_id tgt-db :name "t")))
          (is (= 1 (t2/count :model/Field :table_id tbl-id :name "x")))
          (is (= "v1" (:description (t2/select-one :model/Field :table_id tbl-id :name "x")))))))))

(deftest re-import-reactivates-deactivated-table-test
  (testing "re-importing a table that was deactivated after the first import reactivates it in place
            rather than inserting a duplicate (which violates idx_uniq_table_db_id_schema_name). The
            field path already matches + reactivates regardless of `active`; tables must too."
    (mt/with-temp [:model/Database {tgt-db :id} {:name "reactivate-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 7 :name "reactivate-db" :engine "postgres"}]
                        :tables    [{:id 100 :db_id 7 :schema "public" :name "orders"}]
                        :fields    [{:id 1000 :table_id 100 :name "id"
                                     :base_type "type/Integer" :database_type "integer"}]})]
        (loader/import-metadata-file! meta-file)
        (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "orders"))]
          ;; simulate sync (or a prior run) deactivating the table after the first import
          (t2/update! :model/Table tbl-id {:active false})
          ;; re-import the same file: must reactivate in place, not insert a duplicate
          (loader/import-metadata-file! meta-file)
          (testing "no duplicate row was inserted (would otherwise collide on the unique index)"
            (is (= 1 (t2/count :model/Table :db_id tgt-db :schema "public" :name "orders"))))
          (testing "the existing row was reactivated in place (same id, active=true)"
            (let [tbl (t2/select-one :model/Table :db_id tgt-db :schema "public" :name "orders")]
              (is (= tbl-id (:id tbl)))
              (is (true? (:active tbl))))))))))

;;; ============================== Pre-flight orphan bail ==============================

(deftest pre-flight-orphan-bail-test
  (testing "a file whose field references a parent_id not in the same file is rejected
            with :file-incomplete; no live writes happen"
    (mt/with-temp [:model/Database {} {:name "orphan-bail-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 7 :name "orphan-bail-db" :engine "postgres"}]
                        :tables    [{:id 100 :db_id 7 :schema "public" :name "t"}]
                        :fields    [{:id 1000 :table_id 100 :name "x"
                                     :base_type "type/Integer" :database_type "int"
                                     :parent_id 9999}]})      ; bad ref — no such source_id in file
            thrown    (try (loader/import-metadata-file! meta-file) nil
                           (catch clojure.lang.ExceptionInfo e e))]
        (is (some? thrown))
        (is (= :file-incomplete (:kind (ex-data thrown))))
        (is (zero? (t2/count :model/Table :name "t"))
            "no live writes happened — pre-flight ran before any txn")))))

(deftest cycle-bail-test
  (testing "a file with a cycle in source_parent_id is rejected with
            :cycle-in-field-graph; no live writes happen"
    (mt/with-temp [:model/Database {} {:name "cycle-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 7 :name "cycle-db" :engine "postgres"}]
                        :tables    [{:id 100 :db_id 7 :schema "public" :name "t"}]
                        :fields    [{:id 1000 :table_id 100 :name "a"
                                     :base_type "type/Integer" :database_type "int"
                                     :parent_id 1001}
                                    {:id 1001 :table_id 100 :name "b"
                                     :base_type "type/Integer" :database_type "int"
                                     :parent_id 1000}]})
            thrown    (try (loader/import-metadata-file! meta-file) nil
                           (catch clojure.lang.ExceptionInfo e e))]
        (is (some? thrown))
        (is (= :cycle-in-field-graph (:kind (ex-data thrown))))
        (is (zero? (t2/count :model/Table :name "t")))))))

;;; ============================== Atomic rollback ==============================

(deftest atomic-rollback-on-mid-merge-throw-test
  (testing "if anything inside the merge transaction throws, all live writes are rolled
            back — neither tables nor fields land in the appdb"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "rollback-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 7 :name "rollback-db" :engine "postgres"}]
                        :tables    [{:id 100 :db_id 7 :schema "public" :name "t"}]
                        :fields    [{:id 1000 :table_id 100 :name "x"
                                     :base_type "type/Integer" :database_type "int"}]})]
        ;; Inject a throw into merge-fields-by-depth! — runs after merge-tables! has
        ;; written to metabase_table.
        (with-redefs [processors/merge-fields-by-depth!
                      (fn [] (throw (ex-info "boom mid-merge" {:kind ::injected})))]
          (let [thrown (try (loader/import-metadata-file! meta-file) nil
                            (catch clojure.lang.ExceptionInfo e e))]
            (is (some? thrown))
            (is (= ::injected (:kind (ex-data thrown))))))
        (is (zero? (t2/count :model/Table :db_id tgt-db :name "t"))
            "the table that merge-tables! 'inserted' was rolled back")))))

;;; ============================== field-shape coverage ==============================

(deftest unfolded-leaf-imports-correctly-test
  (testing "an unfolded leaf (nfc_path set, no parent_id) imports as a leaf field
            with nfc_path preserved and parent_id NULL"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "unfolded-leaf-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 7 :name "unfolded-leaf-db" :engine "postgres"}]
                        :tables    [{:id 100 :db_id 7 :schema "public" :name "t"}]
                        :fields    [{:id 1000 :table_id 100 :name "data.user.zip"
                                     :base_type "type/Text" :database_type "text"
                                     :nfc_path ["data" "user" "zip"]}]})]
        (loader/import-metadata-file! meta-file)
        (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "t"))
              leaf   (t2/select-one :model/Field :table_id tbl-id :name "data.user.zip")]
          (is (some? leaf))
          (is (nil? (:parent_id leaf)))
          (is (= ["data" "user" "zip"] (:nfc_path leaf))))))))
