(ns metabase-enterprise.serialization.metadata-file-import.processors
  "SQL building blocks for the metadata file importer's drain-then-merge flow.

  Driver-blind: every SQL statement goes through `t2/query` with a HoneySQL
  map; correlated subqueries instead of `UPDATE … FROM` for cross-dialect
  portability.

  Errors propagate as `ex-info` with `:kind` for typed failure handling
  (`:invalid_input`, `:file_incomplete`, `:cycle_in_field_graph`,
  `:depth_tagging_cap_exceeded`)."
  (:require
   [malli.error :as me]
   [metabase-enterprise.serialization.metadata-file-import.schemas :as schemas]
   [metabase.app-db.core :as mdb]
   [metabase.models.humanization :as humanization]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.sql PreparedStatement Types)))

(set! *warn-on-reflection* true)

(def import-batch-size
  "Row batch size shared by all processors. Larger batches make per-batch
  INSERT cost super-linear (WAL/index overhead grows with batch size
  against a filling staging table); smaller batches pay parser/handler-
  dispatch overhead that swamps the per-row savings. 250 looked like a
  sweet spot in local benchmarks."
  250)

;;; ============================== Validation ==============================

(defn- validate-line!
  "Validate `line` against the registered Malli `schema-ref`. On failure
  throws `ex-info` with `:kind :invalid_input`, `:line`, a humanized
  `:detail`, and `extras` merged into the ex-data."
  [schema-ref line-num line extras]
  (when-not (mr/validate schema-ref line)
    (let [humanized (me/humanize (mr/explain schema-ref line))]
      (throw (ex-info (format "Invalid %s row on line %d" (name schema-ref) line-num)
                      (merge extras
                             {:kind   :invalid_input
                              :line   line-num
                              :detail (pr-str humanized)}))))))

;;; ============================== Staging tables ==============================

(defn clear-staging-tables!
  "Empty `metabase_table_import` and `metabase_field_import`."
  []
  ;; TRUNCATE (not DELETE) so multiple imports in one process lifetime don't
  ;; accumulate dead tuples in staging — autovacuum won't fire mid-import.
  ;; HoneySQL's :truncate compiles to TRUNCATE TABLE on PG, H2, and MySQL.
  ;; Called outside any outer transaction, so MySQL's implicit-commit-on-
  ;; TRUNCATE doesn't break composition.
  (t2/query {:truncate :metabase_table_import})
  (t2/query {:truncate :metabase_field_import}))

(defn analyze-staging-tables!
  "Refresh planner statistics on `metabase_table_import` and
  `metabase_field_import`."
  []
  ;; Autovacuum's stats refresh won't fire mid-import; without explicit
  ;; ANALYZE, PG's planner falls back to default selectivity and picks
  ;; plans that scan far more pages than needed.
  ;;
  ;; Driver-conditional: ANALYZE syntax differs (PG: `ANALYZE name`,
  ;; MySQL: `ANALYZE TABLE name`, H2: whole-DB `ANALYZE`). H2 is dev/test
  ;; only and analyzing the whole DB is cheap; PG is where the win
  ;; matters in practice.
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
  "Run `body` with staging cleared on entry and on exit (try/finally,
  so a thrown exception from `body` still wipes staging)."
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

(defn drain-tables-batch!
  "Per-batch handler for `:tables`: validate each row, denormalize `db_name`
  from the in-memory `databases-by-source-id` map (built by the databases
  handler), and bulk-insert into `metabase_table_import`. Suitable as a
  callback for `parsers/stream-keyed-arrays!` once partial-applied with
  `databases-by-source-id`."
  [databases-by-source-id batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/table-info ln line {:source-id (:id line)}))
  (when (seq batch)
    (let [rows (mapv (fn [[_ {:keys [id db_id schema name description]}]]
                       {:source_id    id
                        :source_db_id db_id
                        :db_name      (get databases-by-source-id db_id)
                        :schema       schema
                        :name         name
                        :description  description
                        :display_name (humanization/name->human-readable-name name)})
                     batch)]
      (t2/insert! :metabase_table_import rows))))

(defn- encode-path-or-nil
  "Encode an `:nfc_path` coll as a JSON string, matching the
  `metabase_field.nfc_path` storage convention. NULL for empty/nil;
  JSON-encoded array string otherwise."
  [coll]
  (when (seq coll) (json/encode (vec coll))))

;;; ============================== JDBC drain (perf path) ==============================
;;;
;;; Hand-rolled JDBC `executeBatch` against single per-staging-table prepared
;;; statements. Used by the loader's `drain-and-match-databases!` to bypass
;;; the t2/insert! + HoneySQL VALUES formatting overhead — measured ~15×
;;; slower per row than PG's COPY floor on multi-million-row drains.

