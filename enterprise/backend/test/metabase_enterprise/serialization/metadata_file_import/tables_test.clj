(ns ^:synchronous metabase-enterprise.serialization.metadata-file-import.tables-test
  "Tests for `resolve-target-table-ids-in-staging!` and `merge-tables!` —
  the table-merge half of the pipeline. These functions key on the
  natural-key tuple (db_name, schema, name) against `metabase_table`,
  filtered to active non-defective rows."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.processors :as p]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :once
  (fn [thunk]
    ;; Warm test-data (load + sync) before disabling auto-sync: the first load must not happen with
    ;; sync off, or with-temp defaults that resolve test-data tables (e.g. `(data/id :checkins)`) fail.
    (mt/db)
    (mt/with-temporary-setting-values [disable-auto-sync true]
      (thunk))))

(defn- staging-row [source-id db-name name & {:as overrides}]
  (merge {:source_id    source-id
          :source_db_id 1
          :db_name      db-name
          :schema       "PUBLIC"
          :name         name
          :display_name (str/capitalize name)}
         overrides))

(defn- staging-rows-by-source-id []
  ;; HoneySQL (not raw SQL) so `schema` is dialect-quoted correctly on MySQL.
  (into {} (map (juxt :source_id identity))
        (t2/query {:select [:source_id :db_name :schema :name :description :target_id]
                   :from   [:metabase_table_import]})))

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

(deftest resolve-matches-inactive-target-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :h2}
                 :model/Table {tid :id} {:db_id db-id :schema "PUBLIC" :name "users" :active false}]
    (try
      (p/clear-staging-tables!)
      (t2/insert! :metabase_table_import [(staging-row 100 db-name "users")])
      (p/resolve-target-table-ids-in-staging!)
      (let [row (get (staging-rows-by-source-id) 100)]
        (is (= tid (:target_id row))
            "inactive (non-defective) target rows resolve to the existing row — the merge reactivates
             it in place rather than inserting a duplicate that collides on the unique index"))
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

(deftest resolve-tolerates-duplicate-natural-key-target-test
  (testing "If two live (db_name, schema, name) candidates exist — possible
            because `metabase_database`'s unique constraint is
            `(router_database_id, name)` and NULL routers don't collide —
            the resolve subquery picks a stable tiebreaker (MIN(id)) rather
            than throwing `subquery returned more than one row`. Regression
            for GHY-3549."
    (mt/with-temp [:model/Database {db-id-1 :id db-name :name} {:engine :h2}
                   :model/Database {db-id-2 :id}                {:engine :h2}]
      ;; Make the second Database share the first's name; mt/with-temp gives
      ;; each a unique name but PG's unique constraint is `(router_database_id,
      ;; name)`, so an UPDATE that sets a duplicate (NULL, name) is permitted.
      (t2/query {:update :metabase_database :set {:name db-name} :where [:= :id db-id-2]})
      (let [t1-id (:id (t2/insert-returning-instance!
                        :model/Table {:db_id db-id-1 :schema "PUBLIC" :name "users"
                                      :display_name "Users" :active true}))
            t2-id (:id (t2/insert-returning-instance!
                        :model/Table {:db_id db-id-2 :schema "PUBLIC" :name "users"
                                      :display_name "Users" :active true}))]
        (try
          (p/clear-staging-tables!)
          (t2/insert! :metabase_table_import [(staging-row 100 db-name "users")])
          ;; The bug pre-fix: resolve throws "subquery returned more than one row".
          ;; With the fix: resolve completes and target_id is set to MIN(id).
          (p/resolve-target-table-ids-in-staging!)
          (let [row (get (staging-rows-by-source-id) 100)]
            (is (= (min t1-id t2-id) (:target_id row))
                "MIN(id) tiebreaker: target_id is the smaller of the two candidates"))
          (finally
            (p/clear-staging-tables!)))))))

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
        (is (true? (:active inserted)))
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
