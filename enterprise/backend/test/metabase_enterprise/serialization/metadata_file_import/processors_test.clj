(ns metabase-enterprise.serialization.metadata-file-import.processors-test
  "Tests for the pure batch processors. Each processor is exercised against an
  appdb populated via `mt/with-temp` — no HTTP, no streaming parser. Tests
  verify the processor's behavior contract: input shape, return shape, batch
  ordering, error attribution, and observable side-effects on the appdb.

  Tests are DBMS-agnostic: all SQL goes through toucan2 / HoneySQL or simple
  parameterized queries; no Postgres-specific syntax in test code or test
  fixtures. The suite runs against H2, MySQL 8+, or Postgres appdb depending
  on `MB_DB_TYPE` in the test environment."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.processors :as processors]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

;;; ============================== with-staging-tables ==============================

(defn- count-staging
  "Total row count across both staging tables. Used by macro tests to assert
  the entry/exit wipes."
  []
  (+ (t2/count :metabase_table_import)
     (t2/count :metabase_field_import)))

(deftest clear-staging-tables-empties-both-tables-test
  (testing "clear-staging-tables! deletes every row from both staging tables"
    (t2/insert! :metabase_table_import {:db_name "x" :table_name "t"})
    (t2/insert! :metabase_field_import {:db_name "x" :table_name "t" :field_name "f"})
    (processors/clear-staging-tables!)
    (is (zero? (count-staging))
        "both staging tables empty after clear-staging-tables!")))

(deftest with-staging-tables-returns-body-value-test
  (testing "with-staging-tables yields the value of the body's last form"
    (is (= ::sentinel
           (processors/with-staging-tables ::sentinel)))))

(deftest with-staging-tables-clears-on-entry-test
  (testing "rows present before the macro are gone by the time the body runs"
    (t2/insert! :metabase_table_import {:db_name "leftover" :table_name "t"})
    (t2/insert! :metabase_field_import {:db_name "leftover" :table_name "t" :field_name "f"})
    (let [observed (processors/with-staging-tables (count-staging))]
      (is (zero? observed)
          "macro entry wipes pre-existing rows so the body sees an empty staging area"))))

(deftest with-staging-tables-clears-on-successful-exit-test
  (testing "rows inserted inside the body are gone after the macro returns normally"
    (processors/with-staging-tables
      (t2/insert! :metabase_table_import {:db_name "x" :table_name "t"})
      (t2/insert! :metabase_field_import {:db_name "x" :table_name "t" :field_name "f"}))
    (is (zero? (count-staging))
        "macro exit wipes rows the body added")))

(deftest with-staging-tables-clears-on-thrown-exit-and-propagates-test
  (testing "if the body throws, the exception bubbles AND staging tables are still wiped (try/finally)"
    (let [thrown (atom nil)]
      (try
        (processors/with-staging-tables
          (t2/insert! :metabase_table_import {:db_name "x" :table_name "t"})
          (t2/insert! :metabase_field_import {:db_name "x" :table_name "t" :field_name "f"})
          (throw (ex-info "boom" {:kind ::test-error})))
        (catch clojure.lang.ExceptionInfo e
          (reset! thrown e)))
      (is (= ::test-error (:kind (ex-data @thrown)))
          "exception propagates with its ex-data intact")
      (is (zero? (count-staging))
          "staging tables wiped even though body threw"))))

;;; ============================== resolve-existing-parents-in-staging! ==============================

(deftest resolve-existing-parents-populates-parent-id-test
  (testing "for a staging row whose decomposed parent matches an existing
            metabase_field row, resolve sets staging.parent_id to that row's int id"
    (mt/with-temp [:model/Database {db-id :id}    {:name "rep-db" :engine :postgres}
                   :model/Table   {tbl-id :id}    {:db_id db-id :schema "public" :name "users"}
                   :model/Field   {parent-id :id} {:table_id tbl-id :name "address"
                                                   :base_type "type/Structured"
                                                   :database_type "json"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name             "rep-db"
                                            :table_schema        "public"
                                            :table_name          "users"
                                            :field_name          "zip"
                                            :nfc_path            (json/encode ["address"])
                                            :parent_db_name      "rep-db"
                                            :parent_table_schema "public"
                                            :parent_table_name   "users"
                                            :parent_path         nil
                                            :parent_name         "address"
                                            :base_type           "type/Text"})
        (processors/resolve-existing-parents-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (= parent-id (:parent_id row))
              "parent_id resolved to the existing metabase_field row's int id"))))))

