(ns ^:parallel metabase.warehouses-rest.metadata-file-import.processors-test
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
   [metabase.test :as mt]
   [metabase.warehouses-rest.metadata-file-import.processors :as processors]
   [toucan2.core :as t2]))

;;; ============================== process-databases ==============================

(deftest process-databases-matches-by-name-and-engine-test
  (testing "a source row whose (name, engine) pair matches an existing target Database
            produces a :matched result whose :target-id is the existing row's id"
    (mt/with-temp [:model/Database {target-id :id} {:name "imported-db" :engine :postgres}]
      (is (= [{:source-id 99 :target-id target-id :status :matched}]
             (into [] (processors/process-databases!
                       [[1 {:id 99 :name "imported-db" :engine "postgres"}]])))))))

(deftest process-databases-emits-no-match-when-name-or-engine-differs-test
  (testing "an unmatched row emits a :no-match result with line attribution and a
            human-readable detail string. Phase 1 is non-fatal — the loader logs and
            skips dependents rather than aborting boot."
    (let [[result] (into [] (processors/process-databases!
                             [[7 {:id 999 :name "no-such-db-zzz" :engine "h2"}]]))]
      (is (= 999 (:source-id result)))
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
                          [[1 {:id 1 :name "shared-name-test" :engine "h2"}]]))]
        (is (= h2-id (:target-id r)))
        (is (not= pg-id (:target-id r)))))))

(deftest process-databases-validation-failure-throws-with-attribution-test
  (testing "a malformed row (missing required key) throws ex-info carrying
            :kind :invalid_input, the file line number, and the row's source id —
            the loader uses these for the boot-time error message"
    (try
      (into [] (processors/process-databases!
                [[42 {:id 99 :name "missing-engine"}]]))   ;; no :engine
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (let [data (ex-data e)]
          (is (= :invalid_input (:kind data)))
          (is (= 42 (:line data)))
          (is (= 99 (:source-id data))))))))

(deftest process-databases-preserves-input-order-test
  (testing "results are in input order regardless of internal SELECT ordering or
            which entries match"
    (mt/with-temp [:model/Database {a-id :id} {:name "order-a" :engine :postgres}
                   :model/Database {b-id :id} {:name "order-b" :engine :postgres}]
      (let [results (into [] (processors/process-databases!
                              [[1 {:id 10 :name "order-b"        :engine "postgres"}]
                               [2 {:id 20 :name "no-such-name-q" :engine "h2"}]
                               [3 {:id 30 :name "order-a"        :engine "postgres"}]]))]
        (is (= [10 20 30]                        (mapv :source-id results)))
        (is (= [b-id nil a-id]                   (mapv :target-id results)))
        (is (= [:matched :no-match :matched]     (mapv :status results)))))))

(deftest process-databases-empty-batch-test
  (testing "empty input → empty output, no SQL, no exception"
    (is (= [] (into [] (processors/process-databases! []))))))

(deftest process-databases-result-is-streamable-test
  (testing "the return value supports both `reduce` (the loader's fold path) and
            seq/iteration (the test path) without re-running the eager batch work"
    (mt/with-temp [:model/Database {target-id :id} {:name "stream-probe" :engine :postgres}]
      (let [result     (processors/process-databases!
                        [[1 {:id 99 :name "stream-probe" :engine "postgres"}]])
            via-reduce (reduce (fn [acc r] (assoc acc (:source-id r) (:target-id r))) {} result)
            via-seq    (vec (seq result))]
        (is (= {99 target-id} via-reduce))
        (is (= 1 (count via-seq)))))))

;;; ============================== process-tables ==============================

(deftest process-tables-matches-by-db-schema-name-test
  (testing "a source row matching an existing target Table by (target-db-id, schema, name)
            produces a :matched result with the existing row's id"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-match-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema "public" :name "orders"}]
      (let [db-id-map  {77 db-id}
            [r] (into [] (processors/process-tables!
                          [[1 {:id 501 :db_id 77 :schema "public" :name "orders"}]]
                          db-id-map))]
        (is (= {:source-id 501 :target-id tbl-id :status :matched} r))))))

