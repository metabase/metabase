(ns metabase-enterprise.serialization.metadata-file-import.tables-test
  "Tests for `resolve-target-table-ids-in-staging!` and `merge-tables!` —
  the table-merge half of the pipeline. These functions key on the
  natural-key tuple (db_name, schema, name) against `metabase_table`,
  filtered to active non-defective rows."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.processors :as p]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- staging-row [source-id db-name name & {:as overrides}]
  (merge {:source_id    source-id
          :source_db_id 1
          :db_name      db-name
          :schema       "PUBLIC"
          :name         name
          :display_name (clojure.string/capitalize name)}
         overrides))

(defn- staging-rows-by-source-id []
  (into {} (map (juxt :source_id identity))
        (t2/query "SELECT source_id, db_name, schema, name, description, target_id
                   FROM metabase_table_import")))

;;; ============================== resolve-target-table-ids ==============================

(deftest resolve-populates-target-id-when-match-exists-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}
                 :model/Table {target-id :id} {:db_id db-id :schema "PUBLIC" :name "users"}]
    (try
      (p/clear-staging-tables!)
      (t2/insert! :metabase_table_import [(staging-row 100 db-name "users")])
      (p/resolve-target-table-ids-in-staging!)
      (let [row (get (staging-rows-by-source-id) 100)]
        (is (= target-id (:target_id row))))
      (finally (p/clear-staging-tables!)))))

(deftest resolve-leaves-target-id-null-when-no-match-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}
                 :model/Table {} {:db_id db-id :schema "PUBLIC" :name "users"}]
    (try
      (p/clear-staging-tables!)
      (t2/insert! :metabase_table_import [(staging-row 100 db-name "no_such_table")])
      (p/resolve-target-table-ids-in-staging!)
      (let [row (get (staging-rows-by-source-id) 100)]
        (is (nil? (:target_id row))))
      (finally (p/clear-staging-tables!)))))

(deftest resolve-handles-nil-schema-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}
                 :model/Table {target-id :id} {:db_id db-id :schema nil :name "raw_table"}]
    (try
      (p/clear-staging-tables!)
      (t2/insert! :metabase_table_import [(staging-row 100 db-name "raw_table" :schema nil)])
      (p/resolve-target-table-ids-in-staging!)
      (let [row (get (staging-rows-by-source-id) 100)]
        (is (= target-id (:target_id row))
            "NULL-safe match: staging schema=NULL ⇔ target schema=NULL"))
      (finally (p/clear-staging-tables!)))))

(deftest resolve-skips-inactive-target-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}
                 :model/Table {} {:db_id db-id :schema "PUBLIC" :name "users" :active false}]
    (try
      (p/clear-staging-tables!)
      (t2/insert! :metabase_table_import [(staging-row 100 db-name "users")])
      (p/resolve-target-table-ids-in-staging!)
      (let [row (get (staging-rows-by-source-id) 100)]
        (is (nil? (:target_id row))
            "inactive target rows are intentionally not resolved — re-import creates a fresh active row"))
      (finally (p/clear-staging-tables!)))))

(deftest resolve-skips-defective-duplicate-target-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}
                 :model/Table {} {:db_id db-id :schema "PUBLIC" :name "users" :is_defective_duplicate true}]
    (try
      (p/clear-staging-tables!)
      (t2/insert! :metabase_table_import [(staging-row 100 db-name "users")])
      (p/resolve-target-table-ids-in-staging!)
      (let [row (get (staging-rows-by-source-id) 100)]
        (is (nil? (:target_id row))))
      (finally (p/clear-staging-tables!)))))

(deftest resolve-is-idempotent-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}
                 :model/Table {target-id :id} {:db_id db-id :schema "PUBLIC" :name "users"}]
    (try
      (p/clear-staging-tables!)
      (t2/insert! :metabase_table_import [(staging-row 100 db-name "users")])
      (p/resolve-target-table-ids-in-staging!)
      (p/resolve-target-table-ids-in-staging!)
      (let [row (get (staging-rows-by-source-id) 100)]
        (is (= target-id (:target_id row))))
      (finally (p/clear-staging-tables!)))))

;;; ============================== merge-tables ==============================

(deftest merge-empty-staging-is-noop-test
  (try
    (p/clear-staging-tables!)
    (let [before (t2/count :metabase_table)]
      (p/merge-tables!)
      (is (= before (t2/count :metabase_table))))
    (finally (p/clear-staging-tables!))))

(deftest merge-inserts-unmatched-table-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}]
    (try
      (p/clear-staging-tables!)
      (t2/insert! :metabase_table_import [(staging-row 100 db-name "new_table"
                                                       :description "first import")])
      (p/resolve-target-table-ids-in-staging!)
      (p/merge-tables!)
      (let [inserted (t2/select-one :model/Table :db_id db-id :name "new_table")]
        (is (some? inserted))
        (is (= "PUBLIC" (:schema inserted)))
        (is (= "first import" (:description inserted)))
        (is (= true (:active inserted)))
        (is (= "internal" (name (:data_layer inserted)))))
      (finally
        (t2/delete! :model/Table :db_id db-id)
        (p/clear-staging-tables!)))))