(deftest resolve-existing-parents-idempotent-test
  (testing "running resolve twice yields the same result — UPDATE on already-set
            parent_id is a no-op"
    (mt/with-temp [:model/Database {db-id :id}    {:name "rep-idem-db" :engine :postgres}
                   :model/Table   {tbl-id :id}    {:db_id db-id :schema "public" :name "u"}
                   :model/Field   {parent-id :id} {:table_id tbl-id :name "p"
                                                   :base_type "type/Structured"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name             "rep-idem-db"
                                            :table_schema        "public"
                                            :table_name          "u"
                                            :field_name          "c"
                                            :parent_db_name      "rep-idem-db"
                                            :parent_table_schema "public"
                                            :parent_table_name   "u"
                                            :parent_name         "p"
                                            :base_type           "type/Text"})
        (processors/resolve-existing-parents-in-staging!)
        (processors/resolve-existing-parents-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (= parent-id (:parent_id row))))))))

(deftest resolve-existing-parents-leaves-unresolved-when-parent-missing-test
  (testing "a staging row whose parent doesn't exist in metabase_field gets
            parent_id NULL — the resolve UPDATE's correlated subquery returns
            no row → SET parent_id = NULL (the default; no-op effectively)"
    (mt/with-temp [:model/Database {db-id :id} {:name "rep-miss-db" :engine :postgres}
                   :model/Table   {_tbl-id :id} {:db_id db-id :schema "public" :name "t"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name             "rep-miss-db"
                                            :table_schema        "public"
                                            :table_name          "t"
                                            :field_name          "c"
                                            :parent_db_name      "rep-miss-db"
                                            :parent_table_schema "public"
                                            :parent_table_name   "t"
                                            :parent_name         "missing-parent"
                                            :base_type           "type/Text"})
        (processors/resolve-existing-parents-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (nil? (:parent_id row))
              "parent_id stays NULL when no metabase_field row matches"))))))

(deftest resolve-existing-parents-skips-rows-with-null-parent-ref-test
  (testing "a staging row with NULL parent_db_name (root field, no parent) is not
            updated — skipped via the outer WHERE clause"
    (processors/with-staging-tables
      (t2/insert! :metabase_field_import {:db_name      "rep-noparent-db"
                                          :table_schema "public"
                                          :table_name   "t"
                                          :field_name   "id"
                                          :base_type    "type/Integer"})
      (processors/resolve-existing-parents-in-staging!)
      (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
        (is (nil? (:parent_id row))
            "parent_id stays NULL — no parent ref, no UPDATE")))))

(deftest resolve-existing-parents-handles-nil-table-schema-test
  (testing "NULL table_schema works through COALESCE on both sides of the resolve
            JOIN — a staging row whose parent's table has NULL schema resolves OK"
    (mt/with-temp [:model/Database {db-id :id}    {:name "rep-nil-db" :engine :postgres}
                   :model/Table   {tbl-id :id}    {:db_id db-id :schema nil :name "t"}
                   :model/Field   {parent-id :id} {:table_id tbl-id :name "p"
                                                   :base_type "type/Structured"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name             "rep-nil-db"
                                            :table_schema        nil
                                            :table_name          "t"
                                            :field_name          "c"
                                            :parent_db_name      "rep-nil-db"
                                            :parent_table_schema nil
                                            :parent_table_name   "t"
                                            :parent_name         "p"
                                            :base_type           "type/Text"})
        (processors/resolve-existing-parents-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (= parent-id (:parent_id row))))))))

(deftest resolve-existing-parents-skips-defective-parent-test
  (testing "is_defective_duplicate parents are not matched — a staging row whose
            only candidate parent is defective gets parent_id NULL"
    (mt/with-temp [:model/Database {db-id :id} {:name "rep-defective-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "u"}
                   :model/Field   {_dup :id}   {:table_id tbl-id :name "p"
                                                :base_type "type/Structured"
                                                :is_defective_duplicate true}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name             "rep-defective-db"
                                            :table_schema        "public"
                                            :table_name          "u"
                                            :field_name          "c"
                                            :parent_db_name      "rep-defective-db"
                                            :parent_table_schema "public"
                                            :parent_table_name   "u"
                                            :parent_name         "p"
                                            :base_type           "type/Text"})
        (processors/resolve-existing-parents-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (nil? (:parent_id row))
              "defective parent is excluded from the resolve JOIN"))))))

;;; ============================== resolve-target-field-ids-in-staging! ==============================

(deftest resolve-target-field-ids-populates-when-match-exists-test
  (testing "for a staging row whose match key (db, schema, table, name, parent_id)
            corresponds to an existing metabase_field row, resolve sets
            staging.target_field_id to that row's int id"
    (mt/with-temp [:model/Database {db-id :id} {:name "rt-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "users"}
                   :model/Field   {f-id :id}   {:table_id tbl-id :name "id"
                                                :base_type "type/Integer"
                                                :database_type "integer"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name       "rt-db"
                                            :table_schema  "public"
                                            :table_name    "users"
                                            :field_name    "id"
                                            :base_type     "type/Integer"
                                            :database_type "integer"})
        (processors/resolve-target-field-ids-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (= f-id (:target_field_id row))
              "target_field_id resolved to the existing metabase_field row's id"))))))

