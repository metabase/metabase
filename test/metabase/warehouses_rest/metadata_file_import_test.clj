(ns ^:parallel metabase.warehouses-rest.metadata-file-import-test
  "Tests for the boot-time file loader. Each test writes a temp JSON or YAML
  file, sets up matching `mt/with-temp` Database/Table/Field rows where
  needed, runs the loader, and asserts on the appdb state and any returned
  ID maps. Tests target the post-loader appdb directly — no env-var path is
  exercised here except in the few tests that explicitly bind `*env*`."
  (:require
   [cheshire.core :as json]
   [clj-yaml.core :as yaml]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.warehouses-rest.metadata-file-import :as loader]
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
                       {:databases [{:id 17 :name "happy-path-db" :engine "postgres"}]
                        :tables    [{:id 501 :db_id 17 :schema "public" :name "orders"}]
                        :fields    [{:id 9001 :table_id 501 :name "id"
                                     :base_type "type/Integer" :database_type "integer"}
                                    {:id 9002 :table_id 501 :name "address"
                                     :base_type "type/Structured" :database_type "json"}
                                    {:id 9003 :table_id 501 :name "zip" :parent_id 9002
                                     :base_type "type/Text" :database_type "text"}]})]
        (loader/import-metadata-file! meta-file nil)
        (testing "the matched Database's initial_sync_status was flipped to complete"
          (is (= "complete" (:initial_sync_status (t2/select-one :model/Database :id tgt-db)))))
        (testing "the table was inserted, attached to the target DB"
          (let [tbl (t2/select-one :model/Table :db_id tgt-db :name "orders")]
            (is (some? tbl))
            (is (= "public" (:schema tbl)))))
        (testing "the root and nested fields were inserted with correct parent linkage"
          (let [tbl-id  (:id (t2/select-one :model/Table :db_id tgt-db :name "orders"))
                root    (t2/select-one :model/Field :table_id tbl-id :name "id")
                addr    (t2/select-one :model/Field :table_id tbl-id :name "address")
                zip     (t2/select-one :model/Field :table_id tbl-id :name "zip")]
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
                       {:databases [{:id 17 :name "happy-path-yaml-db" :engine "postgres"}]
                        :tables    [{:id 501 :db_id 17 :schema "public" :name "orders"}]
                        :fields    [{:id 9001 :table_id 501 :name "id"
                                     :base_type "type/Integer" :database_type "integer"}]})]
        (loader/import-metadata-file! meta-file nil)
        (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "orders"))]
          (is (some? (t2/select-one :model/Field :table_id tbl-id :name "id"))))))))

;;; ============================== Phase-3 multi-pass ==============================

(deftest multi-pass-three-deep-nested-fields-test
  (testing "fields nested 3 levels deep — each pass resolves one more level. The walker
            visits the file once per depth and converges in N+1 passes for depth N."
    (mt/with-temp [:model/Database {tgt-db :id} {:name "deep-nest-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 17 :name "deep-nest-db" :engine "postgres"}]
                        :tables    [{:id 501 :db_id 17 :schema "public" :name "events"}]
                        ;; intentionally interleaved order — child rows appear before parents
                        :fields    [{:id 9003 :table_id 501 :name "leaf" :parent_id 9002
                                     :base_type "type/Text" :database_type "text"}
                                    {:id 9001 :table_id 501 :name "root"
                                     :base_type "type/Structured" :database_type "json"}
                                    {:id 9002 :table_id 501 :name "mid" :parent_id 9001
                                     :base_type "type/Structured" :database_type "json"}]})]
        (loader/import-metadata-file! meta-file nil)
        (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "events"))
              root   (t2/select-one :model/Field :table_id tbl-id :name "root")
              mid    (t2/select-one :model/Field :table_id tbl-id :name "mid")
              leaf   (t2/select-one :model/Field :table_id tbl-id :name "leaf")]
          (is (every? some? [root mid leaf]))
          (is (nil? (:parent_id root)))
          (is (= (:id root) (:parent_id mid)))
          (is (= (:id mid)  (:parent_id leaf))))))))

;;; ============================== Phase-3 stuck ==============================

