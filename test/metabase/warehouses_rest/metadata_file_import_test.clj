(ns metabase.warehouses-rest.metadata-file-import-test
  "Tests for the disk-based metadata/field-values loader that mirrors the streaming NDJSON API.

  Pipeline driven by MB_TABLE_METADATA_PATH and MB_FIELD_VALUES_PATH env vars; intended for the
  Jekyll-mode workspace flow where sync is disabled and metadata is loaded from files at boot."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [metabase.warehouses-rest.metadata-file-import :as metadata-file-import]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- write-temp-json!
  "Write `content` as JSON to a temp file and return its absolute path. The file is marked
  `deleteOnExit` so the JVM cleans it up when the test process exits."
  ^String [content]
  (let [f (File/createTempFile "mb-metadata-import-" ".json")]
    (.deleteOnExit f)
    (spit f (json/encode content))
    (.getAbsolutePath f)))

(defmacro with-env
  "Rebind the loader's `*env*` with `env-map` merged over the default, so the loader reads the
  given keys as though they came from the process environment."
  [env-map & body]
  `(binding [metadata-file-import/*env* (merge @#'metadata-file-import/*env* ~env-map)]
     ~@body))

(deftest env-vars-unset-is-noop-test
  (testing "Neither env var set: loader returns :ok without touching the DB"
    (is (= :ok (metadata-file-import/initialize-from-env!)))))

(deftest disable-sync-guard-test
  (testing "MB_TABLE_METADATA_PATH set with disable-sync=false must throw"
    (mt/with-temporary-setting-values [disable-sync false]
      (let [path (write-temp-json! {:databases [] :tables [] :fields []})]
        (with-env {:mb-table-metadata-path path}
          (is (thrown-with-msg? Exception #"(?i)disable-sync"
                                (metadata-file-import/initialize-from-env!)))))))
  (testing "MB_FIELD_VALUES_PATH set with disable-sync=false must throw"
    (mt/with-temporary-setting-values [disable-sync false]
      (let [path (write-temp-json! {:field_values []})]
        (with-env {:mb-field-values-path path}
          (is (thrown-with-msg? Exception #"(?i)disable-sync"
                                (metadata-file-import/initialize-from-env!))))))))

(deftest missing-file-throws-test
  (mt/with-temporary-setting-values [disable-sync true]
    (testing "MB_TABLE_METADATA_PATH pointing at a missing file must throw"
      (with-env {:mb-table-metadata-path "/tmp/mb-metadata-import-missing-xyz-123.json"}
        (is (thrown-with-msg? Exception #"(?i)not found|does not exist"
                              (metadata-file-import/initialize-from-env!)))))
    (testing "MB_FIELD_VALUES_PATH pointing at a missing file must throw"
      (let [meta-path (write-temp-json! {:databases [] :tables [] :fields []})]
        (with-env {:mb-table-metadata-path meta-path
                   :mb-field-values-path   "/tmp/mb-field-values-import-missing-xyz-123.json"}
          (is (thrown-with-msg? Exception #"(?i)not found|does not exist"
                                (metadata-file-import/initialize-from-env!))))))))

(deftest happy-path-metadata-test
  (testing "Matching databases + inserts tables and fields with remapped ids"
    (mt/with-temporary-setting-values [disable-sync true]
      (mt/with-temp [:model/Database db-row {:name (str "SrcDB-" (random-uuid)) :engine :h2}]
        (let [src-db-id     999
              src-tbl-a-id  10
              src-tbl-b-id  11
              src-fld-id    100
              src-fld-name  101
              metadata-path (write-temp-json!
                             {:databases [{:id src-db-id :name (:name db-row) :engine "h2"}]
                              :tables    [{:id src-tbl-a-id :db_id src-db-id :name "Orders" :schema nil}
                                          {:id src-tbl-b-id :db_id src-db-id :name "Products" :schema "public"}]
                              :fields    [{:id src-fld-id :table_id src-tbl-a-id :name "id"
                                           :base_type "type/Integer" :database_type "BIGINT"}
                                          {:id src-fld-name :table_id src-tbl-a-id :name "name"
                                           :base_type "type/Text" :database_type "VARCHAR"}]})]
          (with-env {:mb-table-metadata-path metadata-path}
            (is (= :ok (metadata-file-import/initialize-from-env!))))
          (let [tbl-ids (t2/select-pks-set :model/Table :db_id (:id db-row))]
            (is (= 2 (count tbl-ids)) "two tables landed")
            (is (= 2 (t2/count :model/Field :table_id [:in tbl-ids])) "two fields landed")))))))

(deftest parent-and-fk-remap-test
  (testing "parent_id and fk_target_field_id are resolved to target ids by the finalize pass"
    (mt/with-temporary-setting-values [disable-sync true]
      (mt/with-temp [:model/Database db-row {:name (str "RemapSrc-" (random-uuid)) :engine :h2}]
        (let [src-db-id  1
              src-tbl-id 10
              metadata-path (write-temp-json!
                             {:databases [{:id src-db-id :name (:name db-row) :engine "h2"}]
                              :tables    [{:id src-tbl-id :db_id src-db-id :name "Orders" :schema nil}]
                              :fields    [{:id 100 :table_id src-tbl-id :name "id"
                                           :base_type "type/Integer" :database_type "BIGINT"}
                                          {:id 101 :table_id src-tbl-id :name "address"
                                           :base_type "type/Structured" :database_type "JSONB"}
                                          {:id 102 :table_id src-tbl-id :name "street"
                                           :parent_id 101
                                           :base_type "type/Text" :database_type "VARCHAR"}
                                          {:id 103 :table_id src-tbl-id :name "order_id"
                                           :fk_target_field_id 100
                                           :base_type "type/Integer" :database_type "BIGINT"}]})]
          (with-env {:mb-table-metadata-path metadata-path}
            (metadata-file-import/initialize-from-env!))
          (let [table-id (t2/select-one-pk :model/Table :db_id (:id db-row) :name "Orders")
                by-name  (into {} (map (juxt :name identity))
                               (t2/select :model/Field :table_id table-id))
                id-of    #(get-in by-name [% :id])]
            (is (= (id-of "address") (:parent_id (by-name "street")))
                "street.parent_id points at target id of address")
            (is (= (id-of "id") (:fk_target_field_id (by-name "order_id")))
                "order_id.fk_target_field_id points at target id of id")
            ;; :model/Field's `define-after-select` strips :is_defective_duplicate, so go raw.
            (let [raw (t2/query-one ["SELECT is_defective_duplicate FROM metabase_field WHERE id = ?"
                                     (id-of "street")])]
              (is (= false (:is_defective_duplicate raw))
                  "finalize flipped is_defective_duplicate back to false"))))))))

(deftest field-values-test
  (testing "Field values file is imported with remapped field_id"
    (mt/with-temporary-setting-values [disable-sync true]
      (mt/with-temp [:model/Database db-row {:name (str "FvSrc-" (random-uuid)) :engine :h2}]
        (let [src-db-id    1
              src-tbl-id   10
              src-fld-id   200
              metadata-path (write-temp-json!
                             {:databases [{:id src-db-id :name (:name db-row) :engine "h2"}]
                              :tables    [{:id src-tbl-id :db_id src-db-id :name "Colors" :schema nil}]
                              :fields    [{:id src-fld-id :table_id src-tbl-id :name "hue"
                                           :base_type "type/Text" :database_type "VARCHAR"}]})
              fv-path       (write-temp-json!
                             {:field_values [{:field_id        src-fld-id
                                              :values          [["red"] ["green"] ["blue"]]
                                              :has_more_values false}]})]
          (with-env {:mb-table-metadata-path metadata-path
                     :mb-field-values-path   fv-path}
            (metadata-file-import/initialize-from-env!))
          (let [table-id (t2/select-one-pk :model/Table :db_id (:id db-row) :name "Colors")
                field-id (t2/select-one-pk :model/Field :table_id table-id :name "hue")
                fv       (t2/select-one :model/FieldValues :field_id field-id :type :full)]
            (is (some? fv) "FieldValues row landed")
            (is (= [["red"] ["green"] ["blue"]] (:values fv))
                "values decoded correctly on read-back")))))))