(deftest resolve-target-field-ids-leaves-null-when-no-match-test
  (testing "a staging row whose natural key matches no metabase_field row keeps
            target_field_id NULL — the SET subquery returns no row, so it leaves
            the column unchanged from its NULL default"
    (mt/with-temp [:model/Database {db-id :id} {:name "rt-miss-db" :engine :postgres}
                   :model/Table   {_t :id}     {:db_id db-id :schema "public" :name "users"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name       "rt-miss-db"
                                            :table_schema  "public"
                                            :table_name    "users"
                                            :field_name    "no-such-field"
                                            :base_type     "type/Text"
                                            :database_type "varchar"})
        (processors/resolve-target-field-ids-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (nil? (:target_field_id row))
              "target_field_id stays NULL — no metabase_field row to match"))))))

(deftest resolve-target-field-ids-uses-parent-id-in-match-test
  (testing "matching uses unique_field_helper (= COALESCE(parent_id, 0)) so two
            fields with same (table, name) but different parent_id are
            distinguished — only the staging row whose parent_id matches the
            nested field's parent_id resolves"
    (mt/with-temp [:model/Database {db-id :id}     {:name "rt-uniq-db" :engine :postgres}
                   :model/Table   {tbl-id :id}     {:db_id db-id :schema "public" :name "t"}
                   :model/Field   {parent-id :id}  {:table_id tbl-id :name "outer"
                                                    :base_type "type/Structured"
                                                    :database_type "json"}
                   :model/Field   {flat-id :id}    {:table_id tbl-id :name "x"
                                                    :base_type "type/Integer"
                                                    :database_type "integer"}
                   :model/Field   {nested-id :id}  {:table_id tbl-id :name "x"
                                                    :parent_id parent-id
                                                    :nfc_path (json/encode ["outer"])
                                                    :base_type "type/Text"
                                                    :database_type "varchar"}]
      (processors/with-staging-tables
        ;; Two staging rows: one with parent_id = parent-id (nested), one without (flat).
        (t2/insert! :metabase_field_import {:db_name       "rt-uniq-db"
                                            :table_schema  "public"
                                            :table_name    "t"
                                            :field_name    "x"
                                            :nfc_path      (json/encode ["outer"])
                                            :parent_id     parent-id
                                            :base_type     "type/Text"
                                            :database_type "varchar"})
        (t2/insert! :metabase_field_import {:db_name       "rt-uniq-db"
                                            :table_schema  "public"
                                            :table_name    "t"
                                            :field_name    "x"
                                            :base_type     "type/Integer"
                                            :database_type "integer"})
        (processors/resolve-target-field-ids-in-staging!)
        (let [rows         (t2/query {:select [:field_name :parent_id :target_field_id]
                                      :from   [:metabase_field_import]})
              by-parent    (group-by :parent_id rows)
              flat-row     (first (get by-parent nil))
              nested-row   (first (get by-parent parent-id))]
          (is (= 2 (count rows)))
          (is (= flat-id   (:target_field_id flat-row))   "flat staging row resolves to flat field")
          (is (= nested-id (:target_field_id nested-row)) "nested staging row resolves to nested field"))))))

(deftest resolve-target-field-ids-matches-stub-test
  (testing "a stub row (active=false, database_type='__stub__') is a valid match —
            resolve sets target_field_id to the stub's id so merge-fields! UPDATE
            can clobber it. Defective duplicates are still excluded."
    (mt/with-temp [:model/Database {db-id :id}  {:name "rt-stub-db" :engine :postgres}
                   :model/Table   {tbl-id :id}  {:db_id db-id :schema "public" :name "t"}
                   :model/Field   {stub-id :id} {:table_id tbl-id :name "p"
                                                 :base_type "type/*"
                                                 :database_type "__stub__"
                                                 :active false
                                                 :is_defective_duplicate false}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name       "rt-stub-db"
                                            :table_schema  "public"
                                            :table_name    "t"
                                            :field_name    "p"
                                            :base_type     "type/Structured"
                                            :database_type "json"})
        (processors/resolve-target-field-ids-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (= stub-id (:target_field_id row))
              "stub matches by natural key — merge-fields! will then flip it to active"))))))

