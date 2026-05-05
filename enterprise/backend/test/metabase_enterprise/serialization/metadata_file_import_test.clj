(ns ^:parallel metabase-enterprise.serialization.metadata-file-import-test
  "Tests for the boot-time file loader. Each test writes a temp JSON or YAML
  file, sets up matching `mt/with-temp` Database/Table/Field rows where
  needed, runs the loader, and asserts on the appdb state. Tests target the
  post-loader appdb directly — no env-var path is exercised here except in
  the few tests that explicitly bind `*env*`.

  File contents use the **portable-id wire format** (post-2026-04-29 pivot):
  identifiers are natural keys, never source-instance integer ids."
  (:require
   [cheshire.core :as cheshire]
   [clj-yaml.core :as yaml]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import :as loader]
   [metabase-enterprise.serialization.metadata-file-import.processors :as processors]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

;;; ============================== Test helpers ==============================

(defn- temp-file ^File [suffix content]
  (let [f (File/createTempFile "loader-test-" suffix)]
    (.deleteOnExit f)
    (spit f content)
    f))

(defn- json-file ^File [data]
  (temp-file ".json" (cheshire/encode data)))

(defn- yaml-file ^File [data]
  (temp-file ".yaml" (yaml/generate-string data)))

;;; ============================== Happy paths ==============================

(deftest end-to-end-happy-path-with-json-file-test
  (testing "given a target Database that matches by (name, engine) and a metadata file
            describing one table with one root field and one nested field, the loader
            inserts the missing rows and updates initial_sync_status on the matched DB"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "happy-path-db" :engine :postgres
                                                 :initial_sync_status "incomplete"}]
      (let [meta-file (json-file
                       {:databases [{:name "happy-path-db" :engine "postgres"}]
                        :tables    [{:db_id "happy-path-db" :schema "public" :name "orders"}]
                        :fields    [{:id ["happy-path-db" "public" "orders" "id"]
                                     :table_id ["happy-path-db" "public" "orders"] :name "id"
                                     :base_type "type/Integer" :database_type "integer"}
                                    {:id ["happy-path-db" "public" "orders" "address"]
                                     :table_id ["happy-path-db" "public" "orders"] :name "address"
                                     :base_type "type/Structured" :database_type "json"}
                                    {:id ["happy-path-db" "public" "orders" "address" "zip"]
                                     :table_id ["happy-path-db" "public" "orders"]
                                     :parent_id ["happy-path-db" "public" "orders" "address"]
                                     :nfc_path ["address"]
                                     :name "zip"
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
                "the nested field's parent_id is the address field's target id")))))))

(deftest end-to-end-happy-path-with-yaml-file-test
  (testing "the same flow works for YAML files via the format dispatcher"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "happy-path-yaml-db" :engine :postgres}]
      (let [meta-file (yaml-file
                       {:databases [{:name "happy-path-yaml-db" :engine "postgres"}]
                        :tables    [{:db_id "happy-path-yaml-db" :schema "public" :name "orders"}]
                        :fields    [{:id ["happy-path-yaml-db" "public" "orders" "id"]
                                     :table_id ["happy-path-yaml-db" "public" "orders"]
                                     :name "id"
                                     :base_type "type/Integer" :database_type "integer"}]})]
        (loader/import-metadata-file! meta-file)
        (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "orders"))]
          (is (some? (t2/select-one :model/Field :table_id tbl-id :name "id"))))))))

;;; ============================== Single-pass stubs ==============================

