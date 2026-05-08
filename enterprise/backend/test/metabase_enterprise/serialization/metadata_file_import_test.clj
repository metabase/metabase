(ns metabase-enterprise.serialization.metadata-file-import-test
  "Tests for the boot-time file loader. Each test writes a temp JSON or YAML
  file, sets up matching `mt/with-temp` Database/Table/Field rows where
  needed, runs the loader, and asserts on the appdb state. Tests target the
  post-loader appdb directly — no env-var path is exercised here except in
  the few tests that explicitly bind `*env*`.

  File contents use the **portable-id wire format**: identifiers are natural
  keys, never source-instance integer ids."
  (:require
   [clj-yaml.core :as yaml]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import :as loader]
   [metabase-enterprise.serialization.metadata-file-import.processors :as processors]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ============================== Test helpers ==============================

(defn- temp-file ^File [suffix content]
  (let [f (File/createTempFile "loader-test-" suffix)]
    (.deleteOnExit f)
    (spit f content)
    f))

(defn- json-file ^File [data]
  (temp-file ".json" (json/encode data)))

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

;;; ============================== No-match skipping ==============================

(deftest unmatched-source-database-skips-its-tables-and-fields-test
  (testing "unmatched source database: WARN logged, dependent tables/fields silently skipped"
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

;;; ============================== fk-resolve ==============================

(deftest fk-target-field-id-resolved-after-import-test
  (testing "after import, a field's fk_target_field_id resolves to the referenced field's int id"
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

;;; ============================== Atomicity ==============================

(deftest atomic-import-fk-corruption-rolls-back-everything-test
  (testing "the headline atomicity guarantee: when the merge txn aborts mid-flight
            (here via a corrupt :fk_target_field_id pointing at a nonexistent target),
            NO live-data writes persist — no new tables, no new fields, no stubs,
            no sync_status flip. Either the whole import lands or none of it does."
    (mt/with-temp [:model/Database {tgt-db :id} {:name "atom-fk-db"
                                                 :engine :postgres
                                                 :initial_sync_status "incomplete"}]
      (let [tables-before (set (map :id (t2/select [:model/Table :id] :db_id tgt-db)))
            fields-before (set (map :id (t2/select :model/Field
                                                   :table_id [:in {:select [:id]
                                                                   :from [:metabase_table]
                                                                   :where [:= :db_id tgt-db]}])))
            meta-file     (json-file
                           {:databases [{:name "atom-fk-db" :engine "postgres"}]
                            :tables    [{:db_id "atom-fk-db" :schema "public" :name "orders"}]
                            :fields    [{:id ["atom-fk-db" "public" "orders" "id"]
                                         :table_id ["atom-fk-db" "public" "orders"]
                                         :name "id"
                                         :base_type "type/Integer"
                                         :database_type "integer"}
                                        ;; This field's :fk_target_field_id points at a row
                                        ;; that doesn't exist anywhere → corrupt-file signal,
                                        ;; should hard-fail :fk_target_unresolved and roll back.
                                        {:id ["atom-fk-db" "public" "orders" "uid"]
                                         :table_id ["atom-fk-db" "public" "orders"]
                                         :name "uid"
                                         :fk_target_field_id ["atom-fk-db" "public" "no-such-table" "no-such-field"]
                                         :base_type "type/Integer"
                                         :database_type "integer"}]})
            thrown        (atom nil)]
        (try
          (loader/import-metadata-file! meta-file)
          (catch clojure.lang.ExceptionInfo e
            (reset! thrown e)))
        (testing "import threw :fk_target_unresolved"
          (is (some? @thrown))
          (is (= :fk_target_unresolved (:kind (ex-data @thrown)))))
        (testing "appdb is unchanged after the rollback"
          (is (= tables-before (set (map :id (t2/select [:model/Table :id] :db_id tgt-db))))
              "no new tables in metabase_table")
          (is (= fields-before (set (map :id (t2/select :model/Field
                                                        :table_id [:in {:select [:id]
                                                                        :from [:metabase_table]
                                                                        :where [:= :db_id tgt-db]}]))))
              "no new fields in metabase_field")
          (is (= "incomplete" (:initial_sync_status (t2/select-one :model/Database :id tgt-db)))
              "initial_sync_status NOT flipped to complete"))))))

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