(deftest phase-3-stuck-cycle-hard-fails-test
  (testing "two fields whose parent_ids reference each other form a cycle —
            phase 3 makes zero progress on its first pass and hard-fails with
            :kind :phase-3-stuck"
    (mt/with-temp [:model/Database {} {:name "cycle-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 17 :name "cycle-db" :engine "postgres"}]
                        :tables    [{:id 501 :db_id 17 :schema "public" :name "t"}]
                        :fields    [{:id 9001 :table_id 501 :name "a" :parent_id 9002
                                     :base_type "type/Text" :database_type "text"}
                                    {:id 9002 :table_id 501 :name "b" :parent_id 9001
                                     :base_type "type/Text" :database_type "text"}]})]
        (try
          (loader/import-metadata-file! meta-file nil)
          (is false "should have thrown")
          (catch clojure.lang.ExceptionInfo e
            (let [data (ex-data e)]
              (is (= :phase-3-stuck (:kind data)))
              (is (pos? (:unresolvable-count data)))
              (is (seq (:unresolvable-sample data))
                  "the error message includes a sample of unresolvable source ids for ops debugging"))))))))

(deftest phase-3-stuck-orphan-parent-hard-fails-test
  (testing "a field whose parent_id references an id NOT in the file (neither in target
            appdb nor in the import) — phase 3 hard-fails after the first pass"
    (mt/with-temp [:model/Database {} {:name "orphan-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 17 :name "orphan-db" :engine "postgres"}]
                        :tables    [{:id 501 :db_id 17 :schema "public" :name "t"}]
                        :fields    [{:id 9001 :table_id 501 :name "child" :parent_id 9999
                                     :base_type "type/Text" :database_type "text"}]})]
        (try
          (loader/import-metadata-file! meta-file nil)
          (is false "should have thrown")
          (catch clojure.lang.ExceptionInfo e
            (is (= :phase-3-stuck (:kind (ex-data e))))))))))

;;; ============================== No-match skipping ==============================

(deftest unmatched-source-database-skips-its-tables-and-fields-test
  (testing "if a source database in the file has no matching target Database, the loader
            logs WARN, builds no entry in db-id-map, and the dependent tables/fields are
            silently skipped (not inserted) — phase 1 is non-fatal per §10"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "matched-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 17 :name "matched-db"     :engine "postgres"}
                                    {:id 99 :name "unmatched-db-x" :engine "h2"}]
                        :tables    [{:id 501 :db_id 17 :schema "public" :name "kept"}
                                    {:id 502 :db_id 99 :schema "public" :name "skipped"}]
                        :fields    [{:id 9001 :table_id 501 :name "kept-fld"
                                     :base_type "type/Text" :database_type "text"}
                                    {:id 9002 :table_id 502 :name "skipped-fld"
                                     :base_type "type/Text" :database_type "text"}]})]
        (loader/import-metadata-file! meta-file nil)
        (let [kept-tbl    (t2/select-one :model/Table :db_id tgt-db :name "kept")
              skipped-tbl (t2/select-one :model/Table :name "skipped")]
          (is (some? kept-tbl)
              "the matched-db's table is inserted")
          (is (nil? skipped-tbl)
              "the unmatched-db's table is NOT inserted (no target db to attach it to)")
          (is (some? (t2/select-one :model/Field :table_id (:id kept-tbl) :name "kept-fld")))
          (is (nil? (t2/select-one :model/Field :name "skipped-fld"))))))))

;;; ============================== Phase 4 (fk_target_field_id) ==============================

(deftest fk-target-field-id-resolved-in-phase-4-test
  (testing "after phase 3 inserts a field referenced by another field's fk_target_field_id,
            phase 4 walks the file again and updates the referencing field's
            fk_target_field_id to the resolved target id"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "fk-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 17 :name "fk-db" :engine "postgres"}]
                        :tables    [{:id 501 :db_id 17 :schema "public" :name "users"}]
                        :fields    [{:id 9001 :table_id 501 :name "id"
                                     :base_type "type/Integer" :database_type "integer"}
                                    {:id 9002 :table_id 501 :name "user_id"
                                     :fk_target_field_id 9001
                                     :base_type "type/Integer" :database_type "integer"}]})]
        (loader/import-metadata-file! meta-file nil)
        (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "users"))
              id-fld (t2/select-one :model/Field :table_id tbl-id :name "id")
              ref    (t2/select-one :model/Field :table_id tbl-id :name "user_id")]
          (is (= (:id id-fld) (:fk_target_field_id ref))
              "the referencing field's fk_target_field_id resolves to the id field's target id"))))))