(deftest process-tables-inserts-unmatched-test
  (testing "a source row with no existing target Table is bulk-inserted; the result
            carries :status :inserted and the new row exists in the appdb"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-insert-db" :engine :postgres}]
      (let [db-id-map {77 db-id}
            [r]       (into [] (processors/process-tables!
                                [[1 {:id 999 :db_id 77 :schema "public" :name "fresh-table"}]]
                                db-id-map))
            inserted  (t2/select-one :model/Table :id (:target-id r))]
        (is (= 999 (:source-id r)))
        (is (= :inserted (:status r)))
        (is (some? (:target-id r)))
        (is (= db-id (:db_id inserted)))
        (is (= "public" (:schema inserted)))
        (is (= "fresh-table" (:name inserted)))))))

(deftest process-tables-patches-description-on-match-when-source-has-description-test
  (testing "patch-on-match policy: when a source row has a non-nil description and the
            target row exists, the target's description is updated to the source's. See
            METADATA_FILE_IMPORT_PLAN.md §10c — flipping this is one line in the processor."
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-patch-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema "public" :name "orders"
                                              :description "old description"}]
      (let [db-id-map {77 db-id}]
        (into [] (processors/process-tables!
                  [[1 {:id 501 :db_id 77 :schema "public" :name "orders"
                       :description "new description"}]]
                  db-id-map))
        (is (= "new description"
               (:description (t2/select-one :model/Table :id tbl-id))))))))

(deftest process-tables-leaves-target-description-untouched-when-source-has-none-test
  (testing "patch-on-match policy: when the source row has no description, the target
            row's existing description is left intact (no UPDATE issued)"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-no-patch-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema "public" :name "orders"
                                              :description "preserved"}]
      (let [db-id-map {77 db-id}]
        (into [] (processors/process-tables!
                  [[1 {:id 501 :db_id 77 :schema "public" :name "orders"}]]
                  db-id-map))
        (is (= "preserved"
               (:description (t2/select-one :model/Table :id tbl-id))))))))

(deftest process-tables-emits-no-target-db-when-source-db-id-not-mapped-test
  (testing "if the source row's db_id isn't in the loader-supplied db-id-map, the row
            is reported as :no-target-db and no SQL runs for it. The loader logs WARN
            and skips dependent fields."
    (let [db-id-map {77 1234}
          [r]       (into [] (processors/process-tables!
                              [[5 {:id 501 :db_id 999 :schema "public" :name "orders"}]]
                              db-id-map))]
      (is (= 501 (:source-id r)))
      (is (= :no-target-db (:status r)))
      (is (= 5 (:line r)))
      (is (string? (:detail r)))
      (is (not (contains? r :target-id))))))

(deftest process-tables-handles-nil-schema-test
  (testing "schema is optional; a source row with no :schema matches a target Table
            whose schema column is NULL"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-nil-schema-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema nil :name "no-schema-tbl"}]
      (let [db-id-map {77 db-id}
            [r]       (into [] (processors/process-tables!
                                [[1 {:id 501 :db_id 77 :name "no-schema-tbl"}]]
                                db-id-map))]
        (is (= :matched (:status r)))
        (is (= tbl-id (:target-id r)))))))

(deftest process-tables-insert-applies-required-defaults-test
  (testing "newly-inserted tables carry the defaults the import flow requires:
            display_name (humanized from name), active=true, initial_sync_status=complete,
            data_layer=internal — these would normally come from :model/Table's insert hooks
            but we bypass those (see comment at the call site about set-new-table-permissions!
            and Postgres lock exhaustion)"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-defaults-db" :engine :postgres}]
      (let [db-id-map {77 db-id}
            [r]       (into [] (processors/process-tables!
                                [[1 {:id 501 :db_id 77 :schema "public" :name "user_profiles"}]]
                                db-id-map))
            row       (t2/select-one :model/Table :id (:target-id r))]
        (is (= true                (:active row)))
        (is (= "complete"          (:initial_sync_status row)))
        (is (= :internal           (:data_layer row))
            "data_layer is read back as a keyword via :model/Table's hooks")
        (is (= "User Profiles"     (:display_name row))
            "display_name is humanized from the source name")))))

(deftest process-tables-validation-failure-throws-with-attribution-test
  (testing "a malformed row throws ex-info with :kind :invalid_input, the line number,
            and the row's source id"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-validate-db" :engine :postgres}]
      (let [db-id-map {77 db-id}]
        (try
          (into [] (processors/process-tables!
                    [[42 {:id 501 :db_id 77 :schema "public"}]]   ;; missing :name
                    db-id-map))
          (is false "should have thrown")
          (catch clojure.lang.ExceptionInfo e
            (let [data (ex-data e)]
              (is (= :invalid_input (:kind data)))
              (is (= 42 (:line data)))
              (is (= 501 (:source-id data))))))))))