(def tables-insert-sql
  "Parameterized INSERT for `metabase_table_import`. Column order matches the
  `set*-batch!` parameter-binding order in [[drain-tables-batch-jdbc!]]."
  (str "INSERT INTO metabase_table_import"
       " (source_id, source_db_id, db_name, schema, name, description, display_name)"
       " VALUES (?, ?, ?, ?, ?, ?, ?)"))

(def fields-insert-sql
  "Parameterized INSERT for `metabase_field_import`. Column order matches the
  `set*-batch!` parameter-binding order in [[drain-fields-batch-jdbc!]]."
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

(defn resolve-target-table-ids-in-staging!
  "Set `metabase_table_import.target_id` to the int id of the matching
  `metabase_table` row for every staging row whose match key resolves. The
  match key is `(db_name, schema, name)` against `(d.name, t.schema, t.name)`,
  restricted to active, non-defective live rows.

  Rows that do not match keep `target_id` NULL. Inactive matches are
  deliberately not resolved so a re-import after a deactivation creates a
  fresh active row.

  Idempotent — running again with the same staging contents produces the
  same assignments."
  []
  (t2/query
   {:update :metabase_table_import
    :set    {:target_id
             {:select [:t.id]
              :from   [[:metabase_table :t]]
              :join   [[:metabase_database :d] [:= :d.id :t.db_id]]
              :where  [:and
                       [:= :metabase_table_import.db_name :d.name]
                       [:= [:coalesce :t.schema [:inline ""]]
                        [:coalesce :metabase_table_import.schema [:inline ""]]]
                       [:= :t.name :metabase_table_import.name]
                       [:= :t.is_defective_duplicate [:inline false]]
                       [:= :t.active [:inline true]]]}}}))

(defn merge-tables!
  "Merge `metabase_table_import` into `metabase_table` atomically.

  Two SQL statements wrapped in a single `t2/with-transaction`:

    1. **UPDATE** rows whose `target_id` resolved (i.e., a matching active
       live row exists). Clobbers `description` from staging, bumps
       `updated_at`. Each SET column is a single-key lookup on
       `staging.target_id`.
    2. **INSERT** rows whose `target_id` is NULL — no active live row
       matched. Sets `active=true` and `data_layer='internal'`; lets column
       defaults handle `field_order`, `initial_sync_status`, etc.

  Order matters: UPDATE first so on a clean-schema import the UPDATE matches
  nothing (fast no-op) and the INSERT writes each row exactly once.

  Pre-condition: [[resolve-target-table-ids-in-staging!]] must have run.
  Without that, every staging row's `target_id` is NULL — you'd get correct
  INSERTs but no clobber.

  The INSERT JOINs `metabase_database` on `db_name`, so staging rows whose
  source DB has no target appdb match are silently dropped.

  Per-table permissions aren't set on insert. TODO: batched-grant fix."
  []
  (t2/with-transaction [_]
    ;; t2 joins an outer txn rather than creating a savepoint, so wrapping
    ;; this call in a larger transaction is safe.

    ;; UPDATE matched rows first (clobber description, bump updated_at).
    ;; Skip-if-unchanged: the EXISTS subquery additionally requires that
    ;; description actually differs (NULL-safe via COALESCE-with-empty-
    ;; string), so a re-import with identical description is a true no-op
    ;; — no UPDATE fires, no dead tuple. updated_at is deliberately NOT
    ;; in the predicate (otherwise the UPDATE would always fire,
    ;; defeating the optimization).
    (t2/query
     {:update :metabase_table
      :set    {:description {:select [:it.description]
                             :from   [[:metabase_table_import :it]]
                             :where  [:= :it.target_id :metabase_table.id]}
               :updated_at :%now}
      :where  [:and
               [:= :metabase_table.is_defective_duplicate [:inline false]]
               [:= :metabase_table.active [:inline true]]
               [:exists {:select [[[:inline 1]]]
                         :from   [[:metabase_table_import :it]]
                         :where  [:and
                                  [:= :it.target_id :metabase_table.id]
                                  [:!= [:coalesce :metabase_table.description [:inline ""]]
                                   [:coalesce :it.description             [:inline ""]]]]}]]})
    ;; INSERT rows with no matching live row (target_id IS NULL).
    ;; Goes through the raw :metabase_table keyword (not :model/Table) to
    ;; skip the :after-insert hook — that hook schedules Quartz sync triggers
    ;; we don't want and calls set-new-table-permissions!, hence the gap
    ;; documented above.
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
        :where  [:= :it.target_id nil]}]})))

