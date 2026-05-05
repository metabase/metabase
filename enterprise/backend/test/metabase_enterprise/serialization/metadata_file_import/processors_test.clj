(ns ^:parallel metabase-enterprise.serialization.metadata-file-import.processors-test
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
   [toucan2.core :as t2]))

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
            human-readable detail string. Phase 1 is non-fatal — the loader logs and
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
    (try
      (into [] (processors/process-databases!
                [[42 {:name "missing-engine"}]]))   ;; no :engine
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (let [data (ex-data e)]
          (is (= :invalid_input (:kind data)))
          (is (= 42 (:line data)))
          (is (= "missing-engine" (:source-id data))))))))

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

;;; ============================== process-tables ==============================

(deftest process-tables-matches-by-db-schema-name-test
  (testing "a source row matching an existing target Table by (target-db-id, schema, name)
            produces a :matched result with the existing row's id. :source-id carries the
            portable table id [db-name schema name]."
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-match-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema "public" :name "orders"}]
      (is (= [{:source-id ["tbl-match-db" "public" "orders"] :target-id tbl-id :status :matched}]
             (into [] (processors/process-tables!
                       [[1 {:db_id "tbl-match-db" :schema "public" :name "orders"}]])))))))

(deftest process-tables-inserts-unmatched-test
  (testing "a source row with no existing target Table is bulk-inserted; the result
            carries :status :inserted and the new row exists in the appdb"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-insert-db" :engine :postgres}]
      (let [[r]      (into [] (processors/process-tables!
                               [[1 {:db_id "tbl-insert-db" :schema "public" :name "fresh-table"}]]))
            inserted (t2/select-one :model/Table :id (:target-id r))]
        (is (= ["tbl-insert-db" "public" "fresh-table"] (:source-id r)))
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
      (into [] (processors/process-tables!
                [[1 {:db_id "tbl-patch-db" :schema "public" :name "orders"
                     :description "new description"}]]))
      (is (= "new description"
             (:description (t2/select-one :model/Table :id tbl-id)))))))

(deftest process-tables-leaves-target-description-untouched-when-source-has-none-test
  (testing "patch-on-match policy: when the source row has no description, the target
            row's existing description is left intact (no UPDATE issued)"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-no-patch-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema "public" :name "orders"
                                              :description "preserved"}]
      (into [] (processors/process-tables!
                [[1 {:db_id "tbl-no-patch-db" :schema "public" :name "orders"}]]))
      (is (= "preserved"
             (:description (t2/select-one :model/Table :id tbl-id)))))))

(deftest process-tables-emits-no-target-db-when-source-db-id-does-not-resolve-test
  (testing "if the source row's :db_id (db name) doesn't resolve to a target Database,
            the row is reported as :no-target-db and no further SQL runs for it. The
            loader logs WARN and skips dependent fields."
    (let [[r] (into [] (processors/process-tables!
                        [[5 {:db_id "no-such-db-zzz" :schema "public" :name "orders"}]]))]
      (is (= ["no-such-db-zzz" "public" "orders"] (:source-id r)))
      (is (= :no-target-db (:status r)))
      (is (= 5 (:line r)))
      (is (string? (:detail r)))
      (is (not (contains? r :target-id))))))

(deftest process-tables-handles-nil-schema-test
  (testing "schema is optional; a source row with no :schema matches a target Table
            whose schema column is NULL"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-nil-schema-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema nil :name "no-schema-tbl"}]
      (let [[r] (into [] (processors/process-tables!
                          [[1 {:db_id "tbl-nil-schema-db" :name "no-schema-tbl"}]]))]
        (is (= :matched (:status r)))
        (is (= tbl-id (:target-id r)))))))

(deftest process-tables-insert-applies-required-defaults-test
  (testing "newly-inserted tables carry the defaults the import flow requires:
            display_name (humanized from name), active=true, initial_sync_status=complete,
            data_layer=internal — these would normally come from :model/Table's insert hooks
            but we bypass those (see comment at the call site about set-new-table-permissions!
            and Postgres lock exhaustion)"
    (mt/with-temp [:model/Database {_ :id} {:name "tbl-defaults-db" :engine :postgres}]
      (let [[r] (into [] (processors/process-tables!
                          [[1 {:db_id "tbl-defaults-db" :schema "public" :name "user_profiles"}]]))
            row (t2/select-one :model/Table :id (:target-id r))]
        (is (= true                (:active row)))
        (is (= "complete"          (:initial_sync_status row)))
        (is (= :internal           (:data_layer row))
            "data_layer is read back as a keyword via :model/Table's hooks")
        (is (= "User Profiles"     (:display_name row))
            "display_name is humanized from the source name")))))

(deftest process-tables-validation-failure-throws-with-attribution-test
  (testing "a malformed row throws ex-info with :kind :invalid_input, the line number,
            and the row's portable source id"
    (mt/with-temp [:model/Database {_ :id} {:name "tbl-validate-db" :engine :postgres}]
      (try
        (into [] (processors/process-tables!
                  [[42 {:db_id "tbl-validate-db" :schema "public"}]]))   ;; missing :name
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (= :invalid_input (:kind data)))
            (is (= 42 (:line data)))
            (is (= ["tbl-validate-db" "public" nil] (:source-id data))
                "portable source id derived from (:db_id :schema :name) — :name is nil since it's missing")))))))

