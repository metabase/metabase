(ns ^:synchronous metabase-enterprise.serialization.metadata-file-import.fields-test
  "Tests for the per-depth field-merge functions: the three resolves
  (`resolve-target-table-ids-for-fields-in-staging!`,
  `fill-target-parent-ids-at-depth!`, `fill-target-fk-target-ids-at-depth!`,
  `resolve-target-field-ids-at-depth!`), the UPDATE/INSERT pair
  (`update-matched-fields-at-depth!`, `insert-new-fields-at-depth!`), and
  the orchestration loop (`merge-fields-by-depth!`)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.processors :as p]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(use-fixtures :once
  (fn [thunk]
    ;; Warm test-data (load + sync) before disabling auto-sync: the first load must not happen with
    ;; sync off, or with-temp defaults that resolve test-data tables (e.g. `(data/id :checkins)`) fail.
    (mt/db)
    (mt/with-temporary-setting-values [disable-auto-sync true]
      (thunk))))

(defn- insert-staging-table-row!
  "Helper: drop one row into metabase_table_import. `overrides` can include
  `:target_id` to pre-resolve the row."
  [source-id db-name name & {:as overrides}]
  (t2/insert! :metabase_table_import
              (merge {:source_id    source-id
                      :source_db_id 1
                      :db_name      db-name
                      :schema       "PUBLIC"
                      :name         name
                      :display_name (str/capitalize name)}
                     overrides)))

(defn- insert-staging-field-row!
  "Helper: drop one row into metabase_field_import. Fills in NOT NULL
  defaults; `overrides` is everything else."
  [source-id name & {:as overrides}]
  (t2/insert! :metabase_field_import
              (merge {:source_id       source-id
                      :source_table_id 1
                      :name            name
                      :base_type       "type/Integer"
                      :database_type   "int"}
                     overrides)))

(defn- field-staging-row
  "Read a staging row by source_id for assertion."
  [source-id]
  (t2/select-one
   [:metabase_field_import
    :source_id :source_table_id :source_parent_id :source_fk_target_id
    :name :base_type :database_type :nfc_path :depth
    :target_id :target_table_id :target_parent_id :target_fk_target_id]
   :source_id source-id))

;;; ============================== resolve-target-table-ids-for-fields ==============================

(deftest resolve-target-table-ids-for-fields-copies-from-table-staging-test
  (try
    (p/clear-staging-tables!)
    ;; Two staging tables, one pre-resolved (target_id = 42), one not.
    (insert-staging-table-row! 1 "warehouse" "users" :target_id 42)
    (insert-staging-table-row! 2 "warehouse" "ghost")
    (insert-staging-field-row! 100 "id" :source_table_id 1)
    (insert-staging-field-row! 200 "x"  :source_table_id 2)
    (p/resolve-target-table-ids-for-fields-in-staging!)
    (is (= 42 (:target_table_id (field-staging-row 100))))
    (is (nil? (:target_table_id (field-staging-row 200)))
        "field whose table has no target_id stays NULL")
    (finally (p/clear-staging-tables!))))

;;; ============================== fill-target-parent-ids-at-depth ==============================

(deftest fill-target-parent-ids-only-touches-the-given-depth-test
  (try
    (p/clear-staging-tables!)
    ;; root at depth 0 (target_id = 1000 — pretend it's already been merged)
    (insert-staging-field-row! 10 "root" :depth 0 :target_id 1000)
    ;; child at depth 1 with parent pointing at the root
    (insert-staging-field-row! 11 "child" :depth 1 :source_parent_id 10)
    ;; another row at depth 2 — should NOT be touched by depth=1 call
    (insert-staging-field-row! 12 "grandchild" :depth 2 :source_parent_id 11)
    (p/fill-target-parent-ids-at-depth! 1)
    (is (= 1000 (:target_parent_id (field-staging-row 11)))
        "depth-1 row's target_parent_id picked up from parent at depth 0")
    (is (nil? (:target_parent_id (field-staging-row 12)))
        "depth-2 row not touched by depth=1 call")
    (finally (p/clear-staging-tables!))))

(deftest fill-target-parent-ids-skips-rows-without-source-parent-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-field-row! 10 "root" :depth 0 :target_id 1000)
    (insert-staging-field-row! 11 "no-parent" :depth 1)
    (p/fill-target-parent-ids-at-depth! 1)
    (is (nil? (:target_parent_id (field-staging-row 11))))
    (finally (p/clear-staging-tables!))))