;;; ============================== fields — drain + merge ==============================

(defn drain-fields-batch!
  "Per-batch handler for `:fields`: validate each row, then bulk-insert into
  `metabase_field_import`. Wire integer ids (`:id`, `:table_id`, `:parent_id`,
  `:fk_target_field_id`) go into the matching `source_*_id` columns verbatim;
  resolution to target ids happens later in the merge phase."
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/field-info ln line {:source-id (:id line)}))
  (when (seq batch)
    (let [rows (mapv (fn [[_ {:keys [id table_id parent_id fk_target_field_id
                                     name base_type database_type
                                     effective_type semantic_type coercion_strategy
                                     description nfc_path]}]]
                       {:source_id           id
                        :source_table_id     table_id
                        :source_parent_id    parent_id
                        :source_fk_target_id fk_target_field_id
                        :name                name
                        :base_type           base_type
                        :database_type       database_type
                        :effective_type      effective_type
                        :semantic_type       semantic_type
                        :coercion_strategy   coercion_strategy
                        :description         description
                        :nfc_path            (encode-path-or-nil nfc_path)})
                     batch)]
      (t2/insert! :metabase_field_import rows))))

;;; ============================== Pre-flight orphan check ==============================

(def ^:private orphan-sample-cap
  "How many orphan rows to surface in the error data when bailing out. Enough
  to give the operator a starting point for tracing back to the source file
  without ballooning the exception payload."
  10)

(defn- orphan-not-exists-predicate
  "WHERE-clause fragment matching rows whose `column-key` (a `:source_*_id`
  column) is non-null but doesn't reference any other staging row's
  `source_id`. Uses correlated NOT EXISTS rather than NOT IN — at 9M+
  rows PG cannot plan `NOT IN (subquery)` well (NULL-semantics force
  full-materialization of the inner set) and the query effectively
  never terminates. NOT EXISTS resolves to a proper anti-join via the
  PK index on `source_id`, O(N log N) instead of O(N²)."
  [column-key]
  ;; Inner subquery aliased as `:s` so the unqualified column-key in
  ;; the inner WHERE has to qualify to the outer table — both tables
  ;; have `source_parent_id` / `source_fk_target_id`.
  (let [outer-col (keyword (str "metabase_field_import." (name column-key)))]
    [:and
     [:not= column-key nil]
     [:not [:exists
            {:select [[[:inline 1]]]
             :from   [[:metabase_field_import :s]]
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
  `:kind :file_incomplete` and a sample of orphan rows in the error data
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
                      {:kind                   :file_incomplete
                       :orphan-parent-count    parent-count
                       :orphan-parent-sample   (orphan-sample :source_parent_id)})))))

(defn null-orphan-fk-target-refs!
  "Find staging rows whose `source_fk_target_id` points at a `source_id`
  not present in staging, and NULL the `source_fk_target_id` column on
  those rows (and their corresponding `target_fk_target_id` for safety).
  Returns `{:count N :sample [...]}` when at least one row was scrubbed,
  `{:count 0}` otherwise.

  Why NULL instead of abort: fk_target refs that cross a hidden/archived
  table boundary on the source side (the table is `active=false` or
  `visibility_type='hidden'`) survive in `metabase_field` but get filtered
  out by the export's table-visibility join. The exported file then contains
  fk_target refs whose targets aren't emitted — a real-data shape we observe
  in production appdbs. Treating these as fatal would block legitimate
  imports; treating them as no-fk is the lossless choice for the importer."
  []
  (let [n (orphan-count :source_fk_target_id)]
    (if (zero? n)
      {:count 0}
      (let [sample (orphan-sample :source_fk_target_id)]
        (t2/query
         {:update :metabase_field_import
          :set    {:source_fk_target_id nil
                   :target_fk_target_id nil}
          :where  (orphan-not-exists-predicate :source_fk_target_id)})
        {:count n :sample sample}))))

;;; ============================== Depth tagging ==============================

