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

;;; ============================== drain-tables-into-staging! ==============================

(defn- json-tmp-file
  "Spool `data` as JSON to a tempfile and return the File. Used by drain tests."
  ^File [data]
  (let [f (File/createTempFile "drain-test-" ".json")]
    (.deleteOnExit f)
    (spit f (json/encode data))
    f))

(deftest drain-tables-into-staging-populates-staging-from-file-test
  (testing "the drain reads :tables from the file, writes one staging row per entry,
            humanizes display_name from name, copies description verbatim, and leaves
            resolved-id columns NULL (they're filled later inside the merge txn)"
    (processors/with-staging-tables
      (processors/drain-tables-into-staging!
       (json-tmp-file
        ;; wire-format convention: :schema is omitted when nil (per ::table-info)
        {:tables [{:db_id "drn-db" :schema "public" :name "user_orders" :description "all orders"}
                  {:db_id "drn-db"                  :name "audit_log"}]}))
      (let [rows (t2/query {:select [:*] :from [:metabase_table_import] :order-by [:table_name]})]
        (is (= 2 (count rows)))
        (is (= "audit_log"   (-> rows first :table_name)))
        (is (= "Audit Log"   (-> rows first :display_name))
            "display_name humanized at drain time")
        (is (nil?            (-> rows first :table_schema)))
        (is (nil?            (-> rows first :description)))
        (is (= "user_orders" (-> rows second :table_name)))
        (is (= "User Orders" (-> rows second :display_name)))
        (is (= "public"      (-> rows second :table_schema)))
        (is (= "all orders"  (-> rows second :description)))))))

(deftest drain-tables-into-staging-empty-tables-array-test
  (testing "an empty :tables array yields zero staging rows"
    (processors/with-staging-tables
      (processors/drain-tables-into-staging! (json-tmp-file {:tables []}))
      (is (zero? (t2/count :metabase_table_import))))))

(deftest drain-tables-into-staging-validation-failure-throws-test
  (testing "a malformed row (missing :name) throws ex-info with :kind :invalid_input
            and :line attribution so the loader can produce a useful boot-time error"
    (let [thrown (atom nil)]
      (try
        (processors/with-staging-tables
          (processors/drain-tables-into-staging!
           (json-tmp-file {:tables [{:db_id "drn-db" :schema "public"}]})))   ;; missing :name
        (catch clojure.lang.ExceptionInfo e
          (reset! thrown e)))
      (is (some? @thrown) "drain throws ex-info on a malformed row")
      (is (= :invalid_input (:kind (ex-data @thrown)))
          "the throw carries the standard validation :kind"))))

;;; ============================== merge-tables! ==============================

(deftest merge-tables-empty-staging-is-noop-test
  (testing "with empty staging, merge-tables! makes no live writes"
    (mt/with-temp [:model/Database {db-id :id} {:name "merge-noop-db" :engine :postgres}]
      (let [count-before (t2/count :model/Table :db_id db-id)]
        (processors/with-staging-tables
          (processors/merge-tables!))
        (is (= count-before (t2/count :model/Table :db_id db-id))
            "no rows written when staging is empty")))))

(deftest merge-tables-inserts-unmatched-table-test
  (testing "a staging row whose (db_id, schema, name) doesn't exist in metabase_table is
            INSERTed with active=true, data_layer=internal, display_name from staging,
            description from staging — column defaulting moves into the merge SQL"
    (mt/with-temp [:model/Database {db-id :id} {:name "merge-ins-db" :engine :postgres}]
      (processors/with-staging-tables
        (t2/insert! :metabase_table_import {:db_name      "merge-ins-db"
                                            :table_schema "public"
                                            :table_name   "fresh_table"
                                            :description  "owl sightings"
                                            :display_name "Fresh Table"})
        (processors/merge-tables!))
      (let [row (t2/select-one :model/Table :db_id db-id :name "fresh_table")
            ;; :model/Table strips :is_defective_duplicate from the read map; query directly.
            defective? (-> (t2/query ["SELECT is_defective_duplicate FROM metabase_table WHERE id = ?"
                                      (:id row)])
                           first :is_defective_duplicate)]
        (is (some? row))
        (is (= "public"         (:schema row)))
        (is (= "Fresh Table"    (:display_name row)))
        (is (= "owl sightings"  (:description row)))
        (is (true?              (:active row)))
        (is (= :internal        (:data_layer row))
            "data_layer string round-trips as keyword via :model/Table read transform")
        (is (= "complete"       (:initial_sync_status row))
            "column default kicks in")
        (is (false?             defective?))))))

(deftest merge-tables-updates-description-on-match-test
  (testing "an existing matched row gets its description clobbered from staging"
    (mt/with-temp [:model/Database {db-id :id}    {:name "merge-upd-db" :engine :postgres}
                   :model/Table   {tbl-id :id}    {:db_id db-id :schema "public" :name "users"
                                                   :description "old description"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_table_import {:db_name      "merge-upd-db"
                                            :table_schema "public"
                                            :table_name   "users"
                                            :description  "fresh description from import"
                                            :display_name "Users"})
        (processors/merge-tables!))
      (let [row (t2/select-one :model/Table :id tbl-id)]
        (is (= "fresh description from import" (:description row))
            "description was clobbered by the merge UPDATE")))))

(deftest merge-tables-skips-row-with-unmatched-database-test
  (testing "a staging row whose db_name has no target Database does NOT insert
            (silently dropped — orphan-warns happen later, post commit-4)"
    (processors/with-staging-tables
      (t2/insert! :metabase_table_import {:db_name      "no-such-target-db-xyz"
                                          :table_schema "public"
                                          :table_name   "orphan_no_db"
                                          :display_name "Orphan No Db"})
      (processors/merge-tables!))
    (is (nil? (t2/select-one :model/Table :name "orphan_no_db"))
        "no live row inserted when staging row's db_name has no matching target")))

(deftest merge-tables-handles-nil-schema-test
  (testing "schema is nullable; a staging row with NULL table_schema matches an existing
            table whose schema column is NULL via the COALESCE(col, '') equality"
    (mt/with-temp [:model/Database {db-id :id}    {:name "merge-nil-schema-db" :engine :postgres}
                   :model/Table   {tbl-id :id}    {:db_id db-id :schema nil :name "no_schema_tbl"
                                                   :description "old"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_table_import {:db_name      "merge-nil-schema-db"
                                            :table_schema nil
                                            :table_name   "no_schema_tbl"
                                            :description  "patched"})
        (processors/merge-tables!))
      (let [row (t2/select-one :model/Table :id tbl-id)]
        (is (= "patched" (:description row))
            "NULL-schema match works through COALESCE")))))

(deftest merge-tables-is-idempotent-test
  (testing "running merge-tables! twice with the same staging contents leaves the appdb
            in the same shape — NOT EXISTS catches the second pass and skips"
    (mt/with-temp [:model/Database {db-id :id} {:name "merge-idem-db" :engine :postgres}]
      (processors/with-staging-tables
        (t2/insert! :metabase_table_import {:db_name      "merge-idem-db"
                                            :table_schema "public"
                                            :table_name   "idem_tbl"
                                            :display_name "Idem Tbl"})
        (processors/merge-tables!)
        (processors/merge-tables!))
      (is (= 1 (count (t2/select :model/Table :db_id db-id :name "idem_tbl")))
          "exactly one row inserted; second merge call was a no-op"))))

;;; ============================== merge-tables! atomicity ==============================

(deftest merge-tables-rolls-back-when-outer-txn-aborts-test
  (testing "merge-tables! composes with an outer t2/with-transaction: if the outer
            txn aborts after the merge call returns, the merge's writes roll back
            too. This is the headline atomicity guarantee that commit 4 relies on
            (one outer txn wrapping stub-insert + merge-tables + merge-fields + …).

            Mechanics: t2/with-transaction joins the outer txn rather than creating
            a savepoint, so merge-tables!'s inner txn participates in the outer's
            all-or-nothing semantics."
    (mt/with-temp [:model/Database {db-id :id} {:name "merge-atom-db" :engine :postgres}]
      (let [count-before (t2/count :model/Table :db_id db-id)]
        (try
          (processors/with-staging-tables
            (t2/insert! :metabase_table_import {:db_name      "merge-atom-db"
                                                :table_schema "public"
                                                :table_name   "would_have_inserted"
                                                :display_name "Would Have Inserted"})
            (t2/with-transaction [_]
              (processors/merge-tables!)
              (throw (ex-info "force rollback" {:kind :test_force_rollback}))))
          (catch clojure.lang.ExceptionInfo _e))
        (is (= count-before (t2/count :model/Table :db_id db-id))
            "live row count unchanged after the outer transaction aborted")
        (is (nil? (t2/select-one :model/Table :db_id db-id :name "would_have_inserted"))
            "the staging row's would-be live INSERT did not commit")))))

;;; ============================== drain-fields-into-staging! ==============================

(deftest drain-fields-into-staging-flat-root-field-test
  (testing "a flat root field (no :parent_id, no :nfc_path) drains into staging with
            field_name from :name; nfc_path NULL; parent_* and fk_target_* NULL; the
            clobber-payload columns (base_type, database_type, description, etc.)
            stored verbatim from the wire row."
    (processors/with-staging-tables
      (processors/drain-fields-into-staging!
       (json-tmp-file
        {:fields [{:id ["fdrn-db" "public" "users" "id"]
                   :table_id ["fdrn-db" "public" "users"]
                   :name "id"
                   :base_type "type/Integer"
                   :database_type "integer"
                   :description "primary key"
                   :semantic_type "type/PK"
                   :effective_type "type/Integer"
                   :coercion_strategy "Coercion/UNIXSeconds->DateTime"}]}))
      (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
        (is (= "fdrn-db"      (:db_name row)))
        (is (= "public"       (:table_schema row)))
        (is (= "users"        (:table_name row)))
        (is (= "id"           (:field_name row)))
        (is (nil?             (:nfc_path row)))
        (is (nil?             (:parent_db_name row)))
        (is (nil?             (:parent_table_schema row)))
        (is (nil?             (:parent_table_name row)))
        (is (nil?             (:parent_path row)))
        (is (nil?             (:parent_name row)))
        (is (nil?             (:parent_id row)))
        (is (nil?             (:fk_target_db_name row)))
        (is (nil?             (:fk_target_id row)))
        (is (= "type/Integer" (:base_type row)))
        (is (= "integer"      (:database_type row)))
        (is (= "primary key"  (:description row)))
        (is (= "type/PK"      (:semantic_type row)))
        (is (= "type/Integer" (:effective_type row)))
        (is (= "Coercion/UNIXSeconds->DateTime" (:coercion_strategy row)))))))

(deftest drain-fields-into-staging-decomposes-parent-id-test
  (testing "a field with :parent_id has its parent's portable id decomposed into
            (parent_db_name, parent_table_schema, parent_table_name, parent_path,
            parent_name) using the (last, middle) split. parent_path is encoded
            same as metabase_field.nfc_path (NULL for empty/length-4 portable ids,
            JSON-encoded array string otherwise). parent_id stays NULL — filled by
            resolve-existing-parents-in-staging!."
    (processors/with-staging-tables
      (processors/drain-fields-into-staging!
       (json-tmp-file
        {:fields [;; parent at depth 1: parent's :id is length 4, parent_path is NULL.
                  {:id ["fdrn-db" "public" "users" "address" "zip"]
                   :table_id ["fdrn-db" "public" "users"]
                   :name "zip"
                   :nfc_path ["address"]
                   :parent_id ["fdrn-db" "public" "users" "address"]
                   :base_type "type/Text"}
                  ;; parent at depth 2: parent_path is encoded(["outer"]).
                  {:id ["fdrn-db" "public" "users" "outer" "middle" "leaf"]
                   :table_id ["fdrn-db" "public" "users"]
                   :name "leaf"
                   :nfc_path ["outer" "middle"]
                   :parent_id ["fdrn-db" "public" "users" "outer" "middle"]
                   :base_type "type/Text"}]}))
      (let [rows     (t2/query {:select [:*] :from [:metabase_field_import]})
            zip-row  (some #(when (= "zip"  (:field_name %)) %) rows)
            leaf-row (some #(when (= "leaf" (:field_name %)) %) rows)]
        (testing "shallow parent (parent's portable id length 4 → parent_path NULL)"
          (is (= "fdrn-db"      (:parent_db_name zip-row)))
          (is (= "public"       (:parent_table_schema zip-row)))
          (is (= "users"        (:parent_table_name zip-row)))
          (is (= "address"      (:parent_name zip-row)))
          (is (nil?             (:parent_path zip-row))
              "parent has no own path — length-4 portable id has empty middle")
          (is (= (json/encode ["address"]) (:nfc_path zip-row))))
        (testing "deep parent (parent's portable id length 5 → parent_path encoded)"
          (is (= "middle"       (:parent_name leaf-row)))
          (is (= (json/encode ["outer"])           (:parent_path leaf-row))
              "parent's own nfc_path encoded as JSON")
          (is (= (json/encode ["outer" "middle"]) (:nfc_path leaf-row))))))))

(deftest drain-fields-into-staging-decomposes-fk-target-test
  (testing "a field with :fk_target_field_id has the target's portable id
            decomposed into (fk_target_db_name, fk_target_table_schema,
            fk_target_table_name, fk_target_path, fk_target_name) using the same
            (last, middle) split as :parent_id. fk_target_id stays NULL — commit 4
            populates it."
    (processors/with-staging-tables
      (processors/drain-fields-into-staging!
       (json-tmp-file
        {:fields [{:id ["fkdrn-db" "public" "orders" "uid"]
                   :table_id ["fkdrn-db" "public" "orders"]
                   :name "uid"
                   :fk_target_field_id ["fkdrn-db" "public" "users" "id"]
                   :base_type "type/Integer"}]}))
      (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
        (is (= "fkdrn-db" (:fk_target_db_name row)))
        (is (= "public"   (:fk_target_table_schema row)))
        (is (= "users"    (:fk_target_table_name row)))
        (is (= "id"       (:fk_target_name row)))
        (is (nil?         (:fk_target_path row)))
        (is (nil?         (:fk_target_id row)))))))

(deftest drain-fields-into-staging-carries-name-verbatim-test
  (testing "wire :name is stored verbatim — drain doesn't interpret it. Even when
            the storage row's name is a synthesized display string (e.g., a
            JSON-unfolded leaf), the wire :name carries that string and drain
            stores it as-is. Convention awareness lives entirely on the export side."
    (processors/with-staging-tables
      (processors/drain-fields-into-staging!
       (json-tmp-file
        {:fields [{:id ["jdrn-db" "public" "ev" "p" "addr" "zip"]
                   :table_id ["jdrn-db" "public" "ev"]
                   :name "p → addr → zip"
                   :nfc_path ["p" "addr" "zip"]
                   :base_type "type/Text"}]}))
      (let [row (first (t2/query {:select [:*] :from [:metabase_field_import]}))]
        (is (= "p → addr → zip" (:field_name row)))
        (is (= (json/encode ["p" "addr" "zip"]) (:nfc_path row)))
        (is (nil? (:parent_db_name row)))))))

(deftest drain-fields-into-staging-empty-fields-array-test
  (testing "an empty :fields array yields zero staging rows"
    (processors/with-staging-tables
      (processors/drain-fields-into-staging! (json-tmp-file {:fields []}))
      (is (zero? (t2/count :metabase_field_import))))))

(deftest drain-fields-into-staging-validation-failure-throws-test
  (testing "a malformed field row throws ex-info with :kind :invalid_input"
    (let [thrown (atom nil)]
      (try
        (processors/with-staging-tables
          (processors/drain-fields-into-staging!
           (json-tmp-file {:fields [{:id ["d" "s" "t" "x"]
                                     :table_id ["d" "s" "t"]
                                     :name "x"}]})))   ;; missing :base_type (required)
        (catch clojure.lang.ExceptionInfo e
          (reset! thrown e)))
      (is (some? @thrown))
      (is (= :invalid_input (:kind (ex-data @thrown)))))))

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

;;; ============================== compute-stubs! ==============================

(deftest compute-stubs-empty-when-no-missing-parents-test
  (testing "empty staging or all parents resolved → empty spec list"
    (processors/with-staging-tables
      (is (= [] (processors/compute-stubs!))))))

(deftest compute-stubs-generates-spec-for-missing-parent-test
  (testing "a staging row whose parent doesn't exist generates one stub spec
            for the missing parent's portable id"
    (mt/with-temp [:model/Database {db-id :id} {:name "cs-db" :engine :postgres}
                   :model/Table   {_ :id}      {:db_id db-id :schema "public" :name "t"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name             "cs-db"
                                            :table_schema        "public"
                                            :table_name          "t"
                                            :field_name          "child"
                                            :nfc_path            (json/encode ["missing-parent"])
                                            :parent_db_name      "cs-db"
                                            :parent_table_schema "public"
                                            :parent_table_name   "t"
                                            :parent_name         "missing-parent"
                                            :base_type           "type/Text"})
        (let [specs (processors/compute-stubs!)]
          (is (= 1 (count specs)))
          (let [spec (first specs)]
            (is (= ["cs-db" "public" "t" "missing-parent"] (:portable-id spec)))
            (is (nil? (:parent-portable-id spec))
                "missing parent is at depth 1 → has no own parent (root)")))))))

(deftest compute-stubs-walks-ancestor-chain-depth-first-test
  (testing "for a missing parent at depth 2 with both ancestors absent, two stub
            specs are emitted in dependency order (root before descendant)"
    (mt/with-temp [:model/Database {db-id :id} {:name "cs-deep-db" :engine :postgres}
                   :model/Table   {_ :id}      {:db_id db-id :schema "public" :name "t"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name             "cs-deep-db"
                                            :table_schema        "public"
                                            :table_name          "t"
                                            :field_name          "leaf"
                                            :nfc_path            (json/encode ["outer" "middle"])
                                            :parent_db_name      "cs-deep-db"
                                            :parent_table_schema "public"
                                            :parent_table_name   "t"
                                            :parent_path         (json/encode ["outer"])
                                            :parent_name         "middle"
                                            :base_type           "type/Text"})
        (let [specs        (processors/compute-stubs!)
              portable-ids (mapv :portable-id specs)]
          (is (= 2 (count specs)))
          (is (= [["cs-deep-db" "public" "t" "outer"]
                  ["cs-deep-db" "public" "t" "outer" "middle"]]
                 portable-ids)
              "depth-first walk emits root (outer) before descendant (outer.middle)")
          (is (= [nil ["cs-deep-db" "public" "t" "outer"]]
                 (mapv :parent-portable-id specs))
              "the depth-2 spec references the depth-1 spec as its parent"))))))

(deftest compute-stubs-dedupes-shared-ancestors-test
  (testing "two staging rows sharing the same missing ancestor produce one spec"
    (mt/with-temp [:model/Database {db-id :id} {:name "cs-dedupe-db" :engine :postgres}
                   :model/Table   {_ :id}      {:db_id db-id :schema "public" :name "t"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import [{:db_name             "cs-dedupe-db"
                                             :table_schema        "public"
                                             :table_name          "t"
                                             :field_name          "c1"
                                             :nfc_path            (json/encode ["p"])
                                             :parent_db_name      "cs-dedupe-db"
                                             :parent_table_schema "public"
                                             :parent_table_name   "t"
                                             :parent_name         "p"
                                             :base_type           "type/Text"}
                                            {:db_name             "cs-dedupe-db"
                                             :table_schema        "public"
                                             :table_name          "t"
                                             :field_name          "c2"
                                             :nfc_path            (json/encode ["p"])
                                             :parent_db_name      "cs-dedupe-db"
                                             :parent_table_schema "public"
                                             :parent_table_name   "t"
                                             :parent_name         "p"
                                             :base_type           "type/Text"}])
        (is (= 1 (count (processors/compute-stubs!))))))))

(deftest compute-stubs-skips-existing-parents-test
  (testing "if the parent already exists in metabase_field, no stub is generated
            (compute-stubs! probes metabase_field; the existing parent caches as
            :exists and the walk terminates without producing a spec)"
    (mt/with-temp [:model/Database {db-id :id} {:name "cs-exists-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "t"}
                   :model/Field   {_ :id}      {:table_id tbl-id :name "p"
                                                :base_type "type/Structured"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name             "cs-exists-db"
                                            :table_schema        "public"
                                            :table_name          "t"
                                            :field_name          "c"
                                            :parent_db_name      "cs-exists-db"
                                            :parent_table_schema "public"
                                            :parent_table_name   "t"
                                            :parent_name         "p"
                                            :base_type           "type/Text"})
        (is (= [] (processors/compute-stubs!)))))))

(deftest compute-stubs-stops-walking-when-mid-chain-ancestor-exists-test
  (testing "for a depth-2 missing chain where the depth-1 ancestor EXISTS, only
            the depth-2 spec is generated"
    (mt/with-temp [:model/Database {db-id :id} {:name "cs-mid-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "t"}
                   :model/Field   {_ :id}      {:table_id tbl-id :name "outer"
                                                :base_type "type/Structured"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name             "cs-mid-db"
                                            :table_schema        "public"
                                            :table_name          "t"
                                            :field_name          "leaf"
                                            :nfc_path            (json/encode ["outer" "middle"])
                                            :parent_db_name      "cs-mid-db"
                                            :parent_table_schema "public"
                                            :parent_table_name   "t"
                                            :parent_path         (json/encode ["outer"])
                                            :parent_name         "middle"
                                            :base_type           "type/Text"})
        (let [specs (processors/compute-stubs!)]
          (is (= 1 (count specs)))
          (is (= ["cs-mid-db" "public" "t" "outer" "middle"]
                 (:portable-id (first specs))))
          (is (= ["cs-mid-db" "public" "t" "outer"]
                 (:parent-portable-id (first specs)))
              "missing depth-2 spec references the existing 'outer' as its parent"))))))

;;; ============================== insert-stubs-where-not-exists! ==============================

(deftest insert-stubs-inserts-root-stub-test
  (testing "a root stub spec (parent-portable-id nil) inserts a metabase_field row
            with parent_id=NULL, nfc_path=NULL, base_type='type/*',
            database_type='__stub__', active=false"
    (mt/with-temp [:model/Database {_db-id :id} {:name "is-root-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id _db-id :schema "public" :name "t"}]
      (processors/insert-stubs-where-not-exists!
       [{:portable-id ["is-root-db" "public" "t" "stubname"]
         :parent-portable-id nil}])
      (let [row (t2/select-one :model/Field :table_id tbl-id :name "stubname")]
        (is (some? row))
        (is (nil?         (:parent_id row)))
        (is (nil?         (:nfc_path row)))
        (is (= :type/*    (:base_type row)))
        (is (= "__stub__" (:database_type row)))
        (is (false?       (:active row)))))))

(deftest insert-stubs-inserts-nested-stub-test
  (testing "spec with parent-portable-id pointing at an existing field gets its
            parent_id resolved via INNER JOIN to that parent row"
    (mt/with-temp [:model/Database {_db-id :id}   {:name "is-nest-db" :engine :postgres}
                   :model/Table   {tbl-id :id}    {:db_id _db-id :schema "public" :name "t"}
                   :model/Field   {parent-id :id} {:table_id tbl-id :name "outer"
                                                   :base_type "type/Structured"}]
      (processors/insert-stubs-where-not-exists!
       [{:portable-id        ["is-nest-db" "public" "t" "outer" "leaf"]
         :parent-portable-id ["is-nest-db" "public" "t" "outer"]}])
      (let [row (t2/select-one :model/Field :table_id tbl-id :name "leaf")]
        (is (some? row))
        (is (= parent-id (:parent_id row)))
        (is (= '("outer") (:nfc_path row))
            "nfc_path stored encoded; the model decodes on read")))))

(deftest insert-stubs-inserts-depth-2-chain-test
  (testing "specs in root-first dependency order: inserting root first lets the
            child stub JOIN to the just-inserted root for parent_id resolution"
    (mt/with-temp [:model/Database {_db-id :id} {:name "is-chain-db" :engine :postgres}
                   :model/Table   {tbl-id :id}  {:db_id _db-id :schema "public" :name "t"}]
      (processors/insert-stubs-where-not-exists!
       [{:portable-id ["is-chain-db" "public" "t" "outer"]
         :parent-portable-id nil}
        {:portable-id        ["is-chain-db" "public" "t" "outer" "leaf"]
         :parent-portable-id ["is-chain-db" "public" "t" "outer"]}])
      (let [outer (t2/select-one :model/Field :table_id tbl-id :name "outer")
            leaf  (t2/select-one :model/Field :table_id tbl-id :name "leaf")]
        (is (some? outer))
        (is (some? leaf))
        (is (nil? (:parent_id outer)))
        (is (= (:id outer) (:parent_id leaf))
            "child's parent_id resolves to the just-inserted root's int id")))))

(deftest insert-stubs-idempotent-test
  (testing "running insert-stubs! twice with the same specs leaves only one row
            per stub — NOT EXISTS catches the second pass via unique_field_helper"
    (mt/with-temp [:model/Database {_db-id :id} {:name "is-idem-db" :engine :postgres}
                   :model/Table   {tbl-id :id}  {:db_id _db-id :schema "public" :name "t"}]
      (let [specs [{:portable-id ["is-idem-db" "public" "t" "stubname"]
                    :parent-portable-id nil}]]
        (processors/insert-stubs-where-not-exists! specs)
        (processors/insert-stubs-where-not-exists! specs))
      (is (= 1 (count (t2/select :model/Field :table_id tbl-id :name "stubname")))
          "exactly one stub row; second insert was a no-op"))))

(deftest insert-stubs-empty-specs-is-noop-test
  (testing "empty stub-specs collection makes no live writes"
    (mt/with-temp [:model/Database {_db-id :id} {:name "is-empty-db" :engine :postgres}
                   :model/Table   {tbl-id :id}  {:db_id _db-id :schema "public" :name "t"}]
      (let [count-before (t2/count :model/Field :table_id tbl-id)]
        (processors/insert-stubs-where-not-exists! [])
        (is (= count-before (t2/count :model/Field :table_id tbl-id)))))))

;;; ============================== assert-no-unresolved-parent-refs! ==============================

(deftest assert-no-unresolved-parent-refs-passes-when-all-resolved-test
  (testing "with empty staging or all parent refs resolved, the assert is silent"
    (processors/with-staging-tables
      (is (nil? (processors/assert-no-unresolved-parent-refs!))
          "no exception when staging has no rows")
      (t2/insert! :metabase_field_import {:db_name      "anr-db"
                                          :table_schema "public"
                                          :table_name   "t"
                                          :field_name   "root"
                                          :base_type    "type/Text"})  ;; no parent ref
      (is (nil? (processors/assert-no-unresolved-parent-refs!))
          "no exception when staging rows have no parent refs"))))

(deftest assert-no-unresolved-parent-refs-throws-on-unresolved-test
  (testing "if a staging row has parent_db_name set but parent_id NULL, the assert
            throws ex-info with :kind :stub_resolution_invalidated. This guards
            against the (impossible-under-the-precondition) case of the parent
            disappearing between compute-stubs! and the merge txn."
    (processors/with-staging-tables
      (t2/insert! :metabase_field_import {:db_name             "anr-db"
                                          :table_schema        "public"
                                          :table_name          "t"
                                          :field_name          "child"
                                          :parent_db_name      "anr-db"
                                          :parent_table_schema "public"
                                          :parent_table_name   "t"
                                          :parent_name         "still-missing"
                                          :base_type           "type/Text"})
      (let [thrown (atom nil)]
        (try
          (processors/assert-no-unresolved-parent-refs!)
          (catch clojure.lang.ExceptionInfo e
            (reset! thrown e)))
        (is (some? @thrown))
        (is (= :stub_resolution_invalidated (:kind (ex-data @thrown))))
        (is (pos? (:n-unresolved (ex-data @thrown)))
            "ex-data carries the count for diagnosis")))))

;;; ============================== merge-fields! ==============================

(deftest merge-fields-empty-staging-is-noop-test
  (testing "with empty staging, merge-fields! makes no live writes"
    (mt/with-temp [:model/Database {db-id :id}  {:name "mf-noop-db" :engine :postgres}
                   :model/Table   {tbl-id :id}  {:db_id db-id :schema "public" :name "t"}]
      (let [count-before (t2/count :model/Field :table_id tbl-id)]
        (processors/with-staging-tables
          (processors/merge-fields!))
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
        (processors/merge-fields!))
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
        (processors/merge-fields!))
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
        (processors/merge-fields!))
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
        (processors/merge-fields!))
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
        (processors/merge-fields!))
      (is (= "patched" (:description (t2/select-one :model/Field :id f-id)))))))

(deftest merge-fields-idempotent-test
  (testing "running merge-fields! twice with the same staging contents is a no-op
            on the second pass (NOT EXISTS catches insert; UPDATE re-applies same payload)"
    (mt/with-temp [:model/Database {db-id :id} {:name "mf-idem-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "t"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name       "mf-idem-db"
                                            :table_schema  "public"
                                            :table_name    "t"
                                            :field_name    "x"
                                            :base_type     "type/Text"
                                            :database_type "varchar"})
        (processors/merge-fields!)
        (processors/merge-fields!))
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
            (t2/with-transaction [_]
              (processors/merge-fields!)
              (throw (ex-info "force rollback" {:kind :test_force_rollback}))))
          (catch clojure.lang.ExceptionInfo _e))
        (is (= count-before (t2/count :model/Field :table_id tbl-id)))
        (is (nil? (t2/select-one :model/Field :table_id tbl-id :name "would-be-inserted")))))))

;;; ============================== warn-on-orphan-staging-rows! ==============================

(deftest warn-on-orphan-staging-rows-no-orphans-test
  (testing "with no orphans (every staging row JOINs cleanly), no WARN logged"
    (mt/with-temp [:model/Database {db-id :id} {:name "ws-noorph-db" :engine :postgres}
                   :model/Table   {_ :id}      {:db_id db-id :schema "public" :name "t"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_table_import {:db_name "ws-noorph-db" :table_schema "public" :table_name "t"})
        (mt/with-log-messages-for-level
          [messages [metabase-enterprise.serialization.metadata-file-import.processors :warn]]
          (processors/warn-on-orphan-staging-rows! #{db-id})
          (is (empty? (filter #(re-find #"orphan staging" (:message %)) (messages)))
              "no orphan WARN when all staging rows match"))))))

(deftest warn-on-orphan-staging-rows-warns-on-orphan-table-test
  (testing "staging table row whose db_name isn't in the matched-target-db set
            triggers a WARN summarizing the orphans"
    (mt/with-temp [:model/Database {db-id :id} {:name "ws-tbl-db" :engine :postgres}]
      (processors/with-staging-tables
        (t2/insert! :metabase_table_import {:db_name "no-such-db" :table_name "orphan"})
        (mt/with-log-messages-for-level
          [messages [metabase-enterprise.serialization.metadata-file-import.processors :warn]]
          (processors/warn-on-orphan-staging-rows! #{db-id})
          (is (some #(re-find #"orphan staging table" (:message %)) (messages))
              "WARN line emitted for the orphan table"))))))

(deftest warn-on-orphan-staging-rows-warns-on-orphan-field-test
  (testing "staging field whose (db, schema, table) doesn't JOIN to any metabase_table
            triggers a WARN — no matching table means the field has nowhere to attach"
    (mt/with-temp [:model/Database {db-id :id} {:name "ws-fld-db" :engine :postgres}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name       "ws-fld-db"
                                            :table_schema  "public"
                                            :table_name    "no-such-table"
                                            :field_name    "x"
                                            :base_type     "type/Text"
                                            :database_type "varchar"})
        (mt/with-log-messages-for-level
          [messages [metabase-enterprise.serialization.metadata-file-import.processors :warn]]
          (processors/warn-on-orphan-staging-rows! #{db-id})
          (is (some #(re-find #"orphan staging field" (:message %)) (messages))))))))

;;; ============================== merge-fk-targets! ==============================

(deftest merge-fk-targets-empty-staging-is-noop-test
  (testing "with empty staging, merge-fk-targets! makes no live writes"
    (mt/with-temp [:model/Database {db-id :id} {:name "mft-noop-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "t"}
                   :model/Field   {f-id :id}   {:table_id tbl-id :name "x"
                                                :base_type "type/Integer"
                                                :database_type "integer"}]
      (processors/with-staging-tables
        (processors/merge-fk-targets!))
      (is (nil? (:fk_target_field_id (t2/select-one :model/Field :id f-id)))))))

(deftest merge-fk-targets-writes-fk-on-matched-rows-test
  (testing "for a staging row with a resolved fk_target_id, the merge UPDATEs
            the corresponding metabase_field row's fk_target_field_id"
    (mt/with-temp [:model/Database {db-id :id}    {:name "mft-db" :engine :postgres}
                   :model/Table   {tbl-id :id}    {:db_id db-id :schema "public" :name "u"}
                   :model/Field   {target-id :id} {:table_id tbl-id :name "id"
                                                   :base_type "type/Integer"
                                                   :database_type "integer"}
                   :model/Field   {ref-id :id}    {:table_id tbl-id :name "uid"
                                                   :base_type "type/Integer"
                                                   :database_type "integer"}]
      (processors/with-staging-tables
        ;; staging row matches the "uid" field; resolved fk_target_id = id field's int id.
        (t2/insert! :metabase_field_import {:db_name        "mft-db"
                                            :table_schema   "public"
                                            :table_name     "u"
                                            :field_name     "uid"
                                            :base_type      "type/Integer"
                                            :database_type  "integer"
                                            :fk_target_id   target-id})
        (processors/merge-fk-targets!))
      (is (= target-id (:fk_target_field_id (t2/select-one :model/Field :id ref-id))))
      (is (nil? (:fk_target_field_id (t2/select-one :model/Field :id target-id)))
          "target field is NOT updated — only the source field gets an FK"))))

(deftest merge-fk-targets-skips-unresolved-staging-rows-test
  (testing "staging rows with NULL fk_target_id (i.e., no resolved target) are
            skipped — those rows correspond to fields without FKs in the wire"
    (mt/with-temp [:model/Database {db-id :id} {:name "mft-skip-db" :engine :postgres}
                   :model/Table   {tbl-id :id} {:db_id db-id :schema "public" :name "u"}
                   :model/Field   {ref-id :id} {:table_id tbl-id :name "x"
                                                :base_type "type/Integer"
                                                :database_type "integer"
                                                :fk_target_field_id nil}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name       "mft-skip-db"
                                            :table_schema  "public"
                                            :table_name    "u"
                                            :field_name    "x"
                                            :base_type     "type/Integer"
                                            :database_type "integer"})
        (processors/merge-fk-targets!))
      (is (nil? (:fk_target_field_id (t2/select-one :model/Field :id ref-id)))))))

(deftest merge-fk-targets-idempotent-test
  (testing "running merge-fk-targets! twice is a no-op on the second pass"
    (mt/with-temp [:model/Database {db-id :id}    {:name "mft-idem-db" :engine :postgres}
                   :model/Table   {tbl-id :id}    {:db_id db-id :schema "public" :name "u"}
                   :model/Field   {target-id :id} {:table_id tbl-id :name "id"
                                                   :base_type "type/Integer"
                                                   :database_type "integer"}
                   :model/Field   {ref-id :id}    {:table_id tbl-id :name "uid"
                                                   :base_type "type/Integer"
                                                   :database_type "integer"}]
      (processors/with-staging-tables
        (t2/insert! :metabase_field_import {:db_name        "mft-idem-db"
                                            :table_schema   "public"
                                            :table_name     "u"
                                            :field_name     "uid"
                                            :base_type      "type/Integer"
                                            :database_type  "integer"
                                            :fk_target_id   target-id})
        (processors/merge-fk-targets!)
        (processors/merge-fk-targets!))
      (is (= target-id (:fk_target_field_id (t2/select-one :model/Field :id ref-id)))))))

;;; ============================== assert-no-unresolved-fk-targets! ==============================

(deftest assert-no-unresolved-fk-targets-passes-when-all-resolved-test
  (testing "with empty staging or all FK targets resolved, the assert is silent"
    (processors/with-staging-tables
      (is (nil? (processors/assert-no-unresolved-fk-targets!))
          "no exception when staging has no rows")
      (t2/insert! :metabase_field_import {:db_name       "anf-db"
                                          :table_schema  "public"
                                          :table_name    "t"
                                          :field_name    "id"
                                          :base_type     "type/Integer"
                                          :database_type "integer"})  ;; no FK
      (is (nil? (processors/assert-no-unresolved-fk-targets!))
          "no exception when staging rows have no FK refs"))))

(deftest assert-no-unresolved-fk-targets-throws-on-unresolved-test
  (testing "if a staging row has fk_target_db_name set but fk_target_id NULL, the
            assert throws ex-info with :kind :fk_target_unresolved. Preserves
            today's hard-fail-on-corrupt-file behavior — a file referencing an FK
            target that exists nowhere is a corrupt-file signal."
    (processors/with-staging-tables
      (t2/insert! :metabase_field_import {:db_name                "anf-db"
                                          :table_schema           "public"
                                          :table_name             "t"
                                          :field_name             "x"
                                          :base_type              "type/Integer"
                                          :database_type          "integer"
                                          :fk_target_db_name      "anf-db"
                                          :fk_target_table_schema "public"
                                          :fk_target_table_name   "t"
                                          :fk_target_name         "still-missing"})
      (let [thrown (atom nil)]
        (try
          (processors/assert-no-unresolved-fk-targets!)
          (catch clojure.lang.ExceptionInfo e
            (reset! thrown e)))
        (is (some? @thrown))
        (is (= :fk_target_unresolved (:kind (ex-data @thrown))))
        (is (pos? (:n-unresolved (ex-data @thrown))))))))

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