;;; ============================== fill-target-fk-target-ids-at-depth ==============================

(deftest fill-target-fk-target-ids-at-depth-test
  (try
    (p/clear-staging-tables!)
    (insert-staging-field-row! 50 "id" :depth 0 :target_id 5000)
    (insert-staging-field-row! 51 "account_fk" :depth 1 :source_fk_target_id 50)
    (p/fill-target-fk-target-ids-at-depth! 1)
    (is (= 5000 (:target_fk_target_id (field-staging-row 51))))
    (finally (p/clear-staging-tables!))))

;;; ============================== resolve-target-field-ids-at-depth ==============================

(deftest resolve-target-field-ids-matches-by-natural-key-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                 :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}
                 :model/Field    {target-id :id} {:table_id t-id :name "user_id"
                                                  :base_type :type/Integer}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-field-row! 100 "user_id" :depth 0 :target_table_id t-id)
      (p/resolve-target-field-ids-at-depth! 0)
      (is (= target-id (:target_id (field-staging-row 100))))
      (finally (p/clear-staging-tables!)))))

(deftest resolve-target-field-ids-honors-parent-id-in-match-test
  (mt/with-temp [:model/Database {db-id :id}     {:engine :h2}
                 :model/Table    {t-id :id}      {:db_id db-id :schema "PUBLIC" :name "t"}
                 :model/Field    {parent-id :id} {:table_id t-id :name "data" :base_type :type/Dictionary}
                 :model/Field    {child-id :id}  {:table_id t-id :name "value"
                                                  :base_type :type/Text :parent_id parent-id}
                 ;; Sibling at the root level with the same name as the nested child
                 :model/Field    {root-id :id}   {:table_id t-id :name "value" :base_type :type/Text}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-field-row! 100 "value" :depth 1 :target_table_id t-id
                                 :target_parent_id parent-id)
      (insert-staging-field-row! 101 "value" :depth 0 :target_table_id t-id)
      (p/resolve-target-field-ids-at-depth! 1)
      (p/resolve-target-field-ids-at-depth! 0)
      (is (= child-id (:target_id (field-staging-row 100)))
          "nested 'value' (parent_id set) matches the nested target")
      (is (= root-id (:target_id (field-staging-row 101)))
          "flat 'value' (parent_id NULL) matches the root target")
      (finally (p/clear-staging-tables!)))))

(deftest resolve-target-field-ids-leaves-null-when-no-match-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                 :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-field-row! 100 "no_such_field" :depth 0 :target_table_id t-id)
      (p/resolve-target-field-ids-at-depth! 0)
      (is (nil? (:target_id (field-staging-row 100))))
      (finally (p/clear-staging-tables!)))))

(deftest resolve-target-field-ids-skips-defective-duplicate-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                 :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}
                 :model/Field    {}         {:table_id t-id :name "user_id"
                                             :base_type :type/Integer
                                             :is_defective_duplicate true}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-field-row! 100 "user_id" :depth 0 :target_table_id t-id)
      (p/resolve-target-field-ids-at-depth! 0)
      (is (nil? (:target_id (field-staging-row 100))))
      (finally (p/clear-staging-tables!)))))

(deftest resolve-target-field-ids-is-idempotent-test
  (mt/with-temp [:model/Database {db-id :id}     {:engine :h2}
                 :model/Table    {t-id :id}      {:db_id db-id :schema "PUBLIC" :name "t"}
                 :model/Field    {target-id :id} {:table_id t-id :name "x" :base_type :type/Text}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-field-row! 100 "x" :depth 0 :target_table_id t-id)
      (p/resolve-target-field-ids-at-depth! 0)
      (p/resolve-target-field-ids-at-depth! 0)
      (is (= target-id (:target_id (field-staging-row 100))))
      (finally (p/clear-staging-tables!)))))