(deftest process-tables-preserves-input-order-test
  (testing "results are in input order regardless of internal SELECT/INSERT ordering or
            which rows match vs insert vs miss"
    (mt/with-temp [:model/Database {db-id :id} {:name "tbl-order-db" :engine :postgres}
                   :model/Table {existing :id} {:db_id db-id :schema "public" :name "existing"}]
      (let [results (into [] (processors/process-tables!
                              [[1 {:db_id "tbl-order-db" :schema "public" :name "existing"}]
                               [2 {:db_id "no-such-db-zzz" :schema "public" :name "no-target-db-row"}]
                               [3 {:db_id "tbl-order-db" :schema "public" :name "fresh-1"}]]))]
        (is (= [["tbl-order-db" "public" "existing"]
                ["no-such-db-zzz" "public" "no-target-db-row"]
                ["tbl-order-db" "public" "fresh-1"]]            (mapv :source-id results)))
        (is (= [:matched :no-target-db :inserted]               (mapv :status results)))
        (is (= existing                                         (:target-id (nth results 0))))
        (is (= nil                                              (:target-id (nth results 1))))
        (is (some?                                              (:target-id (nth results 2))))))))

(deftest process-tables-empty-batch-test
  (testing "empty input → empty output"
    (is (= [] (into [] (processors/process-tables! []))))))

;;; ======================== process-fields! ========================
;;;
;;; Tuple shape: `[ln row]`. Bare batches — the processor self-resolves portable
;;; `:table_id` and `:parent_id` references via batched natural-key SELECTs and
;;; inserts placeholder stubs for missing parents per §11c.