(def depth-iteration-cap
  "Sentinel cap on the depth-tagging fixpoint loop. Field parent chains
  are shallow in practice (a few levels at most), so 50 is a comfortable
  safety belt — if a workload ever exceeds it, the algorithm itself is
  the bug, not the data. Hitting the cap throws `:cycle_in_field_graph`
  with the un-tagged sample for diagnostics."
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
  (t2/query
   {:update :metabase_field_import
    :set    {:depth d}
    :where  [:and
             [:= :metabase_field_import.depth nil]
             [:or
              [:= :metabase_field_import.source_parent_id nil]
              [:exists {:select [[[:inline 1]]]
                        :from   [[:metabase_field_import :p]]
                        :where  [:and
                                 [:= :p.source_id :metabase_field_import.source_parent_id]
                                 [:not= :p.depth nil]
                                 [:< :p.depth d]]}]]
             [:or
              [:= :metabase_field_import.source_fk_target_id nil]
              [:exists {:select [[[:inline 1]]]
                        :from   [[:metabase_field_import :f]]
                        :where  [:and
                                 [:= :f.source_id :metabase_field_import.source_fk_target_id]
                                 [:not= :f.depth nil]
                                 [:< :f.depth d]]}]]]}))

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

(defn compute-staging-depth!
  "Tag every `metabase_field_import` row with a non-NULL `depth` value. depth=0
  is roots (no parent, no fk_target ref). depth d is rows whose deps are all
  already at depth < d. Iterates until convergence (no rows untagged) or a
  no-progress round (which signals a cycle in the file's reference graph).

  Throws `:cycle_in_field_graph` if any rows remain untagged after the loop
  exits.

  Pre-condition: [[assert-no-orphan-refs!]] must have run successfully — that
  invariant is what guarantees no-progress means cycle (vs. orphan).

  Returns the maximum depth currently in staging."
  []
  (mark-roots-at-depth-zero!)
  (loop [d 1]
    (let [before (untagged-staging-row-count)]
      (cond
        (zero? before)
        nil

        (>= d depth-iteration-cap)
        (throw (ex-info (format "metadata-file-import: depth-tagging exceeded cap of %d iterations" depth-iteration-cap)
                        {:kind                  :depth_tagging_cap_exceeded
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
                              {:kind                  :cycle_in_field_graph
                               :remaining-rows-count  after
                               :iterations            d
                               :remaining-rows-sample (untagged-staging-row-sample)}))
              (recur (inc d))))))))
  (or (:max (first (t2/query {:select [[[:max :depth] :max]]
                              :from   [:metabase_field_import]})))
      0))

;;; ============================== Per-depth field merge ==============================

(def ^:private field-clobber-cols
  "Columns clobbered on UPDATE in [[update-matched-fields-at-depth!]]. The
  matched-row payload is overwritten regardless of whether values changed
  (this import is an alternate sync). `parent_id` and `fk_target_field_id`
  are not clobbered: they're part of the natural-key match (`parent_id`) or
  inherent to the matched row already (`fk_target_field_id` — clobbered by
  the FK-fill path below)."
  [:base_type :database_type :description
   :effective_type :semantic_type :coercion_strategy :nfc_path])

(defn- target-id-clobber-subquery
  "Correlated subquery for a single clobber column. The match is a single
  indexed lookup on `staging.target_id` (the per-depth resolve populates
  it just before this UPDATE fires)."
  [col]
  {:select [(keyword (str "fi." (name col)))]
   :from   [[:metabase_field_import :fi]]
   :where  [:= :fi.target_id :metabase_field.id]})