;;; ============================== update-matched-fields-at-depth ==============================

(deftest update-matched-clobbers-payload-test
  (mt/with-temp [:model/Database {db-id :id}     {:engine :h2}
                 :model/Table    {t-id :id}      {:db_id db-id :schema "PUBLIC" :name "t"}
                 :model/Field    {target-id :id} {:table_id      t-id :name "x"
                                                  :base_type     :type/Integer
                                                  :description   "old"
                                                  :database_type "int"
                                                  :semantic_type nil}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-field-row! 100 "x" :depth 0 :target_table_id t-id :target_id target-id
                                 :base_type "type/Integer" :database_type "bigint"
                                 :description "new" :semantic_type "type/PK")
      (p/update-matched-fields-at-depth! 0)
      (let [after (t2/select-one :model/Field :id target-id)]
        (is (= "new"        (:description after)))
        (is (= "bigint"     (:database_type after)))
        (is (= :type/PK     (:semantic_type after))))
      (finally (p/clear-staging-tables!)))))

(deftest update-matched-skip-if-unchanged-test
  (mt/with-temp [:model/Database {db-id :id}     {:engine :h2}
                 :model/Table    {t-id :id}      {:db_id db-id :schema "PUBLIC" :name "t"}
                 :model/Field    {target-id :id} {:table_id      t-id :name "x"
                                                  :base_type     :type/Integer
                                                  :description   "same"
                                                  :database_type "int"
                                                  :active        true}]
    (try
      (t2/query {:update :metabase_field
                 :set    {:updated_at #t "2020-01-01T00:00:00Z"}
                 :where  [:= :id target-id]})
      (let [orig (:updated_at (t2/select-one :model/Field :id target-id))]
        (p/clear-staging-tables!)
        ;; Staging carries identical payload — UPDATE must NOT fire.
        (insert-staging-field-row! 100 "x" :depth 0 :target_table_id t-id :target_id target-id
                                   :base_type "type/Integer" :database_type "int"
                                   :description "same")
        (p/update-matched-fields-at-depth! 0)
        (is (= orig (:updated_at (t2/select-one :model/Field :id target-id)))
            "identical payload → no UPDATE → updated_at unchanged"))
      (finally (p/clear-staging-tables!)))))

(deftest update-matched-fires-when-payload-differs-test
  (mt/with-temp [:model/Database {db-id :id}     {:engine :h2}
                 :model/Table    {t-id :id}      {:db_id db-id :schema "PUBLIC" :name "t"}
                 :model/Field    {target-id :id} {:table_id      t-id :name "x"
                                                  :base_type     :type/Integer
                                                  :description   "old"
                                                  :database_type "int"}]
    (try
      (t2/query {:update :metabase_field
                 :set    {:updated_at #t "2020-01-01T00:00:00Z"}
                 :where  [:= :id target-id]})
      (let [orig (:updated_at (t2/select-one :model/Field :id target-id))]
        (p/clear-staging-tables!)
        (insert-staging-field-row! 100 "x" :depth 0 :target_table_id t-id :target_id target-id
                                   :base_type "type/Integer" :database_type "int"
                                   :description "new")
        (p/update-matched-fields-at-depth! 0)
        (is (not= orig (:updated_at (t2/select-one :model/Field :id target-id)))
            "different payload → UPDATE fires → updated_at bumped"))
      (finally (p/clear-staging-tables!)))))

;;; ============================== insert-new-fields-at-depth ==============================

(deftest insert-new-inserts-root-field-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                 :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-field-row! 100 "user_id" :depth 0 :target_table_id t-id
                                 :base_type "type/Integer" :database_type "int")
      (p/insert-new-fields-at-depth! 0)
      (let [inserted (t2/select-one :model/Field :table_id t-id :name "user_id")]
        (is (some? inserted))
        (is (= :type/Integer (:base_type inserted)))
        (is (= "int"         (:database_type inserted)))
        (is (true?           (:active inserted)))
        (is (nil?            (:parent_id inserted)))
        (is (nil?            (:fk_target_field_id inserted))))
      (finally (p/clear-staging-tables!)))))