(deftest process-tables-preserves-input-order-test
  (testing "results are in input order regardless of internal SELECT/INSERT ordering or
            which rows match vs insert vs miss"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-order-db" :engine :postgres}
                   :model/Table {existing :id} {:db_id db-id :schema "public" :name "existing"}]
      (let [db-id-map {77 db-id}
            results   (into [] (processors/process-tables!
                                [[1 {:id 10 :db_id 77 :schema "public" :name "existing"}]
                                 [2 {:id 20 :db_id 99 :schema "public" :name "no-target-db-row"}]
                                 [3 {:id 30 :db_id 77 :schema "public" :name "fresh-1"}]]
                                db-id-map))]
        (is (= [10 20 30]                                  (mapv :source-id results)))
        (is (= [:matched :no-target-db :inserted]          (mapv :status results)))
        (is (= existing                                    (:target-id (nth results 0))))
        (is (= nil                                         (:target-id (nth results 1))))
        (is (some?                                         (:target-id (nth results 2))))))))

(deftest process-tables-empty-batch-test
  (testing "empty input → empty output"
    (is (= [] (into [] (processors/process-tables! [] {}))))))

;;; ======================== process-fields-insert-pass ========================
;;;
;;; Tuple shape: `[ln row resolved-parent-id-or-nil]`. The loader has already
;;; (a) skipped rows whose source id is in the field id-map, and
;;; (b) resolved each row's source `parent_id` to a target id via the field
;;; id-map (or supplied nil for root fields). The processor remaps `table_id`
;;; via the supplied `table-id-map` and does the SQL.

