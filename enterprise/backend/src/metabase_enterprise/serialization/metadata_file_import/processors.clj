(ns metabase-enterprise.serialization.metadata-file-import.processors
  "SQL building blocks for the metadata file importer's drain-then-merge flow.

  Errors propagate as `ex-info` with `:kind` for typed failure handling
  (`:invalid-input`, `:file-incomplete`, `:cycle-in-field-graph`, `:depth-tagging-cap-exceeded`)."
  (:require
   [malli.error :as me]
   [metabase-enterprise.serialization.metadata-file-import.schemas :as schemas]
   [metabase.app-db.core :as mdb]
   [metabase.models.humanization :as humanization]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)
   (java.sql PreparedStatement Types)
   (org.postgresql.copy CopyIn)))

(set! *warn-on-reflection* true)

(def import-batch-size
  "Row batch size shared by the drain and merge processors."
  ;; 250 was the sweet spot in local benchmarks
  250)

;;; ============================== Validation ==============================

(defn- validate-line!
  "Validate `line` against the registered Malli `schema-ref`.
  On failure throws `ex-info` with `:kind :invalid-input`, `:line`, a humanized `:detail`,
  and `extras` merged into the ex-data."
  [schema-ref line-num line extras]
  (when-let [humanized (me/humanize (mr/explain schema-ref line))]
    (throw (ex-info (format "Invalid %s row on line %d" (name schema-ref) line-num)
                    (merge extras
                           {:kind   :invalid-input
                            :line   line-num
                            :detail (pr-str humanized)})))))

;;; ============================== Staging tables ==============================

(defn clear-staging-tables!
  "Empty `metabase_table_import` and `metabase_field_import`."
  []
  ;; TRUNCATE (not DELETE) so multiple imports in one process lifetime don't
  ;; accumulate dead tuples in staging.
  ;; Called outside any outer transaction, so MySQL's implicit-commit-on-
  ;; TRUNCATE doesn't break composition.
  (t2/query {:truncate :metabase_table_import})
  (t2/query {:truncate :metabase_field_import}))

(defn analyze-staging-tables!
  "Refresh planner statistics on `metabase_table_import` and `metabase_field_import`."
  []
  (case (mdb/db-type)
    :postgres
    (do (t2/query "ANALYZE metabase_table_import")
        (t2/query "ANALYZE metabase_field_import"))
    :mysql
    (do (t2/query "ANALYZE TABLE metabase_table_import")
        (t2/query "ANALYZE TABLE metabase_field_import"))
    :h2
    (t2/query "ANALYZE")))