(deftest process-fields-inserts-root-field-test
  (testing "a root field (no :parent_id) is inserted with parent_id=NULL,
            is_defective_duplicate=FALSE, fk_target_field_id=NULL"
    (mt/with-temp [:model/Database {db-id :id} {:name "fld-root-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema "public" :name "users"}]
      (let [batch  [[1 {:id ["fld-root-db" "public" "users" "zip"]
                        :table_id ["fld-root-db" "public" "users"]
                        :name "zip"
                        :base_type "type/Text"
                        :database_type "text"}]]
            [r]    (into [] (processors/process-fields! batch))
            row    (t2/select-one :model/Field :id (:target-id r))]
        (is (= ["fld-root-db" "public" "users" "zip"] (:source-id r)))
        (is (= :inserted (:status r)))
        (is (= tbl-id (:table_id row)))
        (is (= "zip" (:name row)))
        (is (nil? (:parent_id row)))
        (is (nil? (:fk_target_field_id row))
            "fk_target_field_id stays NULL during phase 3; phase 4 fills it in")
        (is (= false
               (:is_defective_duplicate
                (first (t2/query ["SELECT is_defective_duplicate FROM metabase_field WHERE id = ?"
                                  (:target-id r)]))))
            "phase 3 must insert with is_defective_duplicate=FALSE")))))

(deftest process-fields-inserts-nested-field-test
  (testing "a nested field with :parent_id pointing at an existing parent inserts
            with parent_id = the resolved target id; nfc_path stores the parent
            ancestry"
    (mt/with-temp [:model/Database {db-id :id} {:name "fld-nested-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema "public" :name "events"}
                   :model/Field {parent-id :id} {:table_id tbl-id :name "address"
                                                 :base_type "type/Structured"}]
      (let [batch [[1 {:id ["fld-nested-db" "public" "events" "address" "zip"]
                       :table_id ["fld-nested-db" "public" "events"]
                       :name "zip"
                       :parent_id ["fld-nested-db" "public" "events" "address"]
                       :nfc_path ["address"]
                       :base_type "type/Text"
                       :database_type "text"}]]
            [r]   (into [] (processors/process-fields! batch))
            row   (t2/select-one :model/Field :id (:target-id r))]
        (is (= :inserted (:status r)))
        (is (= parent-id (:parent_id row))
            "parent_id resolves to the existing parent's int id via natural-key SELECT")
        (is (= ["address"] (json/decode (:nfc_path
                                         (first (t2/query ["SELECT nfc_path FROM metabase_field WHERE id = ?"
                                                           (:target-id r)])))))
            "nfc_path stores the parent ancestry chain (just [\"address\"] for a depth-1 nesting)")))))

(deftest process-fields-matches-existing-root-test
  (testing "a source root field whose (target-table-id, name, parent_id=NULL) triple
            already exists produces :matched with the existing id; no insert"
    (mt/with-temp [:model/Database {db-id :id}       {:name "fld-mr-db" :engine :postgres}
                   :model/Table    {tbl-id :id}      {:db_id db-id :schema "public" :name "t"}
                   :model/Field    {existing-id :id} {:table_id tbl-id :name "zip"
                                                      :base_type "type/Text"}]
      (let [batch [[1 {:id ["fld-mr-db" "public" "t" "zip"]
                       :table_id ["fld-mr-db" "public" "t"]
                       :name "zip"
                       :base_type "type/Text"}]]
            [r]   (into [] (processors/process-fields! batch))]
        (is (= :matched (:status r)))
        (is (= existing-id (:target-id r)))))))

(deftest process-fields-matches-existing-nested-test
  (testing "a source nested field whose (target-table-id, name, target-parent-id)
            triple already exists produces :matched with the existing id"
    (mt/with-temp [:model/Database {db-id :id}       {:name "fld-mn-db" :engine :postgres}
                   :model/Table    {tbl-id :id}      {:db_id db-id :schema "public" :name "t"}
                   :model/Field    {parent-id :id}   {:table_id tbl-id :name "address"
                                                      :base_type "type/Structured"}
                   :model/Field    {existing-id :id} {:table_id tbl-id :name "zip"
                                                      :parent_id parent-id
                                                      :nfc_path (json/encode ["address"])
                                                      :base_type "type/Text"}]
      (let [batch [[1 {:id ["fld-mn-db" "public" "t" "address" "zip"]
                       :table_id ["fld-mn-db" "public" "t"]
                       :name "zip"
                       :parent_id ["fld-mn-db" "public" "t" "address"]
                       :nfc_path ["address"]
                       :base_type "type/Text"}]]
            [r]   (into [] (processors/process-fields! batch))]
        (is (= :matched (:status r)))
        (is (= existing-id (:target-id r)))))))

(deftest process-fields-clobbers-metadata-on-match-test
  (testing "clobber-on-match (§11b): when the row matches an existing target, the
            full metadata payload (description, semantic_type, effective_type,
            coercion_strategy, base_type, database_type, plus active=true) is
            written. parent_id and fk_target_field_id are not touched."
    (mt/with-temp [:model/Database {db-id :id} {:name "fld-clobber-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id db-id :schema "public" :name "t"}
                   :model/Field    {fld-id :id} {:table_id tbl-id :name "zip"
                                                 :base_type "type/Text"
                                                 :description "old"
                                                 :semantic_type "type/Quantity"}]
      (into [] (processors/process-fields!
                [[1 {:id ["fld-clobber-db" "public" "t" "zip"]
                     :table_id ["fld-clobber-db" "public" "t"]
                     :name "zip"
                     :base_type "type/Text"
                     :description "new desc"
                     :semantic_type "type/ZipCode"
                     :effective_type "type/Text"
                     :coercion_strategy "Coercion/String->Float"}]]))
      (let [row (t2/select-one :model/Field :id fld-id)]
        (is (= "new desc"              (:description row)))
        (is (= :type/ZipCode           (:semantic_type row)))
        (is (= :type/Text              (:effective_type row)))
        (is (= :Coercion/String->Float (:coercion_strategy row)))
        (is (= true                    (:active row)))))))

(deftest process-fields-clobber-skips-cols-source-omits-test
  (testing "when the source row omits an optional metadata key, that column on the
            matched target is preserved (clobber writes only what the source supplies,
            never NULL-blasts existing values)"
    (mt/with-temp [:model/Database {db-id :id}  {:name "fld-no-patch-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id db-id :schema "public" :name "t"}
                   :model/Field    {fld-id :id} {:table_id tbl-id :name "zip"
                                                 :base_type "type/Text"
                                                 :description "preserved"
                                                 :semantic_type "type/ZipCode"}]
      (into [] (processors/process-fields!
                [[1 {:id ["fld-no-patch-db" "public" "t" "zip"]
                     :table_id ["fld-no-patch-db" "public" "t"]
                     :name "zip"
                     :base_type "type/Text"}]]))
      (let [row (t2/select-one :model/Field :id fld-id)]
        (is (= "preserved"   (:description row)))
        (is (= :type/ZipCode (:semantic_type row)))))))

(deftest process-fields-emits-no-target-table-when-table-id-doesnt-resolve-test
  (testing "if the source row's :table_id portable triple doesn't match any target,
            the row is reported as :no-target-table and no SQL runs for it"
    (let [[r] (into [] (processors/process-fields!
                        [[5 {:id ["no-such-db-zzz" "public" "orders" "zip"]
                             :table_id ["no-such-db-zzz" "public" "orders"]
                             :name "zip"
                             :base_type "type/Text"}]]))]
      (is (= ["no-such-db-zzz" "public" "orders" "zip"] (:source-id r)))
      (is (= :no-target-table (:status r)))
      (is (= 5 (:line r)))
      (is (string? (:detail r)))
      (is (not (contains? r :target-id))))))

(deftest process-fields-validation-failure-throws-with-attribution-test
  (testing "a malformed field row (missing required :base_type) throws ex-info
            with :kind :invalid_input, the line number, and the row's portable id"
    (mt/with-temp [:model/Database {db-id :id}  {:name "fld-validate-db" :engine :postgres}
                   :model/Table    {_ :id}      {:db_id db-id :schema "public" :name "t"}]
      (try
        (into [] (processors/process-fields!
                  [[42 {:id ["fld-validate-db" "public" "t" "zip"]
                        :table_id ["fld-validate-db" "public" "t"]
                        :name "zip"}]]))   ;; missing :base_type
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (= :invalid_input (:kind data)))
            (is (= 42 (:line data)))
            (is (= ["fld-validate-db" "public" "t" "zip"] (:source-id data)))))))))

(deftest process-fields-preserves-input-order-test
  (testing "results are in input order regardless of which rows match, insert, or miss"
    (mt/with-temp [:model/Database {db-id :id}    {:name "fld-order-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :schema "public" :name "t"}
                   :model/Field    {existing :id} {:table_id tbl-id :name "existing"
                                                   :base_type "type/Text"}]
      (let [results (into [] (processors/process-fields!
                              [[1 {:id ["fld-order-db" "public" "t" "existing"]
                                   :table_id ["fld-order-db" "public" "t"]
                                   :name "existing"
                                   :base_type "type/Text" :database_type "text"}]
                               [2 {:id ["no-such-db-zzz" "public" "t" "no-tbl"]
                                   :table_id ["no-such-db-zzz" "public" "t"]
                                   :name "no-tbl"
                                   :base_type "type/Text" :database_type "text"}]
                               [3 {:id ["fld-order-db" "public" "t" "fresh-1"]
                                   :table_id ["fld-order-db" "public" "t"]
                                   :name "fresh-1"
                                   :base_type "type/Text" :database_type "text"}]]))]
        (is (= [["fld-order-db" "public" "t" "existing"]
                ["no-such-db-zzz" "public" "t" "no-tbl"]
                ["fld-order-db" "public" "t" "fresh-1"]]      (mapv :source-id results)))
        (is (= [:matched :no-target-table :inserted]          (mapv :status results)))
        (is (= existing                                       (:target-id (nth results 0))))))))

(deftest process-fields-empty-batch-test
  (testing "empty input → empty output"
    (is (= [] (into [] (processors/process-fields! []))))))

;;; ---------- stub-path tests (§11c) ----------

(deftest process-fields-stub-row?-predicate-test
  (testing "stub-row? identifies rows by the :database_type sentinel \"__stub__\""
    (is (true?  (processors/stub-row? {:database_type "__stub__"})))
    (is (false? (processors/stub-row? {:database_type "text"})))
    (is (false? (processors/stub-row? {})))
    (is (true?  (processors/stub-row? {:database_type "__stub__" :base_type :type/*}))
        ":base_type is keywordized by :model/Field's reader; stub-row? doesn't depend on it")))

(deftest process-fields-stubs-orphan-parent-test
  (testing "a child whose :parent_id points at a parent NOT in the file (and not yet
            in target appdb) results in a placeholder stub row for the parent —
            active=false, base_type=type/*, database_type=__stub__, nfc_path=NULL"
    (mt/with-temp [:model/Database {db-id :id}  {:name "fld-orph-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id db-id :schema "public" :name "t"}]
      (let [batch [[1 {:id ["fld-orph-db" "public" "t" "orphan-parent" "zip"]
                       :table_id ["fld-orph-db" "public" "t"]
                       :name "zip"
                       :parent_id ["fld-orph-db" "public" "t" "orphan-parent"]
                       :nfc_path ["orphan-parent"]
                       :base_type "type/Text"
                       :database_type "text"}]]
            [r]   (into [] (processors/process-fields! batch))
            child-row  (t2/select-one :model/Field :id (:target-id r))
            parent-row (t2/select-one :model/Field :table_id tbl-id :name "orphan-parent")]
        (is (= :inserted (:status r)))
        (is (some? parent-row) "parent stub was created")
        (is (processors/stub-row? parent-row) "parent row is identified as a stub")
        (is (= false (:active parent-row)) "stub is inactive")
        (is (nil? (:parent_id parent-row)) "stub for depth-1 missing parent has parent_id=NULL")
        (is (= (:id parent-row) (:parent_id child-row))
            "child's parent_id points at the freshly-inserted stub")))))

(deftest process-fields-stubs-then-real-row-clobbers-stub-in-same-batch-test
  (testing "a batch containing a child BEFORE its parent — child stubs the parent,
            then when the parent's real row is processed in the same batch, the
            stub is matched and clobbered to active=true with the real metadata.
            Same int id throughout — the child's :parent_id stays valid."
    (mt/with-temp [:model/Database {db-id :id}  {:name "fld-stub-fill-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id db-id :schema "public" :name "t"}]
      ;; child row first, parent second — child stubs the parent on its way through
      (let [batch [[1 {:id ["fld-stub-fill-db" "public" "t" "address" "zip"]
                       :table_id ["fld-stub-fill-db" "public" "t"]
                       :name "zip"
                       :parent_id ["fld-stub-fill-db" "public" "t" "address"]
                       :nfc_path ["address"]
                       :base_type "type/Text"
                       :database_type "text"}]
                   [2 {:id ["fld-stub-fill-db" "public" "t" "address"]
                       :table_id ["fld-stub-fill-db" "public" "t"]
                       :name "address"
                       :base_type "type/Structured"
                       :database_type "json"
                       :description "real description"}]]
            results (into [] (processors/process-fields! batch))
            parent-row (t2/select-one :model/Field :table_id tbl-id :name "address")]
        (is (= [:inserted :matched] (mapv :status results))
            "child got inserted; parent's real row matched the stub child created")
        (is (false? (processors/stub-row? parent-row))
            "after clobber, the parent is no longer marked as a stub")
        (is (= true (:active parent-row))     "clobber flipped active=false to true")
        (is (= :type/Structured (:base_type parent-row)) "base_type clobbered from type/* to real")
        (is (= "json"          (:database_type parent-row)) "database_type clobbered from __stub__ to real")
        (is (= "real description" (:description parent-row)))))))

(deftest process-fields-stubs-three-deep-when-grandparent-missing-test
  (testing "a child references a depth-3 parent path; both grandparent and parent
            are missing in target → both get stubbed, grandparent first then parent"
    (mt/with-temp [:model/Database {db-id :id}  {:name "fld-3deep-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id db-id :schema "public" :name "t"}]
      (let [batch [[1 {:id ["fld-3deep-db" "public" "t" "outer" "inner" "zip"]
                       :table_id ["fld-3deep-db" "public" "t"]
                       :name "zip"
                       :parent_id ["fld-3deep-db" "public" "t" "outer" "inner"]
                       :nfc_path ["outer" "inner"]
                       :base_type "type/Text"
                       :database_type "text"}]]
            [r]   (into [] (processors/process-fields! batch))
            grandparent (t2/select-one :model/Field :table_id tbl-id :name "outer")
            parent      (t2/select-one :model/Field :table_id tbl-id :name "inner")
            child       (t2/select-one :model/Field :id (:target-id r))]
        (is (= :inserted (:status r)))
        (is (some? grandparent) "depth-1 stub for grandparent was created")
        (is (some? parent)      "depth-2 stub for parent was created")
        (is (processors/stub-row? grandparent))
        (is (processors/stub-row? parent))
        (is (nil? (:parent_id grandparent)) "grandparent stub has parent_id=NULL (root)")
        (is (= (:id grandparent) (:parent_id parent))
            "parent stub's parent_id points at the grandparent stub")
        (is (= (:id parent) (:parent_id child))
            "child's parent_id points at the parent stub")))))

(deftest process-fields-clobbers-pre-existing-stub-on-real-row-arrival-test
  (testing "if target appdb starts with a stub from a prior import (or batch), the
            real row's match query (no :active=true scope, §7) finds the stub,
            and clobber flips it to active=true with real metadata"
    (mt/with-temp [:model/Database {db-id :id}  {:name "fld-prior-stub-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id db-id :schema "public" :name "t"}
                   :model/Field    {stub-id :id} {:table_id tbl-id :name "address"
                                                  :base_type "type/*"
                                                  :database_type "__stub__"
                                                  :active false}]
      (let [batch [[1 {:id ["fld-prior-stub-db" "public" "t" "address"]
                       :table_id ["fld-prior-stub-db" "public" "t"]
                       :name "address"
                       :base_type "type/Structured"
                       :database_type "json"}]]
            [r]   (into [] (processors/process-fields! batch))
            row   (t2/select-one :model/Field :id stub-id)]
        (is (= :matched (:status r))           "match found the inactive stub")
        (is (= stub-id (:target-id r))         "same int id — no insert, just clobber")
        (is (= true (:active row))             "stub flipped to active=true")
        (is (= :type/Structured (:base_type row)) "base_type clobbered to real")
        (is (= "json" (:database_type row))    "database_type clobbered from __stub__ to real")))))

;;; ---------- Convention B (JSON-unfolded leaves) ----------

(deftest process-fields-convention-b-inserts-flat-leaf-with-nfc-path-test
  (testing "Convention B leaf: wire row has :nfc_path but no :parent_id. Inserts
            with parent_id=NULL and stores nfc_path verbatim. NO stubs created."
    (mt/with-temp [:model/Database {db-id :id} {:name "fld-conv-b-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema "public" :name "events"}]
      (let [batch [[1 {:id ["fld-conv-b-db" "public" "events" "payload" "address" "zip"]
                       :table_id ["fld-conv-b-db" "public" "events"]
                       :name "payload → address → zip"
                       :nfc_path ["payload" "address" "zip"]
                       :base_type "type/Text"
                       :database_type "text"}]]
            [r]   (into [] (processors/process-fields! batch))
            row   (t2/select-one :model/Field :id (:target-id r))]
        (is (= :inserted (:status r)))
        (is (= "payload → address → zip" (:name row)))
        (is (nil? (:parent_id row))
            "parent_id stays NULL — Convention B leaves have no parent row")
        (is (= ["payload" "address" "zip"]
               (json/decode (:nfc_path
                             (first (t2/query
                                     ["SELECT nfc_path FROM metabase_field WHERE id = ?"
                                      (:target-id r)])))))
            "nfc_path is stored verbatim from the wire — preserves QP's JSON-path navigation")
        (is (zero? (count (t2/query
                           [(str "SELECT id FROM metabase_field WHERE database_type = '__stub__' "
                                 "AND table_id = ?")
                            tbl-id])))
            "no stubs were created — Convention B doesn't trigger ensure-ancestors!")))))

(deftest process-fields-convention-b-idempotent-test
  (testing "Re-importing a Convention B leaf matches the existing row by
            (table_id, name, parent_id=NULL); no duplicate, no new stubs."
    (mt/with-temp [:model/Database {db-id :id} {:name "fld-conv-b-idem-db" :engine :postgres}
                   :model/Table {tbl-id :id} {:db_id db-id :schema "public" :name "events"}]
      (let [batch [[1 {:id ["fld-conv-b-idem-db" "public" "events" "payload" "address" "zip"]
                       :table_id ["fld-conv-b-idem-db" "public" "events"]
                       :name "payload → address → zip"
                       :nfc_path ["payload" "address" "zip"]
                       :base_type "type/Text"
                       :database_type "text"}]]
            [r1] (into [] (processors/process-fields! batch))
            [r2] (into [] (processors/process-fields! batch))]
        (is (= :inserted (:status r1)))
        (is (= :matched (:status r2))
            "second pass matches the existing Convention B leaf")
        (is (= (:target-id r1) (:target-id r2))
            "same int id — no duplicate row inserted")
        (is (= 1 (t2/count :model/Field :table_id tbl-id))
            "exactly one Field row exists, no stubs")))))

;;; ======================== process-fields-fk-resolve! ========================
;;;
;;; Tuple shape: `[ln row]`. Bare batches — the processor self-resolves both
;;; the row's own portable id and its `:fk_target_field_id` portable id via
;;; one batched natural-key SELECT, then issues a single VALUES-table UPDATE.

(deftest process-fields-fk-resolve-writes-fk-target-field-id-test
  (testing "happy path: the target row's fk_target_field_id is updated to the
            resolved fk-target id (looked up by portable field id)"
    (mt/with-temp [:model/Database {db-id :id}  {:name "fkfin-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id db-id :schema "public" :name "t"}
                   :model/Field    {tgt-fk :id} {:table_id tbl-id :name "fk-target"
                                                 :base_type "type/Integer"
                                                 :database_type "integer"}
                   :model/Field    {fld-id :id} {:table_id tbl-id :name "ref-field"
                                                 :base_type "type/Integer"
                                                 :database_type "integer"}]
      (let [batch [[1 {:id ["fkfin-db" "public" "t" "ref-field"]
                       :table_id ["fkfin-db" "public" "t"]
                       :name "ref-field"
                       :base_type "type/Integer" :database_type "integer"
                       :fk_target_field_id ["fkfin-db" "public" "t" "fk-target"]}]]
            [r]   (into [] (processors/process-fields-fk-resolve! batch))]
        (is (= {:source-id ["fkfin-db" "public" "t" "ref-field"]
                :target-id fld-id :status :updated}
               r))
        (is (= tgt-fk
               (:fk_target_field_id (t2/select-one :model/Field :id fld-id))))))))

(deftest process-fields-fk-resolve-only-touches-fk-target-field-id-column-test
  (testing "phase 4 writes ONLY fk_target_field_id — not parent_id, not metadata.
            Phase 3 sets the right values once and trusts them through phase 4."
    (mt/with-temp [:model/Database {db-id :id}    {:name "fkfin-touch-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :schema "public" :name "t"}
                   :model/Field    {parent-id :id} {:table_id tbl-id :name "parent"
                                                    :base_type "type/Structured"
                                                    :database_type "json"}
                   :model/Field    {tgt-fk :id}   {:table_id tbl-id :name "fk-target"
                                                   :base_type "type/Integer"
                                                   :database_type "integer"}
                   :model/Field    {fld-id :id}   {:table_id tbl-id :name "child"
                                                   :parent_id parent-id
                                                   :nfc_path (json/encode ["parent"])
                                                   :base_type "type/Text"
                                                   :database_type "text"
                                                   :description "untouched"
                                                   :semantic_type "type/ZipCode"}]
      (let [batch [[1 {:id ["fkfin-touch-db" "public" "t" "parent" "child"]
                       :table_id ["fkfin-touch-db" "public" "t"]
                       :name "child"
                       :parent_id ["fkfin-touch-db" "public" "t" "parent"]
                       :nfc_path ["parent"]
                       :base_type "type/Text" :database_type "text"
                       :fk_target_field_id ["fkfin-touch-db" "public" "t" "fk-target"]}]]]
        (into [] (processors/process-fields-fk-resolve! batch))
        (let [row (t2/select-one :model/Field :id fld-id)]
          (is (= tgt-fk            (:fk_target_field_id row)) "fk_target_field_id is set")
          (is (= parent-id         (:parent_id row))          "parent_id is preserved")
          (is (= "untouched"       (:description row))        "description is preserved")
          (is (= :type/ZipCode     (:semantic_type row))      "semantic_type is preserved")
          (is (= "text"            (:database_type row))      "database_type is preserved"))))))

(deftest process-fields-fk-resolve-batched-update-affects-all-rows-test
  (testing "a multi-row batch results in every row's fk_target_field_id being set
            in a single batched UPDATE via the VALUES-table pattern"
    (mt/with-temp [:model/Database {db-id :id}    {:name "fkfin-batch-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :schema "public" :name "t"}
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
      (let [batch [[1 {:id ["fkfin-batch-db" "public" "t" "ref-1"]
                       :table_id ["fkfin-batch-db" "public" "t"] :name "ref-1"
                       :base_type "type/Integer" :database_type "integer"
                       :fk_target_field_id ["fkfin-batch-db" "public" "t" "tgt-a"]}]
                   [2 {:id ["fkfin-batch-db" "public" "t" "ref-2"]
                       :table_id ["fkfin-batch-db" "public" "t"] :name "ref-2"
                       :base_type "type/Integer" :database_type "integer"
                       :fk_target_field_id ["fkfin-batch-db" "public" "t" "tgt-b"]}]
                   [3 {:id ["fkfin-batch-db" "public" "t" "ref-3"]
                       :table_id ["fkfin-batch-db" "public" "t"] :name "ref-3"
                       :base_type "type/Integer" :database_type "integer"
                       :fk_target_field_id ["fkfin-batch-db" "public" "t" "tgt-a"]}]]]
        (into [] (processors/process-fields-fk-resolve! batch))
        (is (= tgt-a (:fk_target_field_id (t2/select-one :model/Field :id fld-1))))
        (is (= tgt-b (:fk_target_field_id (t2/select-one :model/Field :id fld-2))))
        (is (= tgt-a (:fk_target_field_id (t2/select-one :model/Field :id fld-3))))))))

(deftest process-fields-fk-resolve-validation-failure-throws-with-attribution-test
  (testing "a malformed row (missing required key) throws ex-info with :kind :invalid_input
            and the row's portable field id"
    (try
      (into [] (processors/process-fields-fk-resolve!
                [[42 {:id ["fkfin-db" "public" "t" "x"]
                      :table_id ["fkfin-db" "public" "t"]
                      :name "x"      ;; missing :base_type
                      :fk_target_field_id ["fkfin-db" "public" "t" "y"]}]]))
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (let [data (ex-data e)]
          (is (= :invalid_input (:kind data)))
          (is (= 42 (:line data)))
          (is (= ["fkfin-db" "public" "t" "x"] (:source-id data))))))))

(deftest process-fields-fk-resolve-empty-batch-test
  (testing "empty input → empty output, no SQL"
    (is (= [] (into [] (processors/process-fields-fk-resolve! []))))))

(deftest process-fields-fk-resolve-passes-through-rows-without-fk-target-test
  (testing "rows without :fk_target_field_id are passed through with :status :no-fk —
            no SQL is run for them. The phase 4 batch typically arrives pre-filtered
            by the loader, but the processor handles unfiltered batches defensively."
    (mt/with-temp [:model/Database {db-id :id}  {:name "fkfin-no-fk-db" :engine :postgres}
                   :model/Table    {tbl-id :id} {:db_id db-id :schema "public" :name "t"}
                   :model/Field    {fld-id :id} {:table_id tbl-id :name "no-fk-here"
                                                 :base_type "type/Text" :database_type "text"}]
      (let [results (into [] (processors/process-fields-fk-resolve!
                              [[1 {:id ["fkfin-no-fk-db" "public" "t" "no-fk-here"]
                                   :table_id ["fkfin-no-fk-db" "public" "t"]
                                   :name "no-fk-here"
                                   :base_type "type/Text" :database_type "text"}]]))]
        (is (= [{:source-id ["fkfin-no-fk-db" "public" "t" "no-fk-here"]
                 :status :no-fk}]
               results))
        (is (nil? (:fk_target_field_id (t2/select-one :model/Field :id fld-id)))
            "no UPDATE was issued — column stays NULL")))))

(deftest process-fields-fk-resolve-preserves-input-order-test
  (testing "results are in input order"
    (mt/with-temp [:model/Database {db-id :id}    {:name "fkfin-order-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :schema "public" :name "t"}
                   :model/Field    {tgt :id}      {:table_id tbl-id :name "tgt"
                                                   :base_type "type/Integer" :database_type "integer"}
                   :model/Field    {a :id}        {:table_id tbl-id :name "a"
                                                   :base_type "type/Integer" :database_type "integer"}
                   :model/Field    {b :id}        {:table_id tbl-id :name "b"
                                                   :base_type "type/Integer" :database_type "integer"}]
      (let [batch [[10 {:id ["fkfin-order-db" "public" "t" "b"]
                        :table_id ["fkfin-order-db" "public" "t"] :name "b"
                        :base_type "type/Integer" :database_type "integer"
                        :fk_target_field_id ["fkfin-order-db" "public" "t" "tgt"]}]
                   [11 {:id ["fkfin-order-db" "public" "t" "a"]
                        :table_id ["fkfin-order-db" "public" "t"] :name "a"
                        :base_type "type/Integer" :database_type "integer"
                        :fk_target_field_id ["fkfin-order-db" "public" "t" "tgt"]}]]
            results (into [] (processors/process-fields-fk-resolve! batch))]
        (is (= [["fkfin-order-db" "public" "t" "b"]
                ["fkfin-order-db" "public" "t" "a"]]   (mapv :source-id results)))
        (is (= [b a]                                   (mapv :target-id results)))))))

(deftest process-fields-fk-resolve-fk-target-is-convention-b-leaf-test
  (testing "phase 4 resolves FK targets that are Convention B leaves. Wire :fk_target_field_id
            of shape [db schema table & nfc-path] (no leaf appended) refers to a storage row
            with name=arrow-joined, nfc_path=full-path-incl-leaf, parent_id=NULL. The phase-4
            resolver must locate that storage row and write its int id into the source row's
            fk_target_field_id column."
    (mt/with-temp [:model/Database {db-id :id}    {:name "fkfin-cb-tgt-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :schema "public" :name "events"}
                   ;; Convention B leaf storage row: full path in nfc_path, name is the
                   ;; synthesized arrow-joined display label, parent_id is NULL.
                   :model/Field    {cb-leaf :id}  {:table_id tbl-id
                                                   :name "payload → address → zip"
                                                   :nfc_path (json/encode ["payload" "address" "zip"])
                                                   :parent_id nil
                                                   :base_type "type/Text"
                                                   :database_type "text"}
                   ;; Plain flat field that points at the Conv B leaf as its FK target.
                   :model/Field    {ref-id :id}   {:table_id tbl-id :name "ref-zip"
                                                   :base_type "type/Text"
                                                   :database_type "text"}]
      (let [batch [[1 {:id ["fkfin-cb-tgt-db" "public" "events" "ref-zip"]
                       :table_id ["fkfin-cb-tgt-db" "public" "events"]
                       :name "ref-zip"
                       :base_type "type/Text" :database_type "text"
                       ;; Convention B leaf wire id: no leaf appended past the nfc-path.
                       :fk_target_field_id ["fkfin-cb-tgt-db" "public" "events"
                                            "payload" "address" "zip"]}]]
            [r]   (into [] (processors/process-fields-fk-resolve! batch))]
        (is (= {:source-id ["fkfin-cb-tgt-db" "public" "events" "ref-zip"]
                :target-id ref-id :status :updated}
               r))
        (is (= cb-leaf
               (:fk_target_field_id (t2/select-one :model/Field :id ref-id)))
            "fk_target_field_id resolves to the Conv B leaf's int id")))))

(deftest process-fields-fk-resolve-fk-source-is-convention-b-leaf-test
  (testing "phase 4 resolves a row whose own portable id is a Convention B leaf and
            whose :fk_target_field_id points at a flat field. The resolver must locate
            the Conv B leaf storage row by its [db schema table & nfc-path] wire id and
            UPDATE its fk_target_field_id column."
    (mt/with-temp [:model/Database {db-id :id}    {:name "fkfin-cb-src-db" :engine :postgres}
                   :model/Table    {tbl-id :id}   {:db_id db-id :schema "public" :name "events"}
                   ;; Convention B leaf storage row that itself has an FK.
                   :model/Field    {cb-leaf :id}  {:table_id tbl-id
                                                   :name "payload → user → zip"
                                                   :nfc_path (json/encode ["payload" "user" "zip"])
                                                   :parent_id nil
                                                   :base_type "type/Text"
                                                   :database_type "text"}
                   ;; Flat field this Conv B leaf will FK-reference.
                   :model/Field    {flat-tgt :id} {:table_id tbl-id :name "zip-codes"
                                                   :base_type "type/Text"
                                                   :database_type "text"}]
      (let [batch [[1 {:id ["fkfin-cb-src-db" "public" "events"
                            "payload" "user" "zip"]
                       :table_id ["fkfin-cb-src-db" "public" "events"]
                       :name "payload → user → zip"
                       :nfc_path ["payload" "user" "zip"]
                       :base_type "type/Text" :database_type "text"
                       :fk_target_field_id ["fkfin-cb-src-db" "public" "events" "zip-codes"]}]]
            [r]   (into [] (processors/process-fields-fk-resolve! batch))]
        (is (= {:source-id ["fkfin-cb-src-db" "public" "events"
                            "payload" "user" "zip"]
                :target-id cb-leaf :status :updated}
               r))
        (is (= flat-tgt
               (:fk_target_field_id (t2/select-one :model/Field :id cb-leaf)))
            "Conv B leaf's fk_target_field_id is set to the flat target's int id")))))

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