(deftest resolve-target-field-ids-handles-nil-table-schema-test
  (testing "NULL table_schema works through COALESCE on both sides of the JOIN"
    (mt/with-temp [:model/Database {db-id :id} {:name "rt-nil-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema nil :name "t"}
                   :model/Field   {f-id :id}   {:table_id tbl-id :name "x"
                                                :base_type "type/Integer"
                                                :database_type "integer"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name       "rt-nil-db"
                                            :table_schema  nil
                                            :table_name    "t"
                                            :field_name    "x"
                                            :base_type     "type/Integer"
                                            :database_type "integer"})
        (processors/resolve-target-field-ids-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (= f-id (:target_field_id row))))))))

(deftest resolve-target-field-ids-skips-defective-test
  (testing "is_defective_duplicate metabase_field rows are excluded from match —
            a staging row whose only candidate is defective gets target_field_id NULL"
    (mt/with-temp [:model/Database {db-id :id} {:name "rt-def-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "t"}
                   :model/Field   {_d :id}     {:table_id tbl-id :name "x"
                                                :base_type "type/Integer"
                                                :database_type "integer"
                                                :is_defective_duplicate true}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name       "rt-def-db"
                                            :table_schema  "public"
                                            :table_name    "t"
                                            :field_name    "x"
                                            :base_type     "type/Integer"
                                            :database_type "integer"})
        (processors/resolve-target-field-ids-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (nil? (:target_field_id row))
              "defective candidate excluded — target_field_id stays NULL"))))))

(deftest resolve-target-field-ids-idempotent-test
  (testing "running resolve twice yields the same target_field_id — UPDATE on
            an already-set target_field_id replays the same value"
    (mt/with-temp [:model/Database {db-id :id} {:name "rt-idem-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "t"}
                   :model/Field   {f-id :id}   {:table_id tbl-id :name "x"
                                                :base_type "type/Integer"
                                                :database_type "integer"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name       "rt-idem-db"
                                            :table_schema  "public"
                                            :table_name    "t"
                                            :field_name    "x"
                                            :base_type     "type/Integer"
                                            :database_type "integer"})
        (processors/resolve-target-field-ids-in-staging!)
        (processors/resolve-target-field-ids-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (= f-id (:target_field_id row))))))))

;;; ============================== merge-fields! ==============================

(deftest merge-fields-empty-staging-is-noop-test
  (testing "with empty staging, merge-fields! makes no live writes"
    (mt/with-temp [:model/Database {db-id :id}  {:name "mf-noop-db" :engine :postgres}
                   :model/Table   {tbl-id :id}  {:db_id db-id :schema "public" :name "t"}]
      (let [count-before (t2/count :model/Field :table_id tbl-id)]
        (processors/with-staging-tables
          (processors/merge-fields-pass-1!))
        (is (= count-before (t2/count :model/Field :table_id tbl-id))
            "no rows written when staging is empty")))))

(deftest merge-fields-inserts-unmatched-test
  (testing "a staging row whose (table_id, name, parent_id) doesn't exist is INSERTed
            with the full clobber payload, active=true, is_defective_duplicate=false"
    (mt/with-temp [:model/Database {db-id :id} {:name "mf-ins-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "users"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name           "mf-ins-db"
                                            :table_schema      "public"
                                            :table_name        "users"
                                            :field_name        "id"
                                            :base_type         "type/Integer"
                                            :database_type     "integer"
                                            :description       "primary key"
                                            :semantic_type     "type/PK"
                                            :effective_type    "type/Integer"})
        (processors/resolve-target-field-ids-in-staging!)
        (processors/merge-fields-pass-1!))
      (let [row (t2/select-one :model/Field :table_id tbl-id :name "id")]
        (is (some? row))
        (is (= :type/Integer (:base_type row)))
        (is (= "integer"     (:database_type row)))
        (is (= "primary key" (:description row)))
        (is (= :type/PK      (:semantic_type row)))
        (is (true?           (:active row)))
        (is (nil?            (:fk_target_field_id row))
            "fk_target_field_id starts NULL — phase 4 (commit 4) sets it")))))

(deftest merge-fields-updates-matched-clobbers-payload-test
  (testing "an existing matched field gets every clobber-payload column overwritten
            from staging — including nfc_path. (Today's per-batch clobber preserved
            nfc_path; the new merge clobbers everything per the import-is-alternate-sync
            philosophy.)"
    (mt/with-temp [:model/Database {db-id :id} {:name "mf-upd-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "u"}
                   :model/Field   {f-id :id}   {:table_id tbl-id :name "x"
                                                :base_type "type/Integer"
                                                :database_type "integer"
                                                :description "old"
                                                :semantic_type "type/PK"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name        "mf-upd-db"
                                            :table_schema   "public"
                                            :table_name     "u"
                                            :field_name     "x"
                                            :base_type      "type/Text"
                                            :database_type  "varchar"
                                            :description    "new"
                                            :semantic_type  "type/Description"})
        (processors/resolve-target-field-ids-in-staging!)
        (processors/merge-fields-pass-1!))
      (let [row (t2/select-one :model/Field :id f-id)]
        (is (= :type/Text         (:base_type row)))
        (is (= "varchar"          (:database_type row)))
        (is (= "new"              (:description row)))
        (is (= :type/Description  (:semantic_type row)))))))