;;; ============================== Phase 5 (field values) ==============================

(deftest field-values-imported-when-fv-file-supplied-test
  (testing "passing a field-values file alongside the metadata file imports field values
            for any field whose source id resolved during phase 3"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "fv-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 17 :name "fv-db" :engine "postgres"}]
                        :tables    [{:id 501 :db_id 17 :schema "public" :name "users"}]
                        :fields    [{:id 9001 :table_id 501 :name "zip"
                                     :base_type "type/Text" :database_type "text"}]})
            fv-file (json-file
                     {:field_values [{:field_id 9001
                                      :values [["94110"] ["94111"]]
                                      :has_more_values false
                                      :human_readable_values ["Mission" "Castro"]}]})]
        (loader/import-metadata-file! meta-file fv-file)
        (let [tbl-id (:id (t2/select-one :model/Table :db_id tgt-db :name "users"))
              fld-id (:id (t2/select-one :model/Field :table_id tbl-id :name "zip"))
              fv     (t2/select-one :model/FieldValues :field_id fld-id :type :full)]
          (is (some? fv))
          (is (= [["94110"] ["94111"]] (vec (:values fv))))
          (is (= ["Mission" "Castro"] (vec (:human_readable_values fv)))))))))

;;; ============================== Idempotence ==============================

(deftest re-import-is-idempotent-test
  (testing "running the loader twice on the same file leaves the appdb in the same shape
            as after one run — no duplicate tables / fields / field-values, all matched
            on the second run"
    (mt/with-temp [:model/Database {tgt-db :id} {:name "idem-db" :engine :postgres}]
      (let [meta-file (json-file
                       {:databases [{:id 17 :name "idem-db" :engine "postgres"}]
                        :tables    [{:id 501 :db_id 17 :schema "public" :name "users"}]
                        :fields    [{:id 9001 :table_id 501 :name "id"
                                     :base_type "type/Integer" :database_type "integer"}]})
            fv-file (json-file
                     {:field_values [{:field_id 9001 :values [["a"]] :has_more_values false}]})]
        (loader/import-metadata-file! meta-file fv-file)
        (let [tables-after-1 (t2/count :model/Table :db_id tgt-db)
              fields-after-1 (count (t2/select :model/Field
                                               :table_id [:in (map :id (t2/select :model/Table :db_id tgt-db))]))
              fv-after-1     (count (t2/select :model/FieldValues
                                               :field_id [:in (map :id (t2/select :model/Field
                                                                                  :table_id [:in (map :id (t2/select :model/Table :db_id tgt-db))]))]))]
          (loader/import-metadata-file! meta-file fv-file)
          (is (= tables-after-1 (t2/count :model/Table :db_id tgt-db))
              "no duplicate tables")
          (is (= fields-after-1 (count (t2/select :model/Field
                                                  :table_id [:in (map :id (t2/select :model/Table :db_id tgt-db))])))
              "no duplicate fields")
          (is (= fv-after-1 (count (t2/select :model/FieldValues
                                              :field_id [:in (map :id (t2/select :model/Field
                                                                                 :table_id [:in (map :id (t2/select :model/Table :db_id tgt-db))]))])))
              "no duplicate field-values"))))))

;;; ============================== initialize-from-env! ==============================

(deftest initialize-from-env-no-vars-set-is-noop-test
  (testing "with neither MB_TABLE_METADATA_PATH nor MB_FIELD_VALUES_PATH set, the loader
            returns :ok without doing any work"
    (binding [loader/*env* {}]
      (is (= :ok (loader/initialize-from-env!))))))

(deftest initialize-from-env-fv-without-metadata-throws-test
  (testing "field-values-only is unsupported because the field-id map can't be derived
            without phase 3"
    (binding [loader/*env* {:mb-field-values-path "/some/path.json"}]
      (try
        (loader/initialize-from-env!)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= :missing_metadata_path (:kind (ex-data e)))))))))

(deftest initialize-from-env-missing-file-hard-fails-test
  (testing "if MB_TABLE_METADATA_PATH points at a file that doesn't exist, the loader
            hard-fails before doing any DB work"
    (binding [loader/*env* {:mb-table-metadata-path "/tmp/this-path-does-not-exist-xyz.json"}]
      (try
        (loader/initialize-from-env!)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (is (= :file_not_found (:kind (ex-data e)))))))))