(def ^:private field-payload-changed-predicate
  "OR-block over the clobber-payload columns plus `active`. Used by the
  skip-if-unchanged check on the merge UPDATE: if every observable column
  already matches staging, no UPDATE fires (no dead tuple). Coalesce-with-
  empty-string is the portable NULL-safe equivalent of `IS DISTINCT FROM`
  (PG-only). For `effective_type` we coalesce against `base_type` on both
  sides because the export omits `:effective_type` when it equals
  `:base_type` and the application universally treats `effective_type IS
  NULL` as 'use base_type'. `active` is checked against TRUE since SET sets
  it to TRUE always."
  [[:!= [:coalesce :metabase_field.base_type         [:inline ""]]   [:coalesce :fi.base_type         [:inline ""]]]
   [:!= [:coalesce :metabase_field.database_type     [:inline ""]]   [:coalesce :fi.database_type     [:inline ""]]]
   [:!= [:coalesce :metabase_field.description       [:inline ""]]   [:coalesce :fi.description       [:inline ""]]]
   [:!= [:coalesce :metabase_field.effective_type    :metabase_field.base_type]
    [:coalesce :fi.effective_type                :fi.base_type]]
   [:!= [:coalesce :metabase_field.semantic_type     [:inline ""]]   [:coalesce :fi.semantic_type     [:inline ""]]]
   [:!= [:coalesce :metabase_field.coercion_strategy [:inline ""]]   [:coalesce :fi.coercion_strategy [:inline ""]]]
   [:!= [:coalesce :metabase_field.nfc_path          [:inline ""]]   [:coalesce :fi.nfc_path          [:inline ""]]]
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
  (t2/query
   {:update :metabase_field_import
    :set    {:target_parent_id
             {:select [:p.target_id]
              :from   [[:metabase_field_import :p]]
              :where  [:= :p.source_id :metabase_field_import.source_parent_id]}}
    :where  [:and
             [:= :metabase_field_import.depth d]
             [:not= :metabase_field_import.source_parent_id nil]]}))

(defn fill-target-fk-target-ids-at-depth!
  "Populate `target_fk_target_id` for depth-`d` staging rows by self-joining
  staging on `source_fk_target_id → source_id`."
  [d]
  (t2/query
   {:update :metabase_field_import
    :set    {:target_fk_target_id
             {:select [:f.target_id]
              :from   [[:metabase_field_import :f]]
              :where  [:= :f.source_id :metabase_field_import.source_fk_target_id]}}
    :where  [:and
             [:= :metabase_field_import.depth d]
             [:not= :metabase_field_import.source_fk_target_id nil]]}))

(defn resolve-target-field-ids-at-depth!
  "Set `target_id` for depth-`d` staging rows by natural-key match against
  `metabase_field`. Matches by `(target_table_id, name, target_parent_id)`
  with NULL-safe parent comparison (a staging row with no parent matches
  only against `metabase_field.parent_id IS NULL`). Skips defective
  duplicates on the target side.

  Run twice per depth — once before the UPDATE/INSERT step (to identify
  matches for the clobber path) and once after (to capture INSERT ids so
  higher-depth rows can find them as parents/FK targets)."
  [d]
  (t2/query
   {:update :metabase_field_import
    :set    {:target_id
             {:select [:f.id]
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
  "Clobber-update `metabase_field` from staging rows at depth `d` whose
  `target_id` is set (i.e., natural-key matched a live row). Each SET column
  is a single-key lookup on `staging.target_id`. Skip-if-unchanged: the
  EXISTS subquery additionally requires that at least one observable column
  differs — a re-import with identical payload is a true no-op.

  The `IN` predicate scopes the outer walk of `metabase_field` to just the
  ~staging-row-count IDs at depth `d` rather than a full-table scan. Without
  it, PG's planner starts from `metabase_field` and probes staging per row —
  fine on a small appdb, but on an appdb with millions of unrelated field
  rows the global scan dominates."
  [d]
  (t2/query
   {:update :metabase_field
    :set    (-> (into {} (map (fn [c] [c (target-id-clobber-subquery c)])) field-clobber-cols)
                (assoc :active     [:inline true]
                       :updated_at :%now))
    :where  [:and
             [:= :metabase_field.is_defective_duplicate [:inline false]]
             [:in :metabase_field.id {:select [:target_id]
                                      :from   [:metabase_field_import]
                                      :where  [:and
                                               [:= :depth d]
                                               [:not= :target_id nil]]}]
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
                [:not= :fi.target_parent_id nil]]
               [:or
                [:= :fi.source_fk_target_id nil]
                [:not= :fi.target_fk_target_id nil]]]}]}))

(defn merge-fields-by-depth!
  "Walk staging from depth 0 to max-depth, merging each level's fields into
  `metabase_field` before moving to the next. Each level:

    1. Fill `target_parent_id` from already-resolved staging rows.
    2. Fill `target_fk_target_id` from already-resolved staging rows.
    3. Resolve `target_id` via natural-key match against `metabase_field`.
    4. UPDATE matched rows (clobber payload with skip-if-unchanged).
    5. INSERT unmatched rows (parent_id / fk_target_field_id already
       populated from steps 1 and 2).
    6. Re-resolve `target_id` to capture the INSERT ids so higher-depth
       rows can find these as parents or FK targets.

  Pre-conditions: [[compute-staging-depth!]] has populated `depth` and
  [[resolve-target-table-ids-for-fields-in-staging!]] has populated
  `target_table_id`.

  Composes inside an outer `t2/with-transaction` — Toucan2 joins the outer
  txn so all depths are atomic together."
  []
  (let [max-d (or (:max (first (t2/query {:select [[[:max :depth] :max]]
                                          :from   [:metabase_field_import]})))
                  0)]
    (t2/with-transaction [_]
      (doseq [d (range (inc max-d))]
        (fill-target-parent-ids-at-depth! d)
        (fill-target-fk-target-ids-at-depth! d)
        (resolve-target-field-ids-at-depth! d)
        (update-matched-fields-at-depth! d)
        (insert-new-fields-at-depth! d)
        (resolve-target-field-ids-at-depth! d)))))