(deftest merge-fields-flips-stub-to-active-test
  (testing "an existing stub (active=false, base_type=type/*, database_type=__stub__)
            matched by a real-row staging entry gets flipped to active=true with the
            real row's payload — the headline stub-fill behavior"
    (mt/with-temp [:model/Database {db-id :id}  {:name "mf-stub-db" :engine :postgres}
                   :model/Table   {tbl-id :id}  {:db_id db-id :schema "public" :name "t"}
                   :model/Field   {stub-id :id} {:table_id tbl-id :name "p"
                                                 :base_type "type/*"
                                                 :database_type "__stub__"
                                                 :active false
                                                 :is_defective_duplicate false}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name        "mf-stub-db"
                                            :table_schema   "public"
                                            :table_name     "t"
                                            :field_name     "p"
                                            :base_type      "type/Structured"
                                            :database_type  "json"
                                            :description    "real row"})
        (processors/resolve-target-field-ids-in-staging!)
        (processors/merge-fields-pass-1!))
      (let [row (t2/select-one :model/Field :id stub-id)]
        (is (true?              (:active row)) "stub flipped to active")
        (is (= :type/Structured (:base_type row)))
        (is (= "json"           (:database_type row)))
        (is (= "real row"       (:description row)))))))

(deftest merge-fields-uses-parent-id-in-match-test
  (testing "matching uses unique_field_helper (= COALESCE(parent_id, 0)) so two
            fields with same (table, name) but different parent_id are
            distinguished. Staging row with resolved parent_id matches only the
            corresponding nested field."
    (mt/with-temp [:model/Database {db-id :id}     {:name "mf-uniq-db" :engine :postgres}
                   :model/Table   {tbl-id :id}     {:db_id db-id :schema "public" :name "t"}
                   :model/Field   {parent-id :id}  {:table_id tbl-id :name "outer"
                                                    :base_type "type/Structured"}
                   :model/Field   {flat-id :id}    {:table_id tbl-id :name "x"
                                                    :base_type "type/Integer"
                                                    :description "flat-old"}
                   :model/Field   {nested-id :id}  {:table_id tbl-id :name "x"
                                                    :parent_id parent-id
                                                    :nfc_path (json/encode ["outer"])
                                                    :base_type "type/Integer"
                                                    :description "nested-old"}]
      (processors/with-staging-tables
        ;; staging row matches the NESTED "x" (parent_id=parent-id), not the flat one.
        (t2/insert! :metabase_field_import {:db_name        "mf-uniq-db"
                                            :table_schema   "public"
                                            :table_name     "t"
                                            :field_name     "x"
                                            :nfc_path       (json/encode ["outer"])
                                            :parent_id      parent-id
                                            :base_type      "type/Text"
                                            :database_type  "varchar"
                                            :description    "nested-new"})
        (processors/resolve-target-field-ids-in-staging!)
        (processors/merge-fields-pass-1!))
      (is (= "nested-new" (:description (t2/select-one :model/Field :id nested-id))))
      (is (= "flat-old"   (:description (t2/select-one :model/Field :id flat-id)))
          "flat 'x' (parent_id=NULL) is unaffected — different unique_field_helper"))))

(deftest merge-fields-handles-nil-schema-test
  (testing "NULL table_schema works through the COALESCE on both sides of the JOIN"
    (mt/with-temp [:model/Database {db-id :id} {:name "mf-nil-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema nil :name "t"}
                   :model/Field   {f-id :id}   {:table_id tbl-id :name "x"
                                                :base_type "type/Integer"
                                                :description "old"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name       "mf-nil-db"
                                            :table_schema  nil
                                            :table_name    "t"
                                            :field_name    "x"
                                            :base_type     "type/Text"
                                            :database_type "varchar"
                                            :description   "patched"})
        (processors/resolve-target-field-ids-in-staging!)
        (processors/merge-fields-pass-1!))
      (is (= "patched" (:description (t2/select-one :model/Field :id f-id)))))))

(deftest merge-fields-idempotent-test
  (testing "running resolve+merge twice with the same staging contents is a no-op
            on the second pass: the second resolve picks up the row inserted by the
            first merge so target_field_id is set, the UPDATE re-applies the same
            payload, and the INSERT skips because no row has target_field_id NULL"
    (mt/with-temp [:model/Database {db-id :id} {:name "mf-idem-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "t"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name       "mf-idem-db"
                                            :table_schema  "public"
                                            :table_name    "t"
                                            :field_name    "x"
                                            :base_type     "type/Text"
                                            :database_type "varchar"})
        (processors/resolve-target-field-ids-in-staging!)
        (processors/merge-fields-pass-1!)
        (processors/resolve-target-field-ids-in-staging!)
        (processors/merge-fields-pass-1!))
      (is (= 1 (count (t2/select :model/Field :table_id tbl-id :name "x")))))))