(deftest insert-new-uses-target-parent-id-test
  (mt/with-temp [:model/Database {db-id :id}     {:engine :h2}
                 :model/Table    {t-id :id}      {:db_id db-id :schema "PUBLIC" :name "t"}
                 :model/Field    {parent-id :id} {:table_id t-id :name "data" :base_type :type/Dictionary}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-field-row! 100 "value" :depth 1 :target_table_id t-id
                                 :base_type "type/Text" :database_type "text"
                                 :target_parent_id parent-id
                                 :nfc_path (json/encode ["data" "value"]))
      (p/insert-new-fields-at-depth! 1)
      (let [inserted (t2/select-one :model/Field :table_id t-id :name "value" :parent_id parent-id)]
        (is (some? inserted))
        (is (= parent-id (:parent_id inserted)))
        (is (= ["data" "value"] (:nfc_path inserted))))
      (finally (p/clear-staging-tables!)))))

(deftest insert-new-uses-target-fk-target-id-test
  (mt/with-temp [:model/Database {db-id :id}     {:engine :h2}
                 :model/Table    {t-id :id}      {:db_id db-id :schema "PUBLIC" :name "t"}
                 :model/Field    {target-id :id} {:table_id t-id :name "id" :base_type :type/Integer}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-field-row! 100 "account_fk" :depth 1 :target_table_id t-id
                                 :base_type "type/Integer" :database_type "int"
                                 :target_fk_target_id target-id)
      (p/insert-new-fields-at-depth! 1)
      (let [inserted (t2/select-one :model/Field :table_id t-id :name "account_fk")]
        (is (= target-id (:fk_target_field_id inserted))))
      (finally (p/clear-staging-tables!)))))

(deftest insert-new-preserves-null-effective-type-test
  ;; The application reads NULL effective_type as "equal to base_type" at
  ;; use sites, so the stored NULL is correct.
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                 :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-field-row! 100 "x" :depth 0 :target_table_id t-id
                                 :base_type "type/Integer" :database_type "int"
                                 :effective_type nil)
      (p/insert-new-fields-at-depth! 0)
      (let [inserted (t2/select-one :model/Field :table_id t-id :name "x")]
        (is (some? inserted))
        (is (nil? (:effective_type inserted))
            "NULL staging effective_type → NULL target effective_type"))
      (finally (p/clear-staging-tables!)))))

(deftest insert-new-preserves-explicit-effective-type-test
  ;; When source had effective_type ≠ base_type, the wire row carries the
  ;; explicit value. Staging carries it. INSERT writes it.
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                 :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-field-row! 100 "x" :depth 0 :target_table_id t-id
                                 :base_type "type/Text" :database_type "varchar"
                                 :effective_type "type/PostgresEnum")
      (p/insert-new-fields-at-depth! 0)
      (let [inserted (t2/select-one :model/Field :table_id t-id :name "x")]
        (is (= :type/PostgresEnum (:effective_type inserted))))
      (finally (p/clear-staging-tables!)))))