(deftest single-pass-stubs-three-deep-nested-fields-test
  (testing "fields nested 3 levels deep, interleaved (children before parents) — a
            single pass with on-the-fly stubbing handles all of them. Stubs created
            during phase 3 get clobbered by their real-row arrival in the same pass."
    (mt/with-temp [:model/Database {tgt-db :id} {:name "deep-nest-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:name "deep-nest-db" :engine "postgres"}]
                        :tables    [{:db_id "deep-nest-db" :schema "public" :name "events"}]
                        ;; intentionally interleaved order — child rows appear before parents
                        :fields    [{:id ["deep-nest-db" "public" "events" "root" "mid" "leaf"]
                                     :table_id ["deep-nest-db" "public" "events"]
                                     :parent_id ["deep-nest-db" "public" "events" "root" "mid"]
                                     :nfc_path ["root" "mid"]
                                     :name "leaf"
                                     :base_type "type/Text" :database_type "text"}
                                    {:id ["deep-nest-db" "public" "events" "root"]
                                     :table_id ["deep-nest-db" "public" "events"]
                                     :name "root"
                                     :base_type "type/Structured" :database_type "json"}
                                    {:id ["deep-nest-db" "public" "events" "root" "mid"]
                                     :table_id ["deep-nest-db" "public" "events"]
                                     :parent_id ["deep-nest-db" "public" "events" "root"]
                                     :nfc_path ["root"]
                                     :name "mid"
                                     :base_type "type/Structured" :database_type "json"}]})]
        (loader/import-metadata-file! meta-file)
        (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "events"))
              root   (t2/select-one :model/Field :table_id tbl-id :name "root")
              mid    (t2/select-one :model/Field :table_id tbl-id :name "mid")
              leaf   (t2/select-one :model/Field :table_id tbl-id :name "leaf")]
          (is (every? some? [root mid leaf]))
          (is (nil? (:parent_id root)))
          (is (= (:id root) (:parent_id mid)))
          (is (= (:id mid)  (:parent_id leaf)))
          (is (every? #(false? (processors/stub-row? %)) [root mid leaf])
              "all three fields ended up as real rows (their real arrivals clobbered any stubs)"))))))

;;; ============================== Unfilled stubs (orphan parent) ==============================

(deftest unfilled-stubs-warns-test
  (testing "a field whose :parent_id references a portable id NOT present in the file
            (orphan parent) creates a stub for the missing parent. The stub remains
            after the import — `warn-on-unfilled-stubs!` logs a structured WARN line
            but does NOT throw (per the 2026-04-29 stubs-policy decision)."
    (mt/with-temp [:model/Database {tgt-db :id} {:name "orphan-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:name "orphan-db" :engine "postgres"}]
                        :tables    [{:db_id "orphan-db" :schema "public" :name "t"}]
                        :fields    [{:id ["orphan-db" "public" "t" "missing-parent" "child"]
                                     :table_id ["orphan-db" "public" "t"]
                                     :parent_id ["orphan-db" "public" "t" "missing-parent"]
                                     :nfc_path ["missing-parent"]
                                     :name "child"
                                     :base_type "type/Text" :database_type "text"}]})]
        ;; Should NOT throw — unfilled stubs are warned, not failed
        (is (= :ok (loader/import-metadata-file! meta-file)))
        (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "t"))
              stub   (t2/select-one :model/Field :table_id tbl-id :name "missing-parent")
              child  (t2/select-one :model/Field :table_id tbl-id :name "child")]
          (is (some? stub) "the orphan parent was inserted as a stub")
          (is (processors/stub-row? stub) "the orphan parent is identified as a stub")
          (is (= false (:active stub)))
          (is (= (:id stub) (:parent_id child))
              "child's parent_id points at the stub"))))))

;;; ============================== No-match skipping ==============================

(deftest unmatched-source-database-skips-its-tables-and-fields-test
  (testing "if a source database in the file has no matching target Database, the loader
            logs WARN, and the dependent tables/fields are silently skipped (their db_id
            doesn't resolve to any target). Phase 1 is non-fatal per §10."
    (mt/with-temp [:model/Database {tgt-db :id} {:name "matched-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:name "matched-db"     :engine "postgres"}
                                    {:name "unmatched-db-x" :engine "h2"}]
                        :tables    [{:db_id "matched-db"     :schema "public" :name "kept"}
                                    {:db_id "unmatched-db-x" :schema "public" :name "skipped"}]
                        :fields    [{:id ["matched-db" "public" "kept" "kept-fld"]
                                     :table_id ["matched-db" "public" "kept"]
                                     :name "kept-fld"
                                     :base_type "type/Text" :database_type "text"}
                                    {:id ["unmatched-db-x" "public" "skipped" "skipped-fld"]
                                     :table_id ["unmatched-db-x" "public" "skipped"]
                                     :name "skipped-fld"
                                     :base_type "type/Text" :database_type "text"}]})]
        (loader/import-metadata-file! meta-file)
        (let [kept-tbl    (t2/select-one :model/Table :db_id tgt-db :name "kept")
              skipped-tbl (t2/select-one :model/Table :name "skipped")]
          (is (some? kept-tbl) "the matched-db's table is inserted")
          (is (nil? skipped-tbl)
              "the unmatched-db's table is NOT inserted (no target db to attach it to)")
          (is (some? (t2/select-one :model/Field :table_id (:id kept-tbl) :name "kept-fld")))
          (is (nil? (t2/select-one :model/Field :name "skipped-fld"))))))))