(deftest merge-fields-rolls-back-when-outer-txn-aborts-test
  (testing "merge-fields! composes with an outer t2/with-transaction: outer abort
            rolls back the merge-fields writes too"
    (mt/with-temp [:model/Database {db-id :id} {:name "mf-atom-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "t"}]
      (let [count-before (t2/count :model/Field :table_id tbl-id)]
        (try
          (processors/with-staging-tables
            (t2/insert! :metabase_field_import {:db_name       "mf-atom-db"
                                                :table_schema  "public"
                                                :table_name    "t"
                                                :field_name    "would-be-inserted"
                                                :base_type     "type/Text"
                                                :database_type "varchar"})
            (processors/resolve-target-field-ids-in-staging!)
            (t2/with-transaction [_]
              (processors/merge-fields-pass-1!)
              (throw (ex-info "force rollback" {:kind :test_force_rollback}))))
          (catch clojure.lang.ExceptionInfo _e))
        (is (= count-before (t2/count :model/Field :table_id tbl-id)))
        (is (nil? (t2/select-one :model/Field :table_id tbl-id :name "would-be-inserted")))))))

;;; ============================== merge-fields! skip-if-unchanged ==============================

(defn- stamp-field-updated-at!
  "Pin a field row's `updated_at` to a known past sentinel timestamp via raw
  SQL UPDATE (does NOT itself bump `updated_at` like `t2/update!` would). Used
  by skip-if-unchanged tests to detect whether a subsequent merge UPDATE
  fired: if `updated_at` is still the sentinel afterward, no UPDATE happened."
  [field-id]
  (t2/query {:update :metabase_field
             :set    {:updated_at [:inline "2000-01-01 00:00:00"]}
             :where  [:= :metabase_field.id field-id]}))

(deftest merge-fields-skip-if-unchanged-test
  (testing "an existing field row whose seven payload columns plus active match
            the staging row exactly does NOT get UPDATEd — proven by the
            sentinel `updated_at` surviving the merge call. This is the perf
            optimization: re-imports of unchanged fields generate no dead
            tuples."
    (mt/with-temp [:model/Database {db-id :id} {:name "mf-skip-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "u"}
                   :model/Field   {f-id :id}   {:table_id          tbl-id
                                                :name              "x"
                                                :base_type         "type/Integer"
                                                :database_type     "integer"
                                                :description       "primary key"
                                                :effective_type    "type/Integer"
                                                :semantic_type     "type/PK"
                                                :coercion_strategy nil
                                                :nfc_path          nil
                                                :active            true}]
      (stamp-field-updated-at! f-id)
      (let [updated-before (:updated_at (t2/select-one :model/Field :id f-id))]
        (processors/with-staging-tables
          (t2/insert! :metabase_field_import {:db_name           "mf-skip-db"
                                              :table_schema      "public"
                                              :table_name        "u"
                                              :field_name        "x"
                                              :base_type         "type/Integer"
                                              :database_type     "integer"
                                              :description       "primary key"
                                              :effective_type    "type/Integer"
                                              :semantic_type     "type/PK"
                                              :coercion_strategy nil
                                              :nfc_path          nil})
          (processors/resolve-target-field-ids-in-staging!)
          (processors/merge-fields-pass-1!))
        (let [updated-after (:updated_at (t2/select-one :model/Field :id f-id))]
          (is (= updated-before updated-after)
              "updated_at unchanged — merge UPDATE did not fire on identical-payload row"))))))

(deftest merge-fields-fires-when-only-one-column-differs-test
  (testing "an existing field row that differs from staging in exactly one
            payload column (description) DOES get UPDATEd — proves the
            predicate's OR fires when any single column differs"
    (mt/with-temp [:model/Database {db-id :id} {:name "mf-onediff-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "u"}
                   :model/Field   {f-id :id}   {:table_id          tbl-id
                                                :name              "x"
                                                :base_type         "type/Integer"
                                                :database_type     "integer"
                                                :description       "old"
                                                :effective_type    "type/Integer"
                                                :semantic_type     "type/PK"
                                                :coercion_strategy nil
                                                :nfc_path          nil
                                                :active            true}]
      (stamp-field-updated-at! f-id)
      (let [updated-before (:updated_at (t2/select-one :model/Field :id f-id))]
        (processors/with-staging-tables
          (t2/insert! :metabase_field_import {:db_name           "mf-onediff-db"
                                              :table_schema      "public"
                                              :table_name        "u"
                                              :field_name        "x"
                                              :base_type         "type/Integer"
                                              :database_type     "integer"
                                              :description       "new" ;; only difference
                                              :effective_type    "type/Integer"
                                              :semantic_type     "type/PK"
                                              :coercion_strategy nil
                                              :nfc_path          nil})
          (processors/resolve-target-field-ids-in-staging!)
          (processors/merge-fields-pass-1!))
        (let [row (t2/select-one :model/Field :id f-id)]
          (is (= "new" (:description row))
              "description clobbered to staging value")
          (is (not= updated-before (:updated_at row))
              "updated_at advanced — merge UPDATE fired because one column differed"))))))

;;; ============================== resolve-fk-target-ids-in-staging! ==============================

(deftest resolve-fk-target-ids-populates-fk-target-id-test
  (testing "for a staging row whose decomposed fk_target matches an existing
            metabase_field row, resolve sets staging.fk_target_id to that row's int id"
    (mt/with-temp [:model/Database {db-id :id}    {:name "rfk-db" :engine :postgres}
                   :model/Table   {tbl-id :id}    {:db_id db-id :schema "public" :name "users"}
                   :model/Field   {target-id :id} {:table_id tbl-id :name "id"
                                                   :base_type "type/Integer"
                                                   :database_type "integer"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name                "rfk-db"
                                            :table_schema           "public"
                                            :table_name             "users"
                                            :field_name             "uid"
                                            :base_type              "type/Integer"
                                            :database_type          "integer"
                                            :fk_target_db_name      "rfk-db"
                                            :fk_target_table_schema "public"
                                            :fk_target_table_name   "users"
                                            :fk_target_path         nil
                                            :fk_target_name         "id"})
        (processors/resolve-fk-target-ids-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (= target-id (:fk_target_id row))))))))

(deftest resolve-fk-target-ids-idempotent-test
  (testing "running resolve-fk-target twice produces the same result"
    (mt/with-temp [:model/Database {db-id :id}    {:name "rfk-idem-db" :engine :postgres}
                   :model/Table   {tbl-id :id}    {:db_id db-id :schema "public" :name "u"}
                   :model/Field   {target-id :id} {:table_id tbl-id :name "id"
                                                   :base_type "type/Integer"
                                                   :database_type "integer"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name                "rfk-idem-db"
                                            :table_schema           "public"
                                            :table_name             "u"
                                            :field_name             "uid"
                                            :base_type              "type/Integer"
                                            :database_type          "integer"
                                            :fk_target_db_name      "rfk-idem-db"
                                            :fk_target_table_schema "public"
                                            :fk_target_table_name   "u"
                                            :fk_target_name         "id"})
        (processors/resolve-fk-target-ids-in-staging!)
        (processors/resolve-fk-target-ids-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (= target-id (:fk_target_id row))))))))