(deftest update-matched-skip-if-unchanged-handles-effective-type-coalesce-test
  ;; Cross-checks the COALESCE branch in field-payload-changed-predicate:
  ;; target.effective_type explicitly == base_type, staging.effective_type
  ;; NULL → COALESCED values match → skip-if-unchanged fires.
  (mt/with-temp [:model/Database {db-id :id}     {:engine :h2}
                 :model/Table    {t-id :id}      {:db_id db-id :schema "PUBLIC" :name "t"}
                 :model/Field    {target-id :id} {:table_id        t-id :name "x"
                                                  :base_type       :type/Integer
                                                  :effective_type  :type/Integer
                                                  :database_type   "int"}]
    (try
      (t2/query {:update :metabase_field
                 :set    {:updated_at #t "2020-01-01T00:00:00Z"}
                 :where  [:= :id target-id]})
      (let [orig (:updated_at (t2/select-one :model/Field :id target-id))]
        (p/clear-staging-tables!)
        ;; Staging matches except effective_type is NULL (the export-omitted case).
        (insert-staging-field-row! 100 "x" :depth 0 :target_table_id t-id :target_id target-id
                                   :base_type "type/Integer" :database_type "int"
                                   :effective_type nil)
        (p/update-matched-fields-at-depth! 0)
        (is (= orig (:updated_at (t2/select-one :model/Field :id target-id)))
            "COALESCE(target.effective_type, target.base_type) == COALESCE(NULL, staging.base_type) — no UPDATE"))
      (finally (p/clear-staging-tables!)))))

(deftest insert-new-skips-row-with-no-target-table-test
  (try
    (p/clear-staging-tables!)
    (let [count-before (t2/count :metabase_field)]
      (insert-staging-field-row! 100 "orphan" :depth 0 :target_table_id nil)
      (p/insert-new-fields-at-depth! 0)
      (is (= count-before (t2/count :metabase_field))))
    (finally (p/clear-staging-tables!))))

(deftest insert-new-skips-row-whose-parent-was-orphaned-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                 :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}]
    (try
      (p/clear-staging-tables!)
      ;; Row has a source_parent_id but target_parent_id wasn't resolved
      ;; (would happen if the parent's table didn't match target).
      (insert-staging-field-row! 100 "orphaned_child" :depth 1
                                 :target_table_id t-id
                                 :source_parent_id 999)
      (p/insert-new-fields-at-depth! 1)
      (is (zero? (t2/count :model/Field :table_id t-id :name "orphaned_child")))
      (finally (p/clear-staging-tables!)))))

(deftest insert-new-keeps-row-whose-fk-target-was-dropped-test
  (testing "a field whose FK target was dropped during merge (source_fk_target_id
            set, target_fk_target_id unresolved) is still inserted with
            fk_target_field_id NULL — the FK is a semantic annotation, not structural."
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                   :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}]
      (try
        (p/clear-staging-tables!)
        ;; Field sits in a matched table (target_table_id set) and has an FK whose
        ;; target was dropped: source_fk_target_id is set, target_fk_target_id NULL.
        (insert-staging-field-row! 100 "user_id" :depth 1
                                   :target_table_id t-id
                                   :source_fk_target_id 999)
        (p/insert-new-fields-at-depth! 1)
        (let [inserted (t2/select-one :model/Field :table_id t-id :name "user_id")]
          (is (some? inserted)
              "field in a matched table is inserted even though its FK target didn't resolve")
          (is (nil? (:fk_target_field_id inserted))
              "the unresolved FK is stored as NULL, not the field dropped"))
        (finally (p/clear-staging-tables!))))))

;;; ============================== merge-fields-by-depth (integration) ==============================

(deftest merge-fields-by-depth-handles-flat-fields-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                 :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-table-row! 1 (:name (t2/select-one :model/Database :id db-id)) "t" :target_id t-id)
      (insert-staging-field-row! 100 "a" :depth 0 :target_table_id t-id)
      (insert-staging-field-row! 101 "b" :depth 0 :target_table_id t-id)
      (p/merge-fields-by-depth!)
      (is (= #{"a" "b"} (set (map :name (t2/select :model/Field :table_id t-id)))))
      (finally (p/clear-staging-tables!)))))