;;; ============================== Phase 4 (fk_target_field_id) ==============================

(deftest fk-target-field-id-resolved-in-phase-4-test
  (testing "after phase 3 inserts a field referenced by another field's
            fk_target_field_id, phase 4 walks the file again and updates the
            referencing field's fk_target_field_id to the resolved target id"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "fk-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:name "fk-db" :engine "postgres"}]
                        :tables    [{:db_id "fk-db" :schema "public" :name "users"}]
                        :fields    [{:id ["fk-db" "public" "users" "id"]
                                     :table_id ["fk-db" "public" "users"] :name "id"
                                     :base_type "type/Integer" :database_type "integer"}
                                    {:id ["fk-db" "public" "users" "user_id"]
                                     :table_id ["fk-db" "public" "users"] :name "user_id"
                                     :fk_target_field_id ["fk-db" "public" "users" "id"]
                                     :base_type "type/Integer" :database_type "integer"}]})]
        (loader/import-metadata-file! meta-file)
        (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "users"))
              id-fld (t2/select-one :model/Field :table_id tbl-id :name "id")
              ref    (t2/select-one :model/Field :table_id tbl-id :name "user_id")]
          (is (= (:id id-fld) (:fk_target_field_id ref))
              "the referencing field's fk_target_field_id resolves to the id field's target id"))))))

;;; ============================== Idempotence ==============================

(deftest re-import-is-idempotent-test
  (testing "running the loader twice on the same file leaves the appdb in the same shape
            as after one run — no duplicate tables / fields, all matched on the second run"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "idem-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:name "idem-db" :engine "postgres"}]
                        :tables    [{:db_id "idem-db" :schema "public" :name "users"}]
                        :fields    [{:id ["idem-db" "public" "users" "id"]
                                     :table_id ["idem-db" "public" "users"] :name "id"
                                     :base_type "type/Integer" :database_type "integer"}]})]
        (loader/import-metadata-file! meta-file)
        (let [tables-after-1 (t2/count :model/Table :db_id tgt-db)
              fields-after-1 (count (t2/select :model/Field
                                               :table_id [:in (map :id (t2/select :model/Table
                                                                                  :db_id tgt-db))]))]
          (loader/import-metadata-file! meta-file)
          (is (= tables-after-1 (t2/count :model/Table :db_id tgt-db))
              "no duplicate tables")
          (is (= fields-after-1
                 (count (t2/select :model/Field
                                   :table_id [:in (map :id (t2/select :model/Table
                                                                      :db_id tgt-db))])))
              "no duplicate fields"))))))

;;; ============================== initialize-from-env! ==============================

(deftest initialize-from-env-no-vars-set-is-noop-test
  (testing "with MB_TABLE_METADATA_PATH not set, the loader
            returns :ok without doing any work"
    (binding [loader/*env* {}]
      (is (= :ok (loader/initialize-from-env!))))))

(deftest initialize-from-env-missing-file-hard-fails-test
  (testing "if MB_TABLE_METADATA_PATH points at a file that doesn't exist, the loader
            hard-fails before doing any DB work"
    (binding [loader/*env* {:mb-table-metadata-path "/tmp/this-path-does-not-exist-xyz.json"}]
      (try
        (loader/initialize-from-env!)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= :file_not_found (:kind (ex-data e)))))))))
