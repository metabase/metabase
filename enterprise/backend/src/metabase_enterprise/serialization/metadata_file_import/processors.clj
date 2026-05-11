(ns metabase-enterprise.serialization.metadata-file-import.processors
  "SQL building blocks for the metadata file importer's drain-then-merge flow.

  Three groups of functions:

    - **Databases** ([[process-databases!]]): per-batch in-Clojure match by
      natural key (name, engine). No live writes; returns matched/no-match
      result maps for the orchestrator to aggregate.
    - **Drain** ([[drain-tables-batch!]] / [[drain-fields-batch!]]): per-batch
      handlers writing wire rows into `metabase_table_import` /
      `metabase_field_import` verbatim — source-side integer IDs go into
      `source_*_id` staging columns.
    - **Pre-flight** ([[assert-no-orphan-refs!]]) and **depth tagging**
      ([[compute-staging-depth!]]): post-drain validation and graph-walk.
      Together they make the strict-consistency assumption load-bearing —
      orphan refs become hard errors, cycles are caught, and the merge can
      iterate by depth without fallback paths.
    - **Merge** (atomic, designed to compose under one outer
      `t2/with-transaction`): [[resolve-target-table-ids-in-staging!]],
      [[merge-tables!]], [[resolve-target-table-ids-for-fields-in-staging!]],
      then [[merge-fields-by-depth!]] which loops the per-depth helpers
      (`fill-target-parent-ids-at-depth!`,
      `fill-target-fk-target-ids-at-depth!`,
      `resolve-target-field-ids-at-depth!`, `update-matched-fields-at-depth!`,
      `insert-new-fields-at-depth!`).

  Driver-blind: every SQL statement goes through `t2/query` with a HoneySQL
  map; correlated subqueries instead of `UPDATE … FROM` for cross-dialect
  portability.

  Errors propagate as `ex-info` with `:kind` for typed failure handling
  (`:invalid_input`, `:file_incomplete`, `:cycle_in_field_graph`,
  `:depth_tagging_cap_exceeded`)."
  (:require
   [malli.error :as me]
   [metabase-enterprise.serialization.metadata-file-import.schemas :as schemas]
   [metabase.models.humanization :as humanization]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def import-batch-size
  "Row batch size shared by all processors."
  500)

;;; ============================== Validation ==============================

(defn- validate-line!
  "Validate `line` against the registered Malli `schema-ref`. Succeeds silently when valid
  (cached validator — fast path); on failure throws an `ex-info` with `:kind :invalid_input`,
  `:line`, a humanized `:detail`, and `extras` merged into the ex-data for echo-key attribution."
  [schema-ref line-num line extras]
  (when-not (mr/validate schema-ref line)
    (let [humanized (me/humanize (mr/explain schema-ref line))]
      (throw (ex-info (format "invalid_input: %s" (name schema-ref))
                      (merge extras
                             {:kind   :invalid_input
                              :line   line-num
                              :detail (pr-str humanized)}))))))

;;; ============================== Staging tables ==============================

(defn clear-staging-tables!
  "Delete every row from `metabase_table_import` and `metabase_field_import`.
  Called by [[with-staging-tables]] on entry and on exit (try/finally) so a
  crashed prior attempt cannot leak rows into the next run.

  Goes through `t2/query` with a HoneySQL `:delete-from` map — t2 picks the
  right dialect-specific shape; no driver dispatch needed."
  []
  (t2/query {:delete-from :metabase_table_import})
  (t2/query {:delete-from :metabase_field_import}))

(defmacro with-staging-tables
  "Run `body` with the staging tables pre-cleared, and clear them again on exit.

  The exit clear is a `finally` so a thrown exception from the body still
  wipes staging — both branches of the contract matter:

    - **Entry clear** ensures the body sees an empty staging area regardless
      of any leftover rows from a crashed prior attempt.
    - **Exit clear** ensures we leak nothing to the next attempt, whether the
      body returned normally or threw.

  The body's exception is re-raised after the finally runs."
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

  `:source-id` is the wire row's `:id` (the source appdb's database id, an
  integer). `:name` is also surfaced so the caller can build a
  `source-id → name` map for the tables/fields handlers' `db_name`
  denormalization.

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

(defn resolve-target-table-ids-in-staging!
  "Set `metabase_table_import.target_id` to the int id of the matching
  `metabase_table` row for every staging row whose match key resolves. The
  match key is `(db_name, schema, name)` against `(d.name, t.schema, t.name)`,
  restricted to active, non-defective live rows.

  Lets [[merge-tables!]]'s UPDATE key on a single column instead of repeating
  the 2-table-join match in each correlated subquery. Rows that do not match
  keep `target_id` NULL — `merge-tables!`'s INSERT picks up exactly those
  rows. Inactive matches are deliberately not resolved so a re-import after
  a deactivation creates a fresh active row.

  Idempotent — running again with the same staging contents produces the
  same assignments. Uses a correlated subquery in SET so it serializes
  portably across PG / H2 / MySQL via `t2/query`."
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

  The `set-new-table-permissions!` `:after-insert` hook on `:model/Table` does
  not fire here because the INSERT goes through the raw table keyword
  (`:metabase_table`) rather than the model. This preserves today's
  per-table-permission gap; batched-grant work is tracked separately.

  Composes safely inside a larger transaction: Toucan2's `t2/with-transaction`
  joins an outer txn rather than creating a savepoint, so when an outer caller
  wraps several merge steps in one txn, this function's inner txn participates
  in the outer's all-or-nothing semantics."
  []
  (t2/with-transaction [_]
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
    ;; INSERT rows with no matching live row (target_id IS NULL)
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

(defn- encode-path-or-nil
  "Encode a path coll (e.g., a wire `:nfc_path` or the middle of a portable id)
  as a JSON string, matching `metabase_field.nfc_path` storage convention. NULL
  for empty/nil; JSON-encoded array string otherwise."
  [coll]
  (when (seq coll) (json/encode (vec coll))))

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

(defn- orphan-count
  "Number of `metabase_field_import` rows whose `column-key` (a `:source_*_id`
  column) is non-null but doesn't reference any other row's `source_id`."
  [column-key]
  (t2/count :metabase_field_import
            {:where [:and
                     [:not= column-key nil]
                     [:not-in column-key
                      {:select [:source_id] :from [:metabase_field_import]}]]}))

(defn- orphan-sample
  "Up to `orphan-sample-cap` `[source_id, <column-key>]` pairs for orphan rows."
  [column-key]
  (t2/query
   {:select [:source_id column-key]
    :from   [:metabase_field_import]
    :where  [:and
             [:not= column-key nil]
             [:not-in column-key
              {:select [:source_id] :from [:metabase_field_import]}]]
    :limit  orphan-sample-cap}))

(defn assert-no-orphan-refs!
  "Pre-flight check after drain: every staging field row's `source_parent_id`
  and `source_fk_target_id` must reference another staging row's `source_id`.
  Throws `ex-info` with `:kind :file_incomplete` and a sample of orphan rows
  in the error data when any orphan exists.

  This is the cheap one-shot check that makes the strict-consistency
  invariant load-bearing — orphans are hard errors, not warnings, and the
  depth-walk merge can rely on every cross-row reference being resolvable
  within staging."
  []
  (let [parent-count (orphan-count :source_parent_id)
        fk-count     (orphan-count :source_fk_target_id)]
    (when (or (pos? parent-count) (pos? fk-count))
      (throw (ex-info (format "metadata-file-import: file is incomplete — %d orphan parent ref(s), %d orphan fk-target ref(s)"
                              parent-count fk-count)
                      {:kind                   :file_incomplete
                       :orphan-parent-count    parent-count
                       :orphan-fk-target-count fk-count
                       :orphan-parent-sample   (when (pos? parent-count) (orphan-sample :source_parent_id))
                       :orphan-fk-target-sample (when (pos? fk-count) (orphan-sample :source_fk_target_id))})))))

;;; ============================== Depth tagging ==============================

(def depth-iteration-cap
  "Sentinel cap on the depth-tagging fixpoint loop. Real Metabase data has
  parent chains ≤ 3 deep; in practice convergence is 2-4 rounds. The cap is a
  safety belt — if a workload ever exceeds it, the algorithm itself is the
  bug, not the data. Hitting the cap throws `:cycle_in_field_graph` with the
  un-tagged sample for diagnostics."
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
  exits — the strict-consistency invariant from `assert-no-orphan-refs!`
  guarantees this can only happen via a cycle (e.g., X.parent_id = Y AND
  Y.parent_id = X).

  Pre-condition: [[assert-no-orphan-refs!]] must have run successfully. Without
  the strict-consistency guarantee, the cycle vs. orphan distinction breaks
  down (a row whose parent doesn't exist in the file would also be untagged,
  but for a different reason).

  Returns the maximum depth currently in staging (queried after tagging
  completes). This is idempotent — re-running on already-tagged staging
  returns the same max depth. Useful for the depth-walk merge to know how
  many levels to iterate."
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

  Pre-condition: [[resolve-target-table-ids-in-staging!]] must have been
  called *twice* — once before [[merge-tables!]] (for the UPDATE/INSERT
  decision) and once after (to capture INSERT-assigned ids back into table
  staging). Without the second call, table rows that were just inserted
  have `target_id IS NULL` in table staging, and the field rows that
  reference them would get `target_table_id IS NULL`.

  Field rows whose source table has no target (orphan-source-database
  case) keep `target_table_id NULL` and are silently skipped by both the
  resolve and the merge — same behavior as Iteration 3."
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
  differs — a re-import with identical payload is a true no-op."
  [d]
  (t2/query
   {:update :metabase_field
    :set    (-> (into {} (map (fn [c] [c (target-id-clobber-subquery c)])) field-clobber-cols)
                (assoc :active     [:inline true]
                       :updated_at :%now))
    :where  [:and
             [:= :metabase_field.is_defective_duplicate [:inline false]]
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