(deftest merge-updates-description-on-match-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}
                 :model/Table {target-id :id} {:db_id    db-id :schema "PUBLIC" :name "users"
                                               :description "old description"}]
    (try
      (p/clear-staging-tables!)
      (t2/insert! :metabase_table_import [(staging-row 100 db-name "users"
                                                       :description "new description")])
      (p/resolve-target-table-ids-in-staging!)
      (p/merge-tables!)
      (is (= "new description" (:description (t2/select-one :model/Table :id target-id))))
      (finally (p/clear-staging-tables!)))))

(deftest merge-skips-row-whose-db-has-no-target-test
  (try
    (p/clear-staging-tables!)
    (t2/insert! :metabase_table_import [(staging-row 100 "nonexistent_db" "ghost_table")])
    (p/resolve-target-table-ids-in-staging!)
    (let [before (t2/count :model/Table :name "ghost_table")]
      (p/merge-tables!)
      (is (= before (t2/count :model/Table :name "ghost_table"))
          "INSERT JOINs metabase_database on db_name; no match → row silently skipped"))
    (finally (p/clear-staging-tables!))))

(deftest merge-handles-nil-schema-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}]
    (try
      (p/clear-staging-tables!)
      (t2/insert! :metabase_table_import [(staging-row 100 db-name "raw_table" :schema nil)])
      (p/resolve-target-table-ids-in-staging!)
      (p/merge-tables!)
      (let [inserted (t2/select-one :model/Table :db_id db-id :name "raw_table")]
        (is (some? inserted))
        (is (nil? (:schema inserted))))
      (finally
        (t2/delete! :model/Table :db_id db-id)
        (p/clear-staging-tables!)))))

(deftest merge-is-idempotent-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}]
    (try
      (p/clear-staging-tables!)
      (t2/insert! :metabase_table_import [(staging-row 100 db-name "users" :description "v1")])
      (p/resolve-target-table-ids-in-staging!)
      (p/merge-tables!)
      (let [first-id (:id (t2/select-one :model/Table :db_id db-id :name "users"))]
        ;; second pass — re-resolve and re-merge against the same staging contents
        (p/resolve-target-table-ids-in-staging!)
        (p/merge-tables!)
        (let [second-id (:id (t2/select-one :model/Table :db_id db-id :name "users"))]
          (is (= first-id second-id) "re-import doesn't insert a duplicate")
          (is (= 1 (t2/count :model/Table :db_id db-id :name "users")))))
      (finally
        (t2/delete! :model/Table :db_id db-id)
        (p/clear-staging-tables!)))))

(deftest merge-skip-if-unchanged-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}
                 :model/Table {target-id :id} {:db_id    db-id :schema "PUBLIC" :name "users"
                                               :description "same"}]
    (try
      ;; Stamp updated_at to a known-old value so we can detect if the UPDATE fires.
      (t2/query {:update :metabase_table
                 :set    {:updated_at #t "2020-01-01T00:00:00Z"}
                 :where  [:= :id target-id]})
      (let [original-updated-at (:updated_at (t2/select-one :model/Table :id target-id))]
        (p/clear-staging-tables!)
        (t2/insert! :metabase_table_import [(staging-row 100 db-name "users" :description "same")])
        (p/resolve-target-table-ids-in-staging!)
        (p/merge-tables!)
        (let [after-updated-at (:updated_at (t2/select-one :model/Table :id target-id))]
          (is (= original-updated-at after-updated-at)
              "skip-if-unchanged: identical description means no UPDATE fires, updated_at unchanged")))
      (finally (p/clear-staging-tables!)))))

(deftest merge-fires-when-description-differs-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}
                 :model/Table {target-id :id} {:db_id db-id :schema "PUBLIC" :name "users"
                                               :description "v1"}]
    (try
      (t2/query {:update :metabase_table
                 :set    {:updated_at #t "2020-01-01T00:00:00Z"}
                 :where  [:= :id target-id]})
      (let [original-updated-at (:updated_at (t2/select-one :model/Table :id target-id))]
        (p/clear-staging-tables!)
        (t2/insert! :metabase_table_import [(staging-row 100 db-name "users" :description "v2")])
        (p/resolve-target-table-ids-in-staging!)
        (p/merge-tables!)
        (let [after (t2/select-one :model/Table :id target-id)]
          (is (= "v2" (:description after)))
          (is (not= original-updated-at (:updated_at after))
              "description differs → UPDATE fires → updated_at bumped")))
      (finally (p/clear-staging-tables!)))))