(deftest resolve-fk-target-ids-leaves-unresolved-when-target-missing-test
  (testing "a staging row whose fk_target doesn't exist in metabase_field gets
            fk_target_id NULL — assert-no-unresolved-fk-targets! will catch it"
    (mt/with-temp [:model/Database {db-id :id} {:name "rfk-miss-db" :engine :postgres}
                   :model/Table   {_ :id}      {:db_id db-id :schema "public" :name "t"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name                "rfk-miss-db"
                                            :table_schema           "public"
                                            :table_name             "t"
                                            :field_name             "x"
                                            :base_type              "type/Integer"
                                            :database_type          "integer"
                                            :fk_target_db_name      "rfk-miss-db"
                                            :fk_target_table_schema "public"
                                            :fk_target_table_name   "t"
                                            :fk_target_name         "missing-target"})
        (processors/resolve-fk-target-ids-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (nil? (:fk_target_id row))))))))

(deftest resolve-fk-target-ids-skips-rows-without-fk-target-ref-test
  (testing "a staging row with NULL fk_target_db_name (no FK) is skipped"
    (processors/with-staging-tables
      (t2/insert! :metabase_field_import {:db_name       "rfk-nofk-db"
                                          :table_schema  "public"
                                          :table_name    "t"
                                          :field_name    "id"
                                          :base_type     "type/Integer"
                                          :database_type "integer"})
      (processors/resolve-fk-target-ids-in-staging!)
      (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
        (is (nil? (:fk_target_id row)))))))

