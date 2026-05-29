(ns ^:synchronous metabase-enterprise.serialization.metadata-file-import.wire-format-test
  "Contract test between the metadata export and import sides. The importer's
  Malli schemas describe what the importer expects on the wire; this test
  exercises the export pipeline against a small hand-built fixture and
  validates every emitted row against the corresponding import schema. If the
  export starts emitting a column the import schema doesn't know about — or
  stops emitting a required one — the test fails.

  NOT `^:parallel`: each test does an `mt/with-temp [:model/Database :model/Table
  :model/Field …]` whose `:after-insert` chain hits `metabase_data_permissions`
  + the cluster lock. Concurrent tests in this ns reliably deadlock on MariaDB."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.export :as export]
   [metabase-enterprise.serialization.metadata-file-import.schemas :as schemas]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.io ByteArrayOutputStream)))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fn [thunk]
    ;; Warm test-data (load + sync) before disabling auto-sync: the first load must not happen with
    ;; sync off, or with-temp defaults that resolve test-data tables (e.g. `(data/id :checkins)`) fail.
    (mt/db)
    (mt/with-temporary-setting-values [disable-auto-sync true]
      (thunk))))

(defn- export-as-json!
  "Run the export against `opts`, decode JSON to keyword-keyed maps."
  [opts]
  (let [bos (ByteArrayOutputStream.)]
    (export/export-metadata! bos opts)
    (json/decode+kw (.toString bos "UTF-8"))))

(defmacro ^:private with-tiny-fixture!
  "Bind a hand-built fixture covering each wire-format field shape:
    - flat root field (no parent, no nfc_path, no FK)
    - Dictionary parent (has children pointing at it)
    - nested leaf (parent_id + nfc_path)
    - unfolded leaf (nfc_path only, no parent_id)
    - FK source (fk_target_field_id pointing at another table's field)
    - FK target (referenced from another field via fk_target_field_id)

  Yields `[db-id table-1-id table-2-id]` in scope of `body`."
  [bindings & body]
  (let [[db table1 table2] bindings]
    `(mt/with-temp
       [:model/Database {~db :id}             {:engine :h2}
        :model/Table    {~table1 :id}         {:db_id ~db :schema "PUBLIC" :name "users"}
        :model/Table    {~table2 :id}         {:db_id ~db :schema "PUBLIC" :name "accounts"}
        :model/Field    _flat#                {:table_id ~table1 :name "user_id" :base_type :type/Integer}
        :model/Field    {parent-id# :id}      {:table_id ~table1 :name "data" :base_type :type/Dictionary}
        :model/Field    _nested-leaf#         {:table_id  ~table1 :name "value"
                                               :base_type :type/Text
                                               :parent_id parent-id#
                                               :nfc_path  ["data" "value"]}
        :model/Field    _unfolded-leaf#       {:table_id  ~table1 :name "embedded → leaf"
                                               :base_type :type/Text
                                               :nfc_path  ["embedded" "leaf"]}
        :model/Field    {target-id# :id}      {:table_id ~table2 :name "id" :base_type :type/Integer}
        :model/Field    _fk-source#           {:table_id           ~table1
                                               :name               "account_fk"
                                               :base_type          :type/Integer
                                               :fk_target_field_id target-id#}]
       ~@body)))

(defn- export-fixture!
  "Run the export scoped to the fixture's database id."
  [db-id]
  (export-as-json! {:user-info      {:user-id (mt/user->id :crowberto) :is-superuser? true}
                    :with-databases true
                    :with-tables    true
                    :with-fields    true
                    :database-ids   [db-id]}))

;;; ============================== Per-section tests ==============================

(deftest database-rows-validate-against-import-schema-test
  (mt/with-premium-features #{:serialization}
    (with-tiny-fixture! [db-id _t1 _t2]
      (let [{:keys [databases]} (export-fixture! db-id)]
        (testing "fixture surfaces at least one database row"
          (is (= 1 (count databases))))
        (doseq [row databases]
          (testing (str "row validates against ::schemas/database-info — " (pr-str row))
            (is (mr/validate ::schemas/database-info row))))))))

(deftest table-rows-validate-against-import-schema-test
  (mt/with-premium-features #{:serialization}
    (with-tiny-fixture! [db-id _t1 _t2]
      (let [{:keys [tables]} (export-fixture! db-id)]
        (testing "fixture surfaces both tables"
          (is (= 2 (count tables))))
        (doseq [row tables]
          (testing (str "row validates against ::schemas/table-info — " (pr-str row))
            (is (mr/validate ::schemas/table-info row))))))))

(deftest field-rows-validate-against-import-schema-test
  (mt/with-premium-features #{:serialization}
    (with-tiny-fixture! [db-id _t1 _t2]
      (let [{:keys [fields]} (export-fixture! db-id)]
        (testing "fixture surfaces all six field shapes"
          (is (= 6 (count fields))))
        (doseq [row fields]
          (testing (str "row validates against ::schemas/field-info — " (pr-str row))
            (is (mr/validate ::schemas/field-info row))))))))

;;; ============================== Per-shape coverage assertions ==============================
;;; Belt-and-suspenders: assert the fixture actually exercised each variant.
;;; If the fixture stops producing a particular shape (e.g., a refactor of
;;; mt/with-temp's defaults), the per-section tests still pass, but these
;;; coverage tests catch the gap.

(deftest field-shape-coverage-test
  (mt/with-premium-features #{:serialization}
    (with-tiny-fixture! [db-id _t1 _t2]
      (let [{:keys [fields]} (export-fixture! db-id)]
        (testing "exactly one nested leaf (parent_id + nfc_path)"
          (is (= 1 (count (filter #(and (:parent_id %) (:nfc_path %)) fields)))))
        (testing "exactly one unfolded leaf (nfc_path without parent_id)"
          (is (= 1 (count (filter #(and (:nfc_path %) (not (:parent_id %))) fields)))))
        (testing "exactly one FK source (fk_target_field_id present)"
          (is (= 1 (count (filter :fk_target_field_id fields)))))
        (testing "at least one flat field (no parent_id, no nfc_path, no FK)"
          (is (pos? (count (filter #(and (not (:parent_id %))
                                         (not (:nfc_path %))
                                         (not (:fk_target_field_id %)))
                                   fields)))))))))