(deftest process-fields-insert-pass-inserts-root-field-test
  (testing "a root field row (resolved-parent-id = nil) is inserted with
            parent_id = NULL, is_defective_duplicate = FALSE, and
            fk_target_field_id = NULL — the §11a multi-pass design's invariants"
    (mt/with-temp [:model/Database {db-id :id} {:name "fld-root-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema "public" :name "users"}]
      (let [table-id-map {77 tbl-id}
            batch        [[1 {:id 9001 :table_id 77 :name "zip"
                              :base_type "type/Text" :database_type "text"} nil]]
            [r]          (into [] (processors/process-fields-insert-pass! batch table-id-map))
            row          (t2/select-one :model/Field :id (:target-id r))]
        (is (= 9001 (:source-id r)))
        (is (= :inserted (:status r)))
        (is (= tbl-id (:table_id row)))
        (is (= "zip" (:name row)))
        (is (nil? (:parent_id row)))
        (is (nil? (:fk_target_field_id row))
            "fk_target_field_id stays NULL during phase 3; phase 4 fills it in")
        ;; is_defective_duplicate is stripped on read by :model/Field's hooks; query the
        ;; raw column to verify the §11a invariant — multi-pass-by-depth must NOT use the
        ;; defective-duplicate exemption to dodge the unique constraint.
        (is (= false
               (:is_defective_duplicate
                (first (t2/query ["SELECT is_defective_duplicate FROM metabase_field WHERE id = ?"
                                  (:target-id r)]))))
            "phase 3 must insert with is_defective_duplicate=FALSE (the new design invariant)")))))

(deftest process-fields-insert-pass-inserts-nested-field-test
  (testing "a nested field row (resolved-parent-id = int) is inserted with
            parent_id = the resolved id"
    (mt/with-temp [:model/Database {db-id :id} {:name "fld-nested-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema "public" :name "events"}
                   :model/Field {parent-id :id} {:table_id tbl-id :name "address"
                                                 :base_type "type/Structured"}]
      (let [table-id-map {77 tbl-id}
            batch        [[1 {:id 9002 :table_id 77 :name "zip" :parent_id 8000
                              :base_type "type/Text" :database_type "text"}
                           parent-id]]                              ;; <- loader-resolved
            [r]          (into [] (processors/process-fields-insert-pass! batch table-id-map))
            row          (t2/select-one :model/Field :id (:target-id r))]
        (is (= :inserted (:status r)))
        (is (= parent-id (:parent_id row))
            "parent_id is set to the loader-resolved target id, not the source value")))))

(deftest process-fields-insert-pass-matches-existing-root-test
  (testing "a source root field whose (target-table-id, name, parent_id=NULL) triple
            already exists on the target produces :matched with the existing id; no insert"
    (mt/with-temp [:model/Database {db-id :id}        {:name "fld-mr-db" :engine :postgres}
                   :model/Table    {tbl-id :id}       {:db_id db-id :name "t"}
                   :model/Field    {existing-id :id}  {:table_id tbl-id :name "zip"
                                                       :base_type "type/Text"}]
      (let [table-id-map {77 tbl-id}
            batch        [[1 {:id 9001 :table_id 77 :name "zip" :base_type "type/Text"} nil]]
            [r]          (into [] (processors/process-fields-insert-pass! batch table-id-map))]
        (is (= :matched (:status r)))
        (is (= existing-id (:target-id r)))))))

(deftest process-fields-insert-pass-matches-existing-nested-test
  (testing "a source nested field whose (target-table-id, name, target-parent-id) triple
            already exists produces :matched with the existing id"
    (mt/with-temp [:model/Database {db-id :id}        {:name "fld-mn-db" :engine :postgres}
                   :model/Table    {tbl-id :id}       {:db_id db-id :name "t"}
                   :model/Field    {parent-id :id}    {:table_id tbl-id :name "address"
                                                       :base_type "type/Structured"}
                   :model/Field    {existing-id :id}  {:table_id tbl-id :name "zip"
                                                       :parent_id parent-id
                                                       :base_type "type/Text"}]
      (let [table-id-map {77 tbl-id}
            batch        [[1 {:id 9001 :table_id 77 :name "zip" :parent_id 8000
                              :base_type "type/Text"}
                           parent-id]]
            [r]          (into [] (processors/process-fields-insert-pass! batch table-id-map))]
        (is (= :matched (:status r)))
        (is (= existing-id (:target-id r)))))))

(deftest process-fields-insert-pass-patches-metadata-on-match-test
  (testing "patch-on-match policy (§10c): when a matched target field exists and the
            source row carries description / semantic_type / effective_type /
            coercion_strategy, the existing target's columns are updated.
            parent_id and fk_target_field_id are NEVER patched on match."
    (mt/with-temp [:model/Database {db-id :id}      {:name "fld-patch-db" :engine :postgres}
                   :model/Table    {tbl-id :id}     {:db_id db-id :name "t"}
                   :model/Field    {fld-id :id}     {:table_id tbl-id :name "zip"
                                                     :base_type "type/Text"
                                                     :description "old"
                                                     :semantic_type "type/Quantity"}]
      (let [table-id-map {77 tbl-id}]
        (into [] (processors/process-fields-insert-pass!
                  [[1 {:id 9001 :table_id 77 :name "zip"
                       :base_type "type/Text"
                       :description "new desc"
                       :semantic_type "type/ZipCode"
                       :effective_type "type/Text"
                       :coercion_strategy "Coercion/String->Float"}
                    nil]]
                  table-id-map))
        (let [row (t2/select-one :model/Field :id fld-id)]
          (is (= "new desc"                 (:description row)))
          (is (= :type/ZipCode              (:semantic_type row)))
          (is (= :type/Text                 (:effective_type row)))
          (is (= :Coercion/String->Float    (:coercion_strategy row))))))))

(deftest process-fields-insert-pass-leaves-target-untouched-when-source-has-no-metadata-test
  (testing "patch-on-match policy: when the source row carries none of the writable
            metadata keys (no description, no semantic_type, etc.), the matched
            target row's columns are left intact (no UPDATE issued)"
    (mt/with-temp [:model/Database {db-id :id}    {:name "fld-no-patch-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :name "t"}
                   :model/Field    {fld-id :id}   {:table_id tbl-id :name "zip"
                                                   :base_type "type/Text"
                                                   :description "preserved"
                                                   :semantic_type "type/ZipCode"}]
      (let [table-id-map {77 tbl-id}]
        (into [] (processors/process-fields-insert-pass!
                  [[1 {:id 9001 :table_id 77 :name "zip" :base_type "type/Text"} nil]]
                  table-id-map))
        (let [row (t2/select-one :model/Field :id fld-id)]
          (is (= "preserved"      (:description row)))
          (is (= :type/ZipCode    (:semantic_type row))))))))

(deftest process-fields-insert-pass-emits-no-target-table-when-table-id-not-mapped-test
  (testing "if the source row's table_id has no entry in table-id-map, the row is
            reported as :no-target-table and no SQL runs for it. The loader logs WARN
            and skips."
    (let [table-id-map {77 1234}
          [r] (into [] (processors/process-fields-insert-pass!
                        [[5 {:id 9001 :table_id 999 :name "zip" :base_type "type/Text"} nil]]
                        table-id-map))]
      (is (= 9001 (:source-id r)))
      (is (= :no-target-table (:status r)))
      (is (= 5 (:line r)))
      (is (string? (:detail r)))
      (is (not (contains? r :target-id))))))

(deftest process-fields-insert-pass-validation-failure-throws-with-attribution-test
  (testing "a malformed field row (missing required :base_type) throws ex-info with
            :kind :invalid_input, the line number, and the row's source id"
    (mt/with-temp [:model/Database {db-id :id}  {:name "fld-validate-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id db-id :name "t"}]
      (let [table-id-map {77 tbl-id}]
        (try
          (into [] (processors/process-fields-insert-pass!
                    [[42 {:id 9001 :table_id 77 :name "zip"} nil]]   ;; missing :base_type
                    table-id-map))
          (is false "should have thrown")
          (catch clojure.lang.ExceptionInfo e
            (let [data (ex-data e)]
              (is (= :invalid_input (:kind data)))
              (is (= 42 (:line data)))
              (is (= 9001 (:source-id data))))))))))

(deftest process-fields-insert-pass-preserves-input-order-test
  (testing "results are in input order regardless of which rows match, insert, or miss"
    (mt/with-temp [:model/Database {db-id :id}    {:name "fld-order-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :name "t"}
                   :model/Field    {existing :id} {:table_id tbl-id :name "existing"
                                                   :base_type "type/Text"}]
      (let [table-id-map {77 tbl-id}
            results (into [] (processors/process-fields-insert-pass!
                              [[1 {:id 10 :table_id 77 :name "existing"
                                   :base_type "type/Text" :database_type "text"} nil]
                               [2 {:id 20 :table_id 99 :name "no-tbl"
                                   :base_type "type/Text" :database_type "text"} nil]
                               [3 {:id 30 :table_id 77 :name "fresh-1"
                                   :base_type "type/Text" :database_type "text"} nil]]
                              table-id-map))]
        (is (= [10 20 30]                                       (mapv :source-id results)))
        (is (= [:matched :no-target-table :inserted]            (mapv :status results)))
        (is (= existing                                         (:target-id (nth results 0))))))))

(deftest process-fields-insert-pass-empty-batch-test
  (testing "empty input → empty output"
    (is (= [] (into [] (processors/process-fields-insert-pass! [] {}))))))

;;; ======================== process-fields-fk-finalize ========================
;;;
;;; Tuple shape: `[ln row resolved-target-id resolved-fk-target-id]`. The loader has
;;; (a) skipped rows whose `:fk_target_field_id` is null/omitted, and
;;; (b) resolved both the row's own source id AND its `fk_target_field_id` to target
;;;     ids via the field id-map. Both resolved values are guaranteed non-null;
;;;     misses are detected by the loader and hard-fail per §10 (corrupt file).
;;;
;;; The processor's only responsibilities: validate the row, build a single batched
;;; UPDATE that sets fk_target_field_id on every row in the batch.

(deftest process-fields-fk-finalize-writes-fk-target-field-id-test
  (testing "happy path: the target row's fk_target_field_id is updated to the
            loader-resolved fk-target id"
    (mt/with-temp [:model/Database {db-id :id}  {:name "fkfin-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id db-id :name "t"}
                   :model/Field    {tgt-fk :id} {:table_id tbl-id :name "fk-target"
                                                 :base_type "type/Integer"
                                                 :database_type "integer"}
                   :model/Field    {fld-id :id} {:table_id tbl-id :name "ref-field"
                                                 :base_type "type/Integer"
                                                 :database_type "integer"}]
      (let [batch [[1 {:id 9001 :table_id 77 :name "ref-field"
                       :base_type "type/Integer" :database_type "integer"
                       :fk_target_field_id 9999}
                    fld-id tgt-fk]]
            [r]   (into [] (processors/process-fields-fk-finalize! batch))]
        (is (= {:source-id 9001 :target-id fld-id :status :updated} r))
        (is (= tgt-fk
               (:fk_target_field_id (t2/select-one :model/Field :id fld-id))))))))

(deftest process-fields-fk-finalize-only-touches-fk-target-field-id-column-test
  (testing "the simplified phase-4 SQL (§11a) writes ONLY fk_target_field_id —
            not parent_id, not is_defective_duplicate, not description or any other
            metadata. This invariant is what lets phase 3 set the right values once
            and trust them through phase 4."
    (mt/with-temp [:model/Database {db-id :id}    {:name "fkfin-touch-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :name "t"}
                   :model/Field    {parent-id :id} {:table_id tbl-id :name "parent"
                                                    :base_type "type/Structured"
                                                    :database_type "json"}
                   :model/Field    {tgt-fk :id}   {:table_id tbl-id :name "fk-target"
                                                   :base_type "type/Integer"
                                                   :database_type "integer"}
                   :model/Field    {fld-id :id}   {:table_id tbl-id :name "child"
                                                   :parent_id parent-id
                                                   :base_type "type/Text"
                                                   :database_type "text"
                                                   :description "untouched"
                                                   :semantic_type "type/ZipCode"}]
      (let [batch [[1 {:id 9001 :table_id 77 :name "child"
                       :base_type "type/Text" :database_type "text"
                       :fk_target_field_id 9999}
                    fld-id tgt-fk]]]
        (into [] (processors/process-fields-fk-finalize! batch))
        (let [row (t2/select-one :model/Field :id fld-id)]
          (is (= tgt-fk            (:fk_target_field_id row)) "fk_target_field_id is set")
          (is (= parent-id         (:parent_id row))          "parent_id is preserved")
          (is (= "untouched"       (:description row))        "description is preserved")
          (is (= :type/ZipCode     (:semantic_type row))      "semantic_type is preserved")
          (is (= "text"            (:database_type row))      "database_type is preserved"))))))

(deftest process-fields-fk-finalize-batched-update-affects-all-rows-test
  (testing "a multi-row batch results in every row's fk_target_field_id being set
            in a single batched UPDATE — the SQL uses a VALUES table with one
            row per input"
    (mt/with-temp [:model/Database {db-id :id}    {:name "fkfin-batch-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :name "t"}
                   :model/Field    {tgt-a :id}    {:table_id tbl-id :name "tgt-a"
                                                   :base_type "type/Integer" :database_type "integer"}
                   :model/Field    {tgt-b :id}    {:table_id tbl-id :name "tgt-b"
                                                   :base_type "type/Integer" :database_type "integer"}
                   :model/Field    {fld-1 :id}    {:table_id tbl-id :name "ref-1"
                                                   :base_type "type/Integer" :database_type "integer"}
                   :model/Field    {fld-2 :id}    {:table_id tbl-id :name "ref-2"
                                                   :base_type "type/Integer" :database_type "integer"}
                   :model/Field    {fld-3 :id}    {:table_id tbl-id :name "ref-3"
                                                   :base_type "type/Integer" :database_type "integer"}]
      (let [batch [[1 {:id 91 :table_id 77 :name "ref-1"
                       :base_type "type/Integer" :database_type "integer"
                       :fk_target_field_id 81}
                    fld-1 tgt-a]
                   [2 {:id 92 :table_id 77 :name "ref-2"
                       :base_type "type/Integer" :database_type "integer"
                       :fk_target_field_id 82}
                    fld-2 tgt-b]
                   [3 {:id 93 :table_id 77 :name "ref-3"
                       :base_type "type/Integer" :database_type "integer"
                       :fk_target_field_id 81}
                    fld-3 tgt-a]]]
        (into [] (processors/process-fields-fk-finalize! batch))
        (is (= tgt-a (:fk_target_field_id (t2/select-one :model/Field :id fld-1))))
        (is (= tgt-b (:fk_target_field_id (t2/select-one :model/Field :id fld-2))))
        (is (= tgt-a (:fk_target_field_id (t2/select-one :model/Field :id fld-3))))))))

(deftest process-fields-fk-finalize-validation-failure-throws-with-attribution-test
  (testing "a malformed row (missing required key) throws ex-info with :kind :invalid_input
            and line attribution"
    (try
      (into [] (processors/process-fields-fk-finalize!
                [[42 {:id 9001 :table_id 77 :name "x"      ;; missing :base_type and :database_type
                      :fk_target_field_id 9999}
                  111 222]]))
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (let [data (ex-data e)]
          (is (= :invalid_input (:kind data)))
          (is (= 42 (:line data)))
          (is (= 9001 (:source-id data))))))))

(deftest process-fields-fk-finalize-empty-batch-test
  (testing "empty input → empty output, no SQL"
    (is (= [] (into [] (processors/process-fields-fk-finalize! []))))))

(deftest process-fields-fk-finalize-preserves-input-order-test
  (testing "results are in input order"
    (mt/with-temp [:model/Database {db-id :id}    {:name "fkfin-order-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :name "t"}
                   :model/Field    {tgt :id}      {:table_id tbl-id :name "tgt"
                                                   :base_type "type/Integer" :database_type "integer"}
                   :model/Field    {a :id}        {:table_id tbl-id :name "a"
                                                   :base_type "type/Integer" :database_type "integer"}
                   :model/Field    {b :id}        {:table_id tbl-id :name "b"
                                                   :base_type "type/Integer" :database_type "integer"}]
      (let [batch [[10 {:id 30 :table_id 77 :name "b"
                        :base_type "type/Integer" :database_type "integer"
                        :fk_target_field_id 80}
                    b tgt]
                   [11 {:id 20 :table_id 77 :name "a"
                        :base_type "type/Integer" :database_type "integer"
                        :fk_target_field_id 80}
                    a tgt]]
            results (into [] (processors/process-fields-fk-finalize! batch))]
        (is (= [30 20] (mapv :source-id results)))
        (is (= [b a]   (mapv :target-id results)))))))

;;; ============================ process-field-values ============================
;;;
;;; Signature: `(process-field-values batch resolve-field-id-fn)`. The
;;; `resolve-field-id-fn` is a Clojure-callable (function or map) that, given a
;;; source field id, returns the target field id or nil. Source rows whose
;;; field_id has no target are emitted as :no-target-field (loader logs WARN).

(deftest process-field-values-inserts-new-full-row-test
  (testing "a source row whose field_id resolves to a target with no existing 'full'
            FieldValues produces a new 'full' row in metabase_fieldvalues"
    (mt/with-temp [:model/Database {db-id :id}  {:name "fv-insert-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id db-id :name "t"}
                   :model/Field    {fld-id :id} {:table_id tbl-id :name "zip"
                                                 :base_type "type/Text" :database_type "text"}]
      (let [resolve-fn {9001 fld-id}
            batch      [[1 {:field_id 9001 :values [["94110"] ["94111"]]
                            :has_more_values false}]]
            [r]        (into [] (processors/process-field-values! batch resolve-fn))
            stored     (t2/select-one :model/FieldValues :field_id fld-id :type :full)]
        (is (= {:source-field-id 9001 :target-field-id fld-id :status :inserted} r))
        (is (some? stored))
        (is (= [["94110"] ["94111"]] (vec (:values stored))))
        (is (= false (:has_more_values stored)))))))

(deftest process-field-values-updates-existing-full-row-test
  (testing "a source row whose target Field already has a 'full' FieldValues row
            updates the existing row in place — :updated, no duplicate"
    (mt/with-temp [:model/Database {db-id :id}    {:name "fv-update-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :name "t"}
                   :model/Field    {fld-id :id}   {:table_id tbl-id :name "zip"
                                                   :base_type "type/Text" :database_type "text"}
                   :model/FieldValues {fv-id :id} {:field_id fld-id :type :full
                                                   :values ["old-1" "old-2"]
                                                   :has_more_values false}]
      (let [resolve-fn {9001 fld-id}
            batch      [[1 {:field_id 9001 :values [["new-1"] ["new-2"]]
                            :has_more_values true}]]
            [r]        (into [] (processors/process-field-values! batch resolve-fn))]
        (is (= {:source-field-id 9001 :target-field-id fld-id :status :updated} r))
        (let [stored (t2/select-one :model/FieldValues :id fv-id)]
          (is (= [["new-1"] ["new-2"]] (vec (:values stored))))
          (is (= true (:has_more_values stored))))
        (is (= 1 (count (t2/select :model/FieldValues :field_id fld-id :type :full)))
            "no duplicate row created")))))

(deftest process-field-values-deletes-advanced-types-on-insert-test
  (testing "when inserting a new 'full' FieldValues row, any pre-existing 'sandbox'
            or 'linked-filter' FieldValues for the same field are deleted in a
            bulk DELETE — mirrors :model/FieldValues' define-before-insert at
            batch granularity"
    (mt/with-temp [:model/Database {db-id :id}        {:name "fv-delete-db" :engine :postgres}
                   :model/Table    {tbl-id :id}       {:db_id db-id :name "t"}
                   :model/Field    {fld-id :id}       {:table_id tbl-id :name "zip"
                                                       :base_type "type/Text" :database_type "text"}
                   :model/FieldValues {sb-id :id}     {:field_id fld-id :type :sandbox
                                                       :values ["sandbox-1"]
                                                       :hash_key "sandbox-hash"
                                                       :has_more_values false}]
      (let [resolve-fn {9001 fld-id}
            batch      [[1 {:field_id 9001 :values [["new"]] :has_more_values false}]]]
        (into [] (processors/process-field-values! batch resolve-fn))
        (is (nil? (t2/select-one :model/FieldValues :id sb-id))
            "sandbox FieldValues row is deleted")
        (is (some? (t2/select-one :model/FieldValues :field_id fld-id :type :full))
            "the new 'full' row is inserted")))))

(deftest process-field-values-handles-human-readable-values-test
  (testing "human_readable_values is stored when present and left nil when absent"
    (mt/with-temp [:model/Database {db-id :id}    {:name "fv-hrv-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :name "t"}
                   :model/Field    {fld-id :id}   {:table_id tbl-id :name "zip"
                                                   :base_type "type/Text" :database_type "text"}]
      (let [resolve-fn {9001 fld-id}
            batch      [[1 {:field_id 9001 :values [["94110"] ["94111"]]
                            :has_more_values false
                            :human_readable_values ["Mission" "Castro"]}]]]
        (into [] (processors/process-field-values! batch resolve-fn))
        (let [stored (t2/select-one :model/FieldValues :field_id fld-id :type :full)]
          (is (= ["Mission" "Castro"] (vec (:human_readable_values stored)))))))))

(deftest process-field-values-emits-no-target-field-when-source-field-id-not-mapped-test
  (testing "if the source field_id has no target, the row is reported as
            :no-target-field with line attribution and no SQL runs for it"
    (let [resolve-fn   {9001 1234}
          [r] (into [] (processors/process-field-values!
                        [[7 {:field_id 9999 :values [["x"]] :has_more_values false}]]
                        resolve-fn))]
      (is (= 9999 (:source-field-id r)))
      (is (= :no-target-field (:status r)))
      (is (= 7 (:line r)))
      (is (string? (:detail r)))
      (is (not (contains? r :target-field-id))))))

(deftest process-field-values-validation-failure-throws-with-attribution-test
  (testing "a malformed row throws ex-info with :kind :invalid_input and attribution"
    (try
      (into [] (processors/process-field-values!
                [[42 {:field_id 9001 :values "not-a-list"   ;; values must be java.util.List
                      :has_more_values false}]]
                {9001 1234}))
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (let [data (ex-data e)]
          (is (= :invalid_input (:kind data)))
          (is (= 42 (:line data)))
          (is (= 9001 (:source-field-id data))))))))

(deftest process-field-values-preserves-input-order-test
  (testing "results are in input order regardless of which rows insert/update/miss"
    (mt/with-temp [:model/Database {db-id :id}    {:name "fv-order-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :name "t"}
                   :model/Field    {f1 :id}       {:table_id tbl-id :name "f1"
                                                   :base_type "type/Text" :database_type "text"}
                   :model/Field    {f2 :id}       {:table_id tbl-id :name "f2"
                                                   :base_type "type/Text" :database_type "text"}
                   :model/FieldValues _           {:field_id f2 :type :full
                                                   :values ["old"] :has_more_values false}]
      (let [resolve-fn {91 f1, 92 f2}
            results (into [] (processors/process-field-values!
                              [[1 {:field_id 91  :values [["x"]] :has_more_values false}]
                               [2 {:field_id 999 :values [["y"]] :has_more_values false}]
                               [3 {:field_id 92  :values [["z"]] :has_more_values false}]]
                              resolve-fn))]
        (is (= [91 999 92]                                   (mapv :source-field-id results)))
        (is (= [:inserted :no-target-field :updated]         (mapv :status results)))))))

(deftest process-field-values-empty-batch-test
  (testing "empty input → empty output, no SQL"
    (is (= [] (into [] (processors/process-field-values! [] {}))))))