(deftest resolve-fk-target-ids-handles-nil-schema-test
  (testing "NULL fk_target_table_schema works through COALESCE"
    (mt/with-temp [:model/Database {db-id :id}    {:name "rfk-nil-db" :engine :postgres}
                   :model/Table   {tbl-id :id}    {:db_id db-id :schema nil :name "t"}
                   :model/Field   {target-id :id} {:table_id tbl-id :name "id"
                                                   :base_type "type/Integer"
                                                   :database_type "integer"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name                "rfk-nil-db"
                                            :table_schema           nil
                                            :table_name             "t"
                                            :field_name             "x"
                                            :base_type              "type/Integer"
                                            :database_type          "integer"
                                            :fk_target_db_name      "rfk-nil-db"
                                            :fk_target_table_schema nil
                                            :fk_target_table_name   "t"
                                            :fk_target_name         "id"})
        (processors/resolve-fk-target-ids-in-staging!)
        (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
          (is (= target-id (:fk_target_id row))))))))

;;; ============================== process-databases ==============================

(deftest process-databases-matches-by-name-and-engine-test
  (testing "a source row whose (name, engine) pair matches an existing target Database
            produces a :matched result whose :target-id is the existing row's id.
            :source-id carries the portable id (the database name)."
    (mt/with-temp [:model/Database {target-id :id} {:name "imported-db" :engine :postgres}]
      (is (= [{:source-id "imported-db" :target-id target-id :status :matched}]
             (into [] (processors/process-databases!
                       [[1 {:name "imported-db" :engine "postgres"}]])))))))

(deftest process-databases-emits-no-match-when-name-or-engine-differs-test
  (testing "an unmatched row emits a :no-match result with line attribution and a
            human-readable detail string. Mismatches are non-fatal — the loader logs and
            skips dependents rather than aborting boot."
    (let [[result] (into [] (processors/process-databases!
                             [[7 {:name "no-such-db-zzz" :engine "h2"}]]))]
      (is (= "no-such-db-zzz" (:source-id result)))
      (is (= :no-match (:status result)))
      (is (= 7 (:line result)))
      (is (string? (:detail result)))
      (is (not (contains? result :target-id))
          "no :target-id key on no-match (so callers can use (:target-id r) as a presence check)"))))

(deftest process-databases-disambiguates-by-engine-pair-test
  (testing "two databases share a name but differ by engine; matching uses the
            (name, engine) pair, not just name"
    (mt/with-temp [:model/Database {pg-id :id} {:name "shared-name-test" :engine :postgres}
                   :model/Database {h2-id :id} {:name "shared-name-test" :engine :h2}]
      (let [[r] (into [] (processors/process-databases!
                          [[1 {:name "shared-name-test" :engine "h2"}]]))]
        (is (= h2-id (:target-id r)))
        (is (not= pg-id (:target-id r)))))))

(deftest process-databases-validation-failure-throws-with-attribution-test
  (testing "a malformed row (missing required key) throws ex-info carrying
            :kind :invalid_input, the file line number, and the row's portable
            source id (its :name) — the loader uses these for the boot-time error
            message"
    (let [e    (is (thrown? clojure.lang.ExceptionInfo
                            (into [] (processors/process-databases!
                                      [[42 {:name "missing-engine"}]]))))   ;; no :engine
          data (ex-data e)]
      (is (= :invalid_input (:kind data)))
      (is (= 42 (:line data)))
      (is (= "missing-engine" (:source-id data))))))

(deftest process-databases-preserves-input-order-test
  (testing "results are in input order regardless of internal SELECT ordering or
            which entries match"
    (mt/with-temp [:model/Database {a-id :id} {:name "order-a" :engine :postgres}
                   :model/Database {b-id :id} {:name "order-b" :engine :postgres}]
      (let [results (into [] (processors/process-databases!
                              [[1 {:name "order-b"        :engine "postgres"}]
                               [2 {:name "no-such-name-q" :engine "h2"}]
                               [3 {:name "order-a"        :engine "postgres"}]]))]
        (is (= ["order-b" "no-such-name-q" "order-a"] (mapv :source-id results)))
        (is (= [b-id nil a-id]                        (mapv :target-id results)))
        (is (= [:matched :no-match :matched]          (mapv :status results)))))))

(deftest process-databases-empty-batch-test
  (testing "empty input → empty output, no SQL, no exception"
    (is (= [] (into [] (processors/process-databases! []))))))

(deftest process-databases-result-is-streamable-test
  (testing "the return value supports both `reduce` (the loader's fold path) and
            seq/iteration (the test path) without re-running the eager batch work"
    (mt/with-temp [:model/Database {target-id :id} {:name "stream-probe" :engine :postgres}]
      (let [result     (processors/process-databases!
                        [[1 {:name "stream-probe" :engine "postgres"}]])
            via-reduce (reduce (fn [acc r] (assoc acc (:source-id r) (:target-id r))) {} result)
            via-seq    (vec (seq result))]
        (is (= {"stream-probe" target-id} via-reduce))
        (is (= 1 (count via-seq)))))))