(defmacro with-staging-tables
  "Run `body` with staging tables cleared on entry and on exit."
  [& body]
  `(do (clear-staging-tables!)
       (try ~@body
            (finally (clear-staging-tables!)))))

;;; ============================== databases (batch) ==============================

(defn- engine-name
  "Normalize `engine` (string or keyword) to a string for natural-key comparison.
  Toucan2's `:model/Database` reads `:engine` as a keyword via `define-after-select`,
  but file-imported rows always carry strings. Normalize both sides to string."
  [engine]
  (when engine (name engine)))

(defn- match-databases-batch
  "Look up every existing target Database matching any source row in the
  batch. Returns `{[name engine-string] → existing-id}` for matching rows."
  [lines]
  (let [pairs   (into #{}
                      (map (fn [{:keys [name engine]}] [name (engine-name engine)]))
                      lines)
        names   (into #{} (map first) pairs)
        engines (into #{} (map second) pairs)]
    (if (or (empty? names) (empty? engines))
      {}
      ;; Over-include via `(name IN ..., engine IN ...)` then intersect in
      ;; Clojure — keeps the SQL portable (no `(col, col) IN ((?, ?), ...)`
      ;; tuple form across Postgres / H2 / MySQL).
      (let [rows (t2/select [:model/Database :id :name :engine]
                            {:where [:and
                                     [:in :name names]
                                     [:in :engine engines]]})]
        (into {}
              (comp (map (fn [{:keys [id name engine]}]
                           [[name (engine-name engine)] id]))
                    (filter (fn [[pair _]] (contains? pairs pair))))
              rows)))))

(defn process-databases!
  "Process a batch of database rows. Returns an eduction of result maps.

  Result shapes:
    `{:source-id <int> :name <string> :target-id <int> :status :matched}`
    `{:source-id <int> :name <string> :status :no-match :line L :detail S}`

  Validation failures throw; lookup misses produce `:no-match` results
  (non-fatal)."
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/database-info ln line {:source-id (:id line)}))
  (let [match-idx (match-databases-batch (mapv second batch))]
    (eduction
     (map (fn [[ln {:keys [id name engine]}]]
            (if-let [target (match-idx [name (engine-name engine)])]
              {:source-id id :name name :target-id target :status :matched}
              {:source-id id :name name
               :status    :no-match
               :line      ln
               :detail    (format "No database with name=%s engine=%s"
                                  (pr-str name) (pr-str (engine-name engine)))})))
     batch)))

;;; ============================== tables — drain + merge ==============================

(defn- encode-path-or-nil
  "Encode an `:nfc_path` coll as a JSON string. NULL for empty/nil."
  [coll]
  (when (seq coll) (json/encode (vec coll))))

;;; ============================== JDBC drain (perf path) ==============================
;;;
;;; Hand-rolled JDBC `executeBatch` against single per-staging-table prepared
;;; statements. Used by the loader's `drain-and-match-databases!` to bypass
;;; the t2/insert! + HoneySQL VALUES formatting overhead — measured ~15×
;;; slower per row than PG's COPY floor on multi-million-row drains.

(defn tables-insert-sql
  "Parameterized INSERT for `metabase_table_import`. Column order matches the
  `set*-batch!` parameter-binding order in [[drain-tables-batch-jdbc!]]."
  []
  (str "INSERT INTO metabase_table_import"
       ;; `schema` is a reserved word in MySQL/MariaDB
       " (source_id, source_db_id, db_name, " (mdb/quote-for-application-db "schema")
       ", name, description, display_name)"
       " VALUES (?, ?, ?, ?, ?, ?, ?)"))

(defn fields-insert-sql
  "Parameterized INSERT for `metabase_field_import`. Column order matches the
  `set*-batch!` parameter-binding order in [[drain-fields-batch-jdbc!]]."
  []
  (str "INSERT INTO metabase_field_import"
       " (source_id, source_table_id, source_parent_id, source_fk_target_id,"
       "  name, base_type, database_type, effective_type, semantic_type,"
       "  coercion_strategy, description, nfc_path)"
       " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"))

(defn- set-int-or-null! [^PreparedStatement ps ^long idx v]
  (if v
    (.setInt ps idx (int v))
    (.setNull ps idx Types/INTEGER)))

(defn- set-string-or-null! [^PreparedStatement ps ^long idx v]
  (if v
    (.setString ps idx (str v))
    (.setNull ps idx Types/VARCHAR)))

(defn drain-tables-batch-jdbc!
  "Per-batch handler for `:tables` that binds rows onto `ps` and flushes via
  `executeBatch`. Validates each row first; throws on schema failure.

  `ps` must be a `PreparedStatement` for [[tables-insert-sql]]; the caller
  owns the connection + statement lifecycle."
  [^PreparedStatement ps databases-by-source-id batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/table-info ln line {:source-id (:id line)}))
  (when (seq batch)
    (doseq [[_ {:keys [id db_id schema name description]}] batch]
      (.setInt ps 1 (int id))
      (.setInt ps 2 (int db_id))
      (.setString ps 3 (str (get databases-by-source-id db_id)))
      (set-string-or-null! ps 4 schema)
      (.setString ps 5 (str name))
      (set-string-or-null! ps 6 description)
      (.setString ps 7 (humanization/name->human-readable-name name))
      (.addBatch ps))
    (.executeBatch ps)))

(defn drain-fields-batch-jdbc!
  "Per-batch handler for `:fields` that binds rows onto `ps` and flushes via
  `executeBatch`. Validates each row first; throws on schema failure.

  `ps` must be a `PreparedStatement` for [[fields-insert-sql]]; the caller
  owns the connection + statement lifecycle."
  [^PreparedStatement ps batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/field-info ln line {:source-id (:id line)}))
  (when (seq batch)
    (doseq [[_ {:keys [id table_id parent_id fk_target_field_id
                       name base_type database_type
                       effective_type semantic_type
                       coercion_strategy description nfc_path]}] batch]
      (.setInt ps 1 (int id))
      (.setInt ps 2 (int table_id))
      (set-int-or-null! ps 3 parent_id)
      (set-int-or-null! ps 4 fk_target_field_id)
      (.setString ps 5 (str name))
      (.setString ps 6 (str base_type))
      (.setString ps 7 (str database_type))
      (set-string-or-null! ps 8 effective_type)
      (set-string-or-null! ps 9 semantic_type)
      (set-string-or-null! ps 10 coercion_strategy)
      (set-string-or-null! ps 11 description)
      (set-string-or-null! ps 12 (encode-path-or-nil nfc_path))
      (.addBatch ps))
    (.executeBatch ps)))

;;; ============================== PG-specific COPY drain ==============================
;;;
;;; Drives staging-table inserts through PostgreSQL's COPY wire protocol via
;;; `CopyManager` / `CopyIn`. Streams TSV-formatted row bytes directly to the
;;; server — no per-statement parsing, no JDBC parameter binding overhead.
;;; Approaches PG's raw bulk-load throughput; in practice ~5× faster than the
;;; JDBC `executeBatch` path at multi-million-row scale.

(def tables-copy-sql
  "PostgreSQL COPY statement for `metabase_table_import`. Column order matches
  the TSV emitted by [[table-tsv-line]]."
  (str "COPY metabase_table_import"
       " (source_id, source_db_id, db_name, schema, name, description, display_name)"
       " FROM STDIN"))

(def fields-copy-sql
  "PostgreSQL COPY statement for `metabase_field_import`. Column order matches
  the TSV emitted by [[field-tsv-line]]."
  (str "COPY metabase_field_import"
       " (source_id, source_table_id, source_parent_id, source_fk_target_id,"
       "  name, base_type, database_type, effective_type, semantic_type,"
       "  coercion_strategy, description, nfc_path)"
       " FROM STDIN"))

(defn- tsv-escape ^String [^String s]
  (-> s
      (.replace "\\" "\\\\")
      (.replace "\t" "\\t")
      (.replace "\n" "\\n")
      (.replace "\r" "\\r")))

(defn- tsv-cell ^String [v]
  (cond
    (nil? v)     "\\N"
    (number? v)  (str v)
    (boolean? v) (str v)
    :else        (tsv-escape (str v))))

(defn- table-tsv-line ^String [row databases-by-source-id]
  (let [{:keys [id db_id schema name description]} row]
    (str (tsv-cell id) "\t"
         (tsv-cell db_id) "\t"
         (tsv-cell (get databases-by-source-id db_id)) "\t"
         (tsv-cell schema) "\t"
         (tsv-cell name) "\t"
         (tsv-cell description) "\t"
         (tsv-cell (humanization/name->human-readable-name name)) "\n")))

(defn- field-tsv-line ^String [row]
  (let [{:keys [id table_id parent_id fk_target_field_id
                name base_type database_type
                effective_type semantic_type
                coercion_strategy description nfc_path]} row]
    (str (tsv-cell id) "\t"
         (tsv-cell table_id) "\t"
         (tsv-cell parent_id) "\t"
         (tsv-cell fk_target_field_id) "\t"
         (tsv-cell name) "\t"
         (tsv-cell base_type) "\t"
         (tsv-cell database_type) "\t"
         (tsv-cell effective_type) "\t"
         (tsv-cell semantic_type) "\t"
         (tsv-cell coercion_strategy) "\t"
         (tsv-cell description) "\t"
         (tsv-cell (encode-path-or-nil nfc_path)) "\n")))

(defn drain-tables-batch-pg-copy!
  "Per-batch handler for `:tables` that streams TSV rows over PG's COPY wire
  protocol via the supplied `CopyIn` handle. Validates each row first."
  [^CopyIn copy-in databases-by-source-id batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/table-info ln line {:source-id (:id line)}))
  (doseq [[_ row] batch]
    (let [^bytes bs (.getBytes (table-tsv-line row databases-by-source-id) StandardCharsets/UTF_8)]
      (.writeToCopy copy-in bs 0 (alength bs)))))

(defn drain-fields-batch-pg-copy!
  "Per-batch handler for `:fields` that streams TSV rows over PG's COPY wire
  protocol via the supplied `CopyIn` handle. Validates each row first."
  [^CopyIn copy-in batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/field-info ln line {:source-id (:id line)}))
  (doseq [[_ row] batch]
    (let [^bytes bs (.getBytes (field-tsv-line row) StandardCharsets/UTF_8)]
      (.writeToCopy copy-in bs 0 (alength bs)))))

(defn resolve-target-table-ids-in-staging!
  "Set `metabase_table_import.target_id` to the int id of the matching
  `metabase_table` row for every staging row whose match key resolves. The
  match key is `(db_name, schema, name)` against `(d.name, t.schema, t.name)`,
  restricted to non-defective live rows.

  Inactive matches will be reactivated on import.

  Rows that do not match keep `target_id` NULL. Idempotent — running again with
  the same staging contents produces the same assignments."
  []
  (t2/query
   {:update :metabase_table_import
    :set    {:target_id
             ;; MIN(t.id): `metabase_database`'s unique constraint is
             ;; `(router_database_id, name)`, so two NULL-router databases
             ;; can share a name → two `(db_name, schema, name)` matches
             ;; (GHY-3549).
             {:select [[[:min :t.id]]]
              :from   [[:metabase_table :t]]
              :join   [[:metabase_database :d] [:= :d.id :t.db_id]]
              :where  [:and
                       [:= :metabase_table_import.db_name :d.name]
                       [:= [:coalesce :t.schema [:inline ""]]
                        [:coalesce :metabase_table_import.schema [:inline ""]]]
                       [:= :t.name :metabase_table_import.name]
                       [:= :t.is_defective_duplicate [:inline false]]]}}}))

;; UPDATE before INSERT: on a clean-schema import the UPDATE matches nothing
;; (fast no-op) and the INSERT then writes each row exactly once.
;;
;; Callers re-run [[resolve-target-table-ids-in-staging!]] and pass the set to
;; [[new-target-tables-from-staging]] to read back the freshly-created rows.
(defn merge-tables!
  "Merge `metabase_table_import` into `metabase_table` atomically: UPDATE the
  staging rows that matched a live table, INSERT the rest. Returns the set of
  staging `source_id`s that were INSERTed (snapshot taken before the INSERT).

  Pre-condition: [[resolve-target-table-ids-in-staging!]] must have run, so
  matched staging rows carry a `target_id`."
  []
  (t2/with-transaction [_]
    ;; t2 joins an outer txn rather than creating a savepoint, so wrapping
    ;; this call in a larger transaction is safe.

    ;; Capture which staging rows are about to be INSERTed (target_id NULL).
    ;; After the INSERT + a subsequent resolve round, these source_ids will
    ;; have their `target_id` populated with the freshly-inserted live id.
    (let [insert-source-ids
          (into #{} (map :source_id)
                (t2/query {:select [:source_id]
                           :from   [:metabase_table_import]
                           :where  [:= :target_id nil]}))]
      ;; UPDATE matched rows first (clobber description, bump updated_at).
      ;; Skip-if-unchanged: the EXISTS subquery additionally requires that
      ;; description actually differs (NULL-safe via COALESCE-with-empty-
      ;; string), so a re-import with identical description is a true no-op
      ;; — no UPDATE fires, no dead tuple. updated_at is deliberately NOT
      ;; in the predicate (otherwise the UPDATE would always fire,
      ;; defeating the optimization).
      (t2/query
       {:update :metabase_table
        :set    {:description {;; ORDER BY + LIMIT 1: two staging rows can
                               ;; resolve to the same `target_id` (GHY-3549).
                               :select   [:it.description]
                               :from     [[:metabase_table_import :it]]
                               :where    [:= :it.target_id :metabase_table.id]
                               :order-by [[:it.source_id :asc]]
                               :limit    1}
                 ;; reactivate in place:
                 :active     [:inline true]
                 :updated_at :%now}
        :where  [:and
                 [:= :metabase_table.is_defective_duplicate [:inline false]]
                 [:exists {:select [[[:inline 1]]]
                           :from   [[:metabase_table_import :it]]
                           :where  [:and
                                    [:= :it.target_id :metabase_table.id]
                                    ;; Fire when the description differs OR the row needs
                                    ;; reactivating — otherwise re-importing a deactivated
                                    ;; but otherwise-unchanged table would skip the UPDATE
                                    ;; and leave it inactive.
                                    [:or
                                     [:!= [:coalesce :metabase_table.description [:inline ""]]
                                      [:coalesce :it.description [:inline ""]]]
                                     [:= :metabase_table.active [:inline false]]]]}]]})
      ;; INSERT bypasses :model/Table's :after-insert hook — that hook
      ;; schedules per-DB Quartz triggers we don't want and fires
      ;; `set-new-table-permissions!` once per row. The JOIN on db_name
      ;; silently drops staging rows whose source DB has no target appdb.
      (t2/query
       {:insert-into
        [[:metabase_table [:db_id :schema :name :description :display_name :data_layer
                           :active :show_in_getting_started :is_defective_duplicate
                           :created_at :updated_at]]
         {:select [:d.id :it.schema :it.name :it.description :it.display_name
                   [[:inline "internal"]]
                   [[:inline true]] [[:inline false]] [[:inline false]]
                   :%now :%now]
          :from   [[:metabase_table_import :it]]
          :join   [[:metabase_database :d] [:= :d.name :it.db_name]]
          :where  [:= :it.target_id nil]}]})
      insert-source-ids)))

(defn new-target-tables-from-staging
  "Look up the `metabase_table` rows that were just INSERTed by
  [[merge-tables!]]. `insert-source-ids` is the set returned by
  [[merge-tables!]]. Pre-condition:
  [[resolve-target-table-ids-in-staging!]] has run since the INSERT, so
  staging's `target_id` is populated for these rows."
  [insert-source-ids]
  (when (seq insert-source-ids)
    (t2/query {:select [:t.id :t.db_id :t.schema]
               :from   [[:metabase_table :t]]
               :join   [[:metabase_table_import :it] [:= :it.target_id :t.id]]
               :where  [:in :it.source_id (vec insert-source-ids)]})))

;;; ============================== Pre-flight orphan check ==============================

(def ^:private orphan-sample-cap
  "How many orphan rows to surface in the error data when bailing out. Visibility
  without exploding the exception payload."
  10)

(defn- orphan-not-exists-predicate
  "WHERE-clause fragment matching `metabase_field_import` rows whose `column-key` (a `:source_*_id` column)
  is non-null but references no other staging row's `source_id` — i.e. an orphan reference."
  [column-key]
  ;; Correlated NOT EXISTS, not NOT IN: at 9M+ rows PG can't plan
  ;; `NOT IN (subquery)` (NULL-semantics force full-materialization of the
  ;; inner set) and it effectively never terminates. NOT EXISTS resolves to a
  ;; proper anti-join via the PK index on `source_id` — O(N log N), not O(N²).
  ;;
  ;; The inner FROM is a `(SELECT source_id FROM ...)` derived table so the
  ;; predicate stays valid inside an UPDATE on `metabase_field_import`: MySQL
  ;; forbids referencing the UPDATE's target table directly in a subquery; the
  ;; wrap defeats that, and PG/H2 inline it away. Aliased `:s` so the inner
  ;; WHERE's unqualified column-key resolves to the outer table.
  (let [outer-col (keyword (str "metabase_field_import." (name column-key)))]
    [:and
     [:not= column-key nil]
     [:not [:exists
            {:select [[[:inline 1]]]
             :from   [[{:select [:source_id]
                        :from   [:metabase_field_import]} :s]]
             :where  [:= :s.source_id outer-col]}]]]))

(defn- orphan-count
  "Number of `metabase_field_import` rows whose `column-key` (a `:source_*_id`
  column) is non-null but doesn't reference any other row's `source_id`."
  [column-key]
  (t2/count :metabase_field_import {:where (orphan-not-exists-predicate column-key)}))

(defn- orphan-sample
  "Up to `orphan-sample-cap` `[source_id, <column-key>]` pairs for orphan rows."
  [column-key]
  (t2/query
   {:select [:source_id column-key]
    :from   [:metabase_field_import]
    :where  (orphan-not-exists-predicate column-key)
    :limit  orphan-sample-cap}))

(defn assert-no-orphan-refs!
  "Pre-flight check after drain: every staging field row's `source_parent_id`
  must reference another staging row's `source_id`. Throws `ex-info` with
  `:kind :file-incomplete` and a sample of orphan rows in the error data
  when any orphan parent ref exists.

  Parent refs are structural — a field claiming to be a child of a missing
  field can't be positioned, so the file is genuinely incomplete. Orphan
  `source_fk_target_id` refs are not fatal here; see
  [[null-orphan-fk-target-refs!]]."
  []
  (let [parent-count (orphan-count :source_parent_id)]
    (when (pos? parent-count)
      (throw (ex-info (format "metadata-file-import: file is incomplete — %d orphan parent ref(s)"
                              parent-count)
                      {:kind                   :file-incomplete
                       :orphan-parent-count    parent-count
                       :orphan-parent-sample   (orphan-sample :source_parent_id)})))))

(defn null-orphan-fk-target-refs!
  "Find staging rows whose `source_fk_target_id` points at a `source_id`
  not present in staging, and NULL the `source_fk_target_id` column on
  those rows. Returns `{:count N :sample [...]}` when at least one row was
  scrubbed, `{:count 0}` otherwise."
  []
  ;; Why NULL instead of abort: fk_target refs that cross a hidden/archived
  ;; table boundary on the source side (the table is `active=false` or
  ;; `visibility_type='hidden'`) survive in `metabase_field` but get filtered
  ;; out by the export's table-visibility join. The exported file then contains
  ;; fk_target refs whose targets aren't emitted — a real-data shape we observe
  ;; in production appdbs. Treating these as fatal would block legitimate
  ;; imports; treating them as no-fk is the lossless choice for the importer.
  (let [n (orphan-count :source_fk_target_id)]
    (if (zero? n)
      {:count 0}
      (let [sample (orphan-sample :source_fk_target_id)]
        (t2/query
         {:update :metabase_field_import
          :set    {:source_fk_target_id nil}
          :where  (orphan-not-exists-predicate :source_fk_target_id)})
        {:count n :sample sample}))))

;;; ============================== Depth tagging ==============================

(def depth-iteration-cap
  "Iteration cap on the depth-tagging fixpoint loop; exceeding it throws
  `:cycle-in-field-graph` with the un-tagged sample."
  ;; Field parent chains are shallow in practice (a few levels at most), so 50
  ;; is a comfortable safety belt — exceeding it means the algorithm is the
  ;; bug, not the data.
  50)

(defn- mark-roots-at-depth-zero!
  "Tag every staging row with no parent and no fk_target ref as `depth = 0`.
  Bootstraps the iteration."
  []
  (t2/query
   {:update :metabase_field_import
    :set    {:depth 0}
    :where  [:and
             [:= :source_parent_id nil]
             [:= :source_fk_target_id nil]]}))

(defn- mark-rows-at-depth!
  "Tag every still-untagged staging row whose `source_parent_id` and
  `source_fk_target_id` (when non-NULL) reference rows that already have
  `depth < d`."
  [d]
  ;; MySQL forbids referencing the UPDATE's target table directly inside a
  ;; subquery; wrap in a derived table there. PG/H2 accept the direct form.
  (let [staging-source (case (mdb/db-type)
                         :mysql {:select [:source_id :depth]
                                 :from   [:metabase_field_import]}
                         :metabase_field_import)]
    (t2/query
     {:update :metabase_field_import
      :set    {:depth d}
      :where  [:and
               [:= :metabase_field_import.depth nil]
               [:or
                [:= :metabase_field_import.source_parent_id nil]
                [:exists {:select [[[:inline 1]]]
                          :from   [[staging-source :p]]
                          :where  [:and
                                   [:= :p.source_id :metabase_field_import.source_parent_id]
                                   [:not= :p.depth nil]
                                   [:< :p.depth d]]}]]
               [:or
                [:= :metabase_field_import.source_fk_target_id nil]
                [:exists {:select [[[:inline 1]]]
                          :from   [[staging-source :f]]
                          :where  [:and
                                   [:= :f.source_id :metabase_field_import.source_fk_target_id]
                                   [:not= :f.depth nil]
                                   [:< :f.depth d]]}]]]})))

(defn- untagged-staging-row-count
  "Number of `metabase_field_import` rows still at `depth IS NULL`. Used as
  the convergence signal in `compute-staging-depth!`."
  []
  (t2/count :metabase_field_import :depth nil))

(defn- untagged-staging-row-sample
  "Up to `orphan-sample-cap` un-tagged rows for cycle-error diagnostics."
  []
  (t2/query
   {:select [:source_id :source_parent_id :source_fk_target_id]
    :from   [:metabase_field_import]
    :where  [:= :depth nil]
    :limit  orphan-sample-cap}))

;; The fixpoint loop terminates on convergence (no untagged rows) or a
;; no-progress round. The `assert-no-orphan-refs!` pre-condition is what lets
;; us read no-progress as a cycle: with orphans already ruled out, a row that
;; can never be tagged must be part of one.
(defn compute-staging-depth!
  "Tag every `metabase_field_import` row with a non-NULL `depth`: 0 for roots
  (no parent, no fk_target ref), `d` for rows whose deps are all at depth
  < `d`. Returns the maximum depth in staging.

  Pre-condition: [[assert-no-orphan-refs!]] must have run successfully.

  Throws `:cycle-in-field-graph` if rows can't be tagged (a reference cycle)
  or `:depth-tagging-cap-exceeded` if the loop runs past [[depth-iteration-cap]]."
  []
  (mark-roots-at-depth-zero!)
  (loop [d 1]
    (let [before (untagged-staging-row-count)]
      (cond
        (zero? before)
        nil

        (>= d depth-iteration-cap)
        (throw (ex-info (format "metadata-file-import: depth-tagging exceeded cap of %d iterations" depth-iteration-cap)
                        {:kind                  :depth-tagging-cap-exceeded
                         :iterations            d
                         :remaining-rows-count  before
                         :remaining-rows-sample (untagged-staging-row-sample)}))

        :else
        (do
          (mark-rows-at-depth! d)
          (let [after (untagged-staging-row-count)]
            (if (= before after)
              (throw (ex-info (format "metadata-file-import: %d staging row(s) could not be tagged with depth — cycle in file's parent/fk_target reference graph"
                                      after)
                              {:kind                  :cycle-in-field-graph
                               :remaining-rows-count  after
                               :iterations            d
                               :remaining-rows-sample (untagged-staging-row-sample)}))
              (recur (inc d))))))))
  (or (:max (first (t2/query {:select [[[:max :depth] :max]]
                              :from   [:metabase_field_import]})))
      0))

;;; ============================== Per-depth field merge ==============================

(def ^:private field-clobber-cols
  "The field payload columns the importer owns: on a matched row they are
  overwritten from the file's values (the import is an alternate sync)."
  ;; Each is also its staging column name, so [[update-matched-fields-at-depth!]]
  ;; can build the SET from identically-named correlated subqueries.
  [:base_type :database_type :description
   :effective_type :semantic_type :coercion_strategy :nfc_path])

(defn- target-id-clobber-subquery
  "Correlated subquery yielding `staging-col`'s value from the staging row
  that resolved to this `metabase_field`."
  [staging-col]
  {:select   [(keyword (str "fi." (name staging-col)))]
   :from     [[:metabase_field_import :fi]]
   :where    [:= :fi.target_id :metabase_field.id]
   ;; ORDER BY + LIMIT 1: two staging rows can resolve to the same target_id
   ;; (GHY-3549); pick one deterministically rather than erroring.
   :order-by [[:fi.source_id :asc]]
   :limit    1})

(def ^:private field-payload-changed-predicate
  "True when a matched `metabase_field` row's observable payload differs from
  its staging row — the predicate behind the merge UPDATE's skip-if-unchanged
  behavior."
  ;; Coalesce-with-sentinel is the portable NULL-safe `IS DISTINCT FROM`:
  ;; empty string for text columns, -1 (never a real id) for FK ids.
  [[:!= [:coalesce :metabase_field.base_type         [:inline ""]]   [:coalesce :fi.base_type         [:inline ""]]]
   [:!= [:coalesce :metabase_field.database_type     [:inline ""]]   [:coalesce :fi.database_type     [:inline ""]]]
   [:!= [:coalesce :metabase_field.description       [:inline ""]]   [:coalesce :fi.description       [:inline ""]]]
   ;; `effective_type` coalesces against `base_type`: the export omits it when
   ;; the two are equal, and the app reads NULL effective_type as base_type.
   [:!= [:coalesce :metabase_field.effective_type    :metabase_field.base_type]
    [:coalesce :fi.effective_type                :fi.base_type]]
   [:!= [:coalesce :metabase_field.semantic_type     [:inline ""]]   [:coalesce :fi.semantic_type     [:inline ""]]]
   [:!= [:coalesce :metabase_field.coercion_strategy [:inline ""]]   [:coalesce :fi.coercion_strategy [:inline ""]]]
   [:!= [:coalesce :metabase_field.nfc_path          [:inline ""]]   [:coalesce :fi.nfc_path          [:inline ""]]]
   ;; staging's FK column is `target_fk_target_id`, not `fk_target_field_id`.
   [:!= [:coalesce :metabase_field.fk_target_field_id [:inline -1]]  [:coalesce :fi.target_fk_target_id [:inline -1]]]
   ;; `active` compares against TRUE — the merge SET always sets it TRUE.
   [:!= :metabase_field.active                       [:inline true]]])

(defn resolve-target-table-ids-for-fields-in-staging!
  "Populate `metabase_field_import.target_table_id` by joining through
  `metabase_table_import.source_id → metabase_table_import.target_id`.

  Pre-condition: `metabase_table_import.target_id` must be populated
  (via [[resolve-target-table-ids-in-staging!]]) for both matched and
  newly-inserted target rows.

  Field rows whose source table has no target (orphan-source-database
  case) keep `target_table_id NULL`."
  []
  (t2/query
   {:update :metabase_field_import
    :set    {:target_table_id
             {:select [:ti.target_id]
              :from   [[:metabase_table_import :ti]]
              :where  [:= :ti.source_id :metabase_field_import.source_table_id]}}}))

(defn fill-target-parent-ids-at-depth!
  "Populate `target_parent_id` for depth-`d` staging rows by self-joining
  staging on `source_parent_id → source_id` and reading the parent's
  `target_id`. Pre-condition: all prior-depth staging rows have `target_id`
  resolved (the depth walk processes lower depths first, so this is
  guaranteed when called in order)."
  [d]
  ;; Same MySQL same-table-in-UPDATE workaround as [[mark-rows-at-depth!]].
  (let [parent-source (case (mdb/db-type)
                        :mysql {:select [:source_id :target_id]
                                :from   [:metabase_field_import]}
                        :metabase_field_import)]
    (t2/query
     {:update :metabase_field_import
      :set    {:target_parent_id
               {:select [:p.target_id]
                :from   [[parent-source :p]]
                :where  [:= :p.source_id :metabase_field_import.source_parent_id]}}
      :where  [:and
               [:= :metabase_field_import.depth d]
               [:not= :metabase_field_import.source_parent_id nil]]})))

(defn fill-target-fk-target-ids-at-depth!
  "Populate `target_fk_target_id` for depth-`d` staging rows by self-joining
  staging on `source_fk_target_id → source_id`."
  [d]
  ;; Same MySQL same-table-in-UPDATE workaround as [[mark-rows-at-depth!]].
  (let [fk-source (case (mdb/db-type)
                    :mysql {:select [:source_id :target_id]
                            :from   [:metabase_field_import]}
                    :metabase_field_import)]
    (t2/query
     {:update :metabase_field_import
      :set    {:target_fk_target_id
               {:select [:f.target_id]
                :from   [[fk-source :f]]
                :where  [:= :f.source_id :metabase_field_import.source_fk_target_id]}}
      :where  [:and
               [:= :metabase_field_import.depth d]
               [:not= :metabase_field_import.source_fk_target_id nil]]})))

(defn resolve-target-field-ids-at-depth!
  "Set `target_id` for depth-`d` staging rows by natural-key match against `metabase_field`. Matches
  by `(target_table_id, name, target_parent_id)` with NULL-safe parent comparison (a staging row with
  no parent matches only against `metabase_field.parent_id IS NULL`). Skips defective duplicates on
  the target side.

  Run twice per depth — once before the UPDATE/INSERT step (to identify matches for the clobber path)
  and once after (to capture INSERT ids so higher-depth rows can find them as parents/FK targets)."
  [d]
  (t2/query
   {:update :metabase_field_import
    :set    {:target_id
             ;; MIN(f.id) tiebreaker — `metabase_field` has no uniqueness
             ;; constraint on `(table_id, name, parent_id)` (GHY-3549).
             {:select [[[:min :f.id]]]
              :from   [[:metabase_field :f]]
              :where  [:and
                       [:= :f.table_id :metabase_field_import.target_table_id]
                       [:= :f.name :metabase_field_import.name]
                       [:or
                        [:and [:= :metabase_field_import.target_parent_id nil]
                         [:= :f.parent_id nil]]
                        [:= :f.parent_id :metabase_field_import.target_parent_id]]
                       [:= :f.is_defective_duplicate [:inline false]]]}}
    :where  [:and
             [:= :metabase_field_import.depth d]
             [:= :metabase_field_import.target_id nil]]}))

(defn update-matched-fields-at-depth!
  "Bring the live `metabase_field` rows that depth-`d` staging matched into line with the file. Rows
  whose payload already matches staging are left untouched."
  [d]
  (t2/query
   {:update :metabase_field
    ;; `fk_target_field_id` reads staging's `target_fk_target_id` — it isn't
    ;; part of the natural-key match, so a matched field's FK can drift.
    :set    (-> (into {} (map (fn [c] [c (target-id-clobber-subquery c)])) field-clobber-cols)
                (assoc :fk_target_field_id (target-id-clobber-subquery :target_fk_target_id)
                       :active             [:inline true]
                       :updated_at         :%now))
    :where  [:and
             [:= :metabase_field.is_defective_duplicate [:inline false]]
             ;; Scope the outer walk to the ~staging-row-count IDs at depth `d`.
             ;; Without this, PG starts from `metabase_field` and probes staging
             ;; per row — a full scan on an appdb with millions of field rows.
             [:in :metabase_field.id {:select [:target_id]
                                      :from   [:metabase_field_import]
                                      :where  [:and
                                               [:= :depth d]
                                               [:not= :target_id nil]]}]
             ;; Skip-if-unchanged: only touch rows whose payload actually differs.
             [:exists {:select [[[:inline 1]]]
                       :from   [[:metabase_field_import :fi]]
                       :where  [:and
                                [:= :fi.target_id :metabase_field.id]
                                [:= :fi.depth d]
                                (into [:or] field-payload-changed-predicate)]}]]}))

(defn insert-new-fields-at-depth!
  "INSERT `metabase_field` for depth-`d` staging rows that didn't match a
  live row (`target_id IS NULL`). The new row's `parent_id` and
  `fk_target_field_id` come from staging's `target_parent_id` /
  `target_fk_target_id` — populated earlier in this depth's iteration.

  Rows whose `target_table_id IS NULL` (source table didn't match target)
  are silently dropped. Rows whose `source_parent_id IS NOT NULL` but
  `target_parent_id IS NULL` are also dropped — that's the case where the
  parent field's table didn't match target, cascading the orphan downward."
  [d]
  (t2/query
   {:insert-into
    [[:metabase_field [:table_id :name :base_type :database_type :description
                       :effective_type :semantic_type :coercion_strategy
                       :nfc_path :parent_id :fk_target_field_id
                       :is_defective_duplicate :active :created_at :updated_at]]
     {:select [:fi.target_table_id :fi.name :fi.base_type :fi.database_type :fi.description
               :fi.effective_type :fi.semantic_type :fi.coercion_strategy
               :fi.nfc_path :fi.target_parent_id :fi.target_fk_target_id
               [[:inline false]] [[:inline true]] :%now :%now]
      :from   [[:metabase_field_import :fi]]
      :where  [:and
               [:= :fi.depth d]
               [:= :fi.target_id nil]
               [:not= :fi.target_table_id nil]
               [:or
                [:= :fi.source_parent_id nil]
                [:not= :fi.target_parent_id nil]]]}]}))

(defn merge-fields-by-depth!
  "Merge `metabase_field_import` into `metabase_field`, walking depth 0 to
  max-depth so a row's parents and FK targets are resolved before the row
  itself. All depths run inside one transaction.

  Pre-conditions: [[compute-staging-depth!]] has populated `depth` and
  [[resolve-target-table-ids-for-fields-in-staging!]] has populated
  `target_table_id`."
  []
  (let [max-d (or (:max (first (t2/query {:select [[[:max :depth] :max]]
                                          :from   [:metabase_field_import]})))
                  0)]
    ;; One transaction across all depths — t2 joins the import's outer txn.
    (t2/with-transaction [_]
      (doseq [d (range (inc max-d))]
        (fill-target-parent-ids-at-depth! d)
        (fill-target-fk-target-ids-at-depth! d)
        (resolve-target-field-ids-at-depth! d)
        (update-matched-fields-at-depth! d)
        (insert-new-fields-at-depth! d)
        ;; Re-resolve to capture INSERT ids, so higher depths can find these
        ;; rows as parents / FK targets.
        (resolve-target-field-ids-at-depth! d)))))