(deftest merge-fields-by-depth-handles-parent-chain-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                 :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-table-row! 1 (:name (t2/select-one :model/Database :id db-id)) "t" :target_id t-id)
      ;; root → parent → grandchild
      (insert-staging-field-row! 10 "data"  :depth 0 :target_table_id t-id
                                 :base_type "type/Dictionary" :database_type "json")
      (insert-staging-field-row! 11 "inner" :depth 1 :target_table_id t-id
                                 :base_type "type/Dictionary" :database_type "json"
                                 :source_parent_id 10
                                 :nfc_path (json/encode ["data"]))
      (insert-staging-field-row! 12 "leaf"  :depth 2 :target_table_id t-id
                                 :base_type "type/Text" :database_type "text"
                                 :source_parent_id 11
                                 :nfc_path (json/encode ["data" "inner"]))
      (p/merge-fields-by-depth!)
      (let [root  (t2/select-one :model/Field :table_id t-id :name "data")
            inner (t2/select-one :model/Field :table_id t-id :name "inner")
            leaf  (t2/select-one :model/Field :table_id t-id :name "leaf")]
        (is (some? root))
        (is (= (:id root)  (:parent_id inner)))
        (is (= (:id inner) (:parent_id leaf)))
        (is (= ["data" "inner"] (:nfc_path leaf))))
      (finally (p/clear-staging-tables!)))))

(deftest merge-fields-by-depth-handles-fk-chain-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                 :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-table-row! 1 (:name (t2/select-one :model/Database :id db-id)) "t" :target_id t-id)
      ;; A is non-FK, B points at A via fk_target.
      (insert-staging-field-row! 10 "a" :depth 0 :target_table_id t-id)
      (insert-staging-field-row! 11 "b" :depth 1 :target_table_id t-id
                                 :source_fk_target_id 10)
      (p/merge-fields-by-depth!)
      (let [a (t2/select-one :model/Field :table_id t-id :name "a")
            b (t2/select-one :model/Field :table_id t-id :name "b")]
        (is (some? a))
        (is (some? b))
        (is (= (:id a) (:fk_target_field_id b))))
      (finally (p/clear-staging-tables!)))))

(deftest merge-fields-by-depth-reconciles-fk-on-matched-field-test
  (testing "a matched field's fk_target_field_id is reconciled from the import
            file, even when no other payload column differs — the FK isn't part
            of the natural-key match, so it can drift independently of row identity."
    (mt/with-temp [:model/Database {db-id :id}      {:engine :h2}
                   :model/Table    {t-id :id}       {:db_id db-id :schema "PUBLIC" :name "t"}
                   :model/Field    {id-field :id}   {:table_id t-id :name "id"
                                                     :base_type :type/Integer :database_type "int"}
                   :model/Field    {acct-field :id} {:table_id t-id :name "account_id"
                                                     :base_type :type/Integer :database_type "int"}]
      (try
        (is (nil? (:fk_target_field_id (t2/select-one :model/Field :id acct-field)))
            "fixture starts with account_id un-FK'd")
        (p/clear-staging-tables!)
        (insert-staging-table-row! 1 (:name (t2/select-one :model/Database :id db-id)) "t" :target_id t-id)
        ;; Staging payloads are identical to the live rows except account_id now
        ;; carries an FK pointing at id — so only the FK has drifted.
        (insert-staging-field-row! 10 "id"         :depth 0 :target_table_id t-id)
        (insert-staging-field-row! 11 "account_id" :depth 1 :target_table_id t-id
                                   :source_fk_target_id 10)
        (p/merge-fields-by-depth!)
        (is (= id-field (:fk_target_field_id (t2/select-one :model/Field :id acct-field)))
            "matched field's fk_target_field_id is reconciled from the file")
        (finally (p/clear-staging-tables!))))))

(deftest merge-fields-by-depth-is-idempotent-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}
                 :model/Table    {t-id :id}  {:db_id db-id :schema "PUBLIC" :name "t"}]
    (try
      (p/clear-staging-tables!)
      (insert-staging-table-row! 1 (:name (t2/select-one :model/Database :id db-id)) "t" :target_id t-id)
      (insert-staging-field-row! 100 "x" :depth 0 :target_table_id t-id)
      (p/merge-fields-by-depth!)
      (let [first-id  (:id (t2/select-one :model/Field :table_id t-id :name "x"))
            _         (p/merge-fields-by-depth!)
            second-id (:id (t2/select-one :model/Field :table_id t-id :name "x"))]
        (is (= first-id second-id))
        (is (= 1 (t2/count :model/Field :table_id t-id :name "x"))))
      (finally (p/clear-staging-tables!)))))
