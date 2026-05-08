(ns metabase-enterprise.serialization.metadata-file-import.processors
  "SQL building blocks for the metadata file importer's drain-then-merge flow.

  Three groups of functions:

    - **Phase 1 (databases)**: [[process-databases!]] — per-batch in-Clojure match.
      No live writes; returns a `{:source-id :target-id :status}` eduction.
    - **Drain**: [[drain-tables-into-staging!]] / [[drain-fields-into-staging!]] —
      stream the file into `metabase_table_import` / `metabase_field_import`.
      Decompose portable ids into staging columns. No live writes.
    - **Merge** (atomic, designed to compose under one outer `t2/with-transaction`):
      [[merge-tables!]], [[insert-stubs-where-not-exists!]],
      [[resolve-existing-parents-in-staging!]], [[assert-no-unresolved-parent-refs!]],
      [[merge-fields-pass-1!]], [[merge-fields-pass-2!]],
      [[resolve-fk-target-ids-in-staging!]],
      [[assert-no-unresolved-fk-targets!]], [[merge-fk-targets!]],
      [[warn-on-orphan-staging-rows!]].

  Convention-blind: portable ids are treated as opaque match keys. Driver-blind:
  every SQL statement goes through `t2/query` with a HoneySQL map; correlated
  subqueries instead of `UPDATE … FROM` for cross-dialect portability.

  Errors propagate as `ex-info` with `:kind` for typed failure handling
  (`:invalid_input`, `:stub_resolution_invalidated`, `:fk_target_unresolved`)."
  (:require
   [malli.error :as me]
   [metabase-enterprise.serialization.metadata-file-import.parsers :as parsers]
   [metabase-enterprise.serialization.metadata-file-import.schemas :as schemas]
   [metabase.models.humanization :as humanization]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

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
    `{:source-id <db-name> :target-id M :status :matched}`
    `{:source-id <db-name> :status :no-match :line L :detail S}`

  `:source-id` is the row's `:name` (its portable database id).

  Validation failures throw; lookup misses produce `:no-match` results
  (non-fatal)."
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/database-info ln line {:source-id (:name line)}))
  (let [match-idx (match-databases-batch (mapv second batch))]
    (eduction
     (map (fn [[ln {:keys [name engine]}]]
            (if-let [target (match-idx [name (engine-name engine)])]
              {:source-id name :target-id target :status :matched}
              {:source-id name
               :status    :no-match
               :line      ln
               :detail    (format "No database with name=%s engine=%s"
                                  (pr-str name) (pr-str (engine-name engine)))})))
     batch)))

;;; ============================== tables — drain + merge ==============================

(defn- portable-table-id
  "The portable id for a table row — `[db-name schema-or-nil name]`. Used for
  validation-error attribution."
  [{:keys [db_id schema name]}]
  [db_id schema name])

(defn drain-tables-batch!
  "Per-batch handler for `:tables`: validate each row, then bulk-insert into
  `metabase_table_import`. Pure side-effecting; suitable as a callback for
  `parsers/stream-array-batches!` or `parsers/stream-keyed-arrays!`."
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/table-info ln line {:source-id (portable-table-id line)}))
  (when (seq batch)
    (let [rows (mapv (fn [[_ {:keys [db_id schema name description]}]]
                       {:db_name      db_id
                        :table_schema schema
                        :table_name   name
                        :description  description
                        :display_name (humanization/name->human-readable-name name)})
                     batch)]
      (t2/insert! :metabase_table_import rows))))

(defn drain-tables-into-staging!
  "Stream `:tables` from `metadata-file` into `metabase_table_import`.

  Validates each row against [[schemas/table-info]] up front. Computes
  `display_name` at drain time via [[humanization/name->human-readable-name]] —
  the merge SQL can then carry the value verbatim instead of re-implementing
  the algorithm in three SQL dialects. Writes only to staging; no live-data
  writes."
  [^File metadata-file]
  (parsers/stream-array-batches!
   metadata-file :tables import-batch-size drain-tables-batch!))

(defn resolve-target-table-ids-in-staging!
  "Set `metabase_table_import.target_table_id` to the int id of the matching
  `metabase_table` row for every staging row whose match key resolves. The
  match key is `(db_name, table_schema, table_name)` against `(d.name,
  t.schema, t.name)`, restricted to active, non-defective live rows.

  Lets `merge-tables!`'s UPDATE key on a single column instead of repeating
  the 2-table-join match in each correlated subquery. Rows that do not
  match keep `target_table_id` NULL — `merge-tables!`'s INSERT picks up
  exactly those rows. Inactive matches are deliberately not resolved so a
  re-import after a deactivation creates a fresh active row (existing
  behavior preserved from the pre-target_table_id implementation).

  Idempotent — running again with the same staging contents produces the
  same assignments. Uses a correlated subquery in SET so it serializes
  portably across PG / H2 / MySQL via `t2/query`."
  []
  (t2/query
   {:update :metabase_table_import
    :set    {:target_table_id
             {:select [:t.id]
              :from   [[:metabase_table :t]]
              :join   [[:metabase_database :d] [:= :d.id :t.db_id]]
              :where  [:and
                       [:= :metabase_table_import.db_name :d.name]
                       [:= [:coalesce :t.schema [:inline ""]]
                        [:coalesce :metabase_table_import.table_schema [:inline ""]]]
                       [:= :t.name :metabase_table_import.table_name]
                       [:= :t.is_defective_duplicate [:inline false]]
                       [:= :t.active [:inline true]]]}}}))

(defn merge-tables!
  "Merge `metabase_table_import` into `metabase_table` atomically.

  Two SQL statements wrapped in a single `t2/with-transaction`:

    1. **UPDATE** rows whose `target_table_id` resolved (i.e., a matching
       active live row exists). Clobbers `description` from staging, bumps
       `updated_at`. Each SET column is a single-key lookup on
       `staging.target_table_id`.
    2. **INSERT** rows whose `target_table_id` is NULL — no active live row
       matched. Sets `active=true` and `data_layer='internal'`; lets column
       defaults handle `field_order`, `initial_sync_status`, etc.

  Order matters: UPDATE first so on a clean-schema import the UPDATE matches
  nothing (fast no-op) and the INSERT writes each row exactly once.

  Pre-condition: `resolve-target-table-ids-in-staging!` must have run (the
  orchestrator does this just before calling this fn). Without that, every
  staging row's `target_table_id` is NULL — you'd get correct INSERTs but
  no clobber.

  The INSERT JOINs `metabase_database` on `db_name`, so staging rows whose
  source DB has no target are silently dropped — the orphan-warn pass emits
  the operator-facing log line.

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
                             :where  [:= :it.target_table_id :metabase_table.id]}
               :updated_at :%now}
      :where  [:and
               [:= :metabase_table.is_defective_duplicate [:inline false]]
               [:= :metabase_table.active [:inline true]]
               [:exists {:select [[[:inline 1]]]
                         :from   [[:metabase_table_import :it]]
                         :where  [:and
                                  [:= :it.target_table_id :metabase_table.id]
                                  [:!= [:coalesce :metabase_table.description [:inline ""]]
                                   [:coalesce :it.description             [:inline ""]]]]}]]})
    ;; INSERT rows with no matching live row (target_table_id IS NULL)
    (t2/query
     {:insert-into
      [[:metabase_table [:db_id :schema :name :description :display_name :data_layer
                         :active :show_in_getting_started :is_defective_duplicate
                         :created_at :updated_at]]
       {:select [:d.id :it.table_schema :it.table_name :it.description :it.display_name
                 [[:inline "internal"]]
                 [[:inline true]] [[:inline false]] [[:inline false]]
                 :%now :%now]
        :from [[:metabase_table_import :it]]
        :join [[:metabase_database :d] [:= :d.name :it.db_name]]
        :where [:= :it.target_table_id nil]}]})))

;;; ============================== fields — drain + merge ==============================

(defn- encode-path-or-nil
  "Encode a path coll (e.g., a wire `:nfc_path` or the middle of a portable id)
  as a JSON string, matching `metabase_field.nfc_path` storage convention. NULL
  for empty/nil; JSON-encoded array string otherwise."
  [coll]
  (when (seq coll) (json/encode (vec coll))))

(defn- decompose-portable-field-id
  "Split a portable field id vector into its natural-key components.

  For any portable id of length ≥ 4 — `[db, schema, tbl, ...middle, last]` —
  returns `{:db_name :table_schema :table_name :path :name}`, where `:name`
  is the last element and `:path` is the middle (encoded same as
  `metabase_field.nfc_path`). Length-4 portable ids have an empty middle, so
  `:path` is NULL.

  Convention-blind: trusts the export to emit portable ids that uniquely
  identify storage rows. The import treats them as opaque match keys."
  [pid]
  (let [v (vec pid)]
    {:db_name      (get v 0)
     :table_schema (get v 1)
     :table_name   (get v 2)
     :path         (encode-path-or-nil (subvec v 3 (dec (count v))))
     :name         (peek v)}))

(defn drain-fields-batch!
  "Per-batch handler for `:fields`: validate each row, decompose wire keys
  (`:table_id`, `:parent_id`, `:fk_target_field_id`) into staging columns,
  bulk-insert into `metabase_field_import`. Suitable as a callback for
  `parsers/stream-array-batches!` or `parsers/stream-keyed-arrays!`."
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/field-info ln line {:source-id (vec (:id line))}))
  (when (seq batch)
    (let [rows (mapv (fn [[_ {:keys [table_id name nfc_path parent_id fk_target_field_id
                                     base_type database_type description effective_type
                                     semantic_type coercion_strategy]}]]
                       (let [tid (vec table_id)
                             p   (some-> parent_id decompose-portable-field-id)
                             fk  (some-> fk_target_field_id decompose-portable-field-id)]
                         (cond-> {:db_name           (get tid 0)
                                  :table_schema      (get tid 1)
                                  :table_name        (get tid 2)
                                  :field_name        name
                                  :nfc_path          (encode-path-or-nil nfc_path)
                                  :base_type         base_type
                                  :database_type     database_type
                                  :description       description
                                  :effective_type    effective_type
                                  :semantic_type     semantic_type
                                  :coercion_strategy coercion_strategy}
                           p  (assoc :parent_db_name      (:db_name p)
                                     :parent_table_schema (:table_schema p)
                                     :parent_table_name   (:table_name p)
                                     :parent_path         (:path p)
                                     :parent_name         (:name p))
                           fk (assoc :fk_target_db_name      (:db_name fk)
                                     :fk_target_table_schema (:table_schema fk)
                                     :fk_target_table_name   (:table_name fk)
                                     :fk_target_path         (:path fk)
                                     :fk_target_name         (:name fk)))))
                     batch)]
      (t2/insert! :metabase_field_import rows))))

(defn drain-fields-into-staging!
  "Stream `:fields` from `metadata-file` into `metabase_field_import`.

  Validates each row up front. Decomposes wire `:table_id`, `:parent_id`, and
  `:fk_target_field_id` into staging columns. Encodes wire `:nfc_path` to match
  `metabase_field.nfc_path`. Resolved-id columns (`parent_id`, `fk_target_id`,
  `target_field_id`) start NULL — they're filled by the resolve functions in
  the merge phase. Writes only to staging."
  [^File metadata-file]
  (parsers/stream-array-batches!
   metadata-file :fields import-batch-size drain-fields-batch!))

(defn- collect-missing-parent-portable-ids
  "Return a vector of distinct portable id vectors for staging rows whose
  parent didn't resolve (`parent_db_name` set, `parent_id` still NULL).
  Reconstructs the portable id from the staging parent_* columns."
  []
  (let [rows (t2/query {:select-distinct [:parent_db_name
                                          :parent_table_schema
                                          :parent_table_name
                                          :parent_path
                                          :parent_name]
                        :from   [:metabase_field_import]
                        :where  [:and
                                 [:!= :parent_db_name nil]
                                 [:= :parent_id nil]]})]
    (mapv (fn [{:keys [parent_db_name parent_table_schema parent_table_name parent_path parent_name]}]
            (let [middle (when parent_path (vec (json/decode parent_path)))]
              (-> [parent_db_name parent_table_schema parent_table_name]
                  (into (or middle []))
                  (conj parent_name))))
          rows)))

(defn- portable-field-parent
  "Return the parent's portable id of `pid`, or nil if `pid` is a top-level
  field (length 4: `[db schema table name]` with no path). Same `(name = last,
  path = middle)` decomposition the rest of the importer uses."
  [pid]
  (let [v (vec pid)]
    (when (> (count v) 4)
      (subvec v 0 (dec (count v))))))

(defn- bulk-check-existence
  "Return the subset of portable ids in `pids` that exist as non-defective rows
  in `metabase_field`. One SELECT per distinct `(db, schema, table)` triple,
  filtered in Clojure for the exact `(name, nfc_path)` match.

  Replaces the per-pid `parent-exists-in-metabase-field?` probe — the
  `compute-stubs!` walk uses this so it does O(D × T) reads (D = nesting
  depth in the missing set, T = distinct tables involved) instead of
  O(K × D) per-ancestor probes."
  [pids]
  (if (empty? pids)
    #{}
    (let [decomposed (mapv (fn [pid]
                             (let [v (vec pid)]
                               {:pid    pid
                                :db     (get v 0)
                                :schema (get v 1)
                                :tbl    (get v 2)
                                :name   (peek v)
                                :path   (encode-path-or-nil (subvec v 3 (dec (count v))))}))
                           pids)
          by-table   (group-by (juxt :db :schema :tbl) decomposed)]
      (into #{}
            (mapcat (fn [[[db schema tbl] tuples]]
                      (let [names   (into #{} (map :name) tuples)
                            rows    (t2/query
                                     {:select [:f.name
                                               [[:coalesce :f.nfc_path [:inline ""]] :nfc]]
                                      :from   [[:metabase_field :f]]
                                      :join   [[:metabase_table :t]    [:= :t.id :f.table_id]
                                               [:metabase_database :d] [:= :d.id :t.db_id]]
                                      :where  [:and
                                               [:= :d.name db]
                                               [:= [:coalesce :t.schema [:inline ""]]
                                                [:coalesce schema [:inline ""]]]
                                               [:= :t.name tbl]
                                               [:in :f.name names]
                                               [:= :f.is_defective_duplicate [:inline false]]]})
                            present (into #{}
                                          (map (fn [{:keys [name nfc]}]
                                                 [name (or nfc "")]))
                                          rows)]
                        (keep (fn [{:keys [pid name path]}]
                                (when (contains? present [name (or path "")])
                                  pid))
                              tuples))))
            by-table))))

(defn compute-stubs!
  "Walk every distinct unresolved-parent portable id in staging and return a
  vector of stub specs `{:portable-id ... :parent-portable-id ...}` for the
  ancestors missing from `metabase_field`. Specs are returned in dependency
  order (root first, then descendants) so a sequential insert can JOIN to its
  parent.

  Bulk-per-level: probes `metabase_field` once per `(db, schema, table)`
  group per nesting level, walking up the ancestor chain breadth-first
  rather than depth-first. Reads scale O(D × T) — D = nesting depth in
  the missing set, T = distinct tables involved — instead of O(K × D) per
  ancestor as the prior recursive walk did.

  Read-only against `metabase_field`; produces Clojure data only. Idempotent."
  []
  (let [direct-demands (set (collect-missing-parent-portable-ids))]
    (loop [frontier direct-demands
           seen     #{}
           level    0
           by-level {}]
      (if (empty? frontier)
        ;; Emit specs from highest (deepest walk = roots) to lowest (directly-
        ;; demanded). Within a level, sort by pid length so shallower ancestors
        ;; come before their own descendants (when a frontier mixes depths).
        (->> (range level 0 -1)
             (mapcat (fn [d]
                       (->> (get by-level (dec d))
                            (sort-by (comp count :portable-id)))))
             vec)
        (let [existing      (bulk-check-existence frontier)
              missing       (into #{} (remove existing) frontier)
              specs         (mapv (fn [pid]
                                    {:portable-id        pid
                                     :parent-portable-id (portable-field-parent pid)})
                                  missing)
              next-frontier (into #{}
                                  (comp (keep portable-field-parent)
                                        (remove seen)
                                        (remove frontier))
                                  missing)]
          (recur next-frontier
                 (into seen frontier)
                 (inc level)
                 (assoc by-level level specs)))))))

(def ^:private stub-insert-cols
  "Column list for stub INSERT-SELECT statements. Identical for root and nested
  stub variants — only the parent_id source differs."
  [:table_id :name :nfc_path :parent_id
   :base_type :database_type :active
   :is_defective_duplicate :created_at :updated_at])

(defn- insert-root-stub!
  "Insert one root stub (no parent). `parent_id` is NULL inline; the
  unique-field NOT EXISTS check uses `unique_field_helper = 0` to detect a
  pre-existing row at the same `(table_id, name, parent_id=NULL)` natural
  key."
  [db-name schema tbl-name leaf path]
  (t2/query
   {:insert-into
    [[:metabase_field stub-insert-cols]
     {:select [:t.id leaf path [[:inline nil]]
               [[:inline "type/*"]] [[:inline "__stub__"]] [[:inline false]] [[:inline false]]
               :%now :%now]
      :from   [[:metabase_database :d]]
      :join   [[:metabase_table :t]
               [:and [:= :t.db_id :d.id]
                [:= [:coalesce :t.schema [:inline ""]] [:coalesce schema [:inline ""]]]
                [:= :t.name tbl-name]
                [:= :t.is_defective_duplicate [:inline false]]]]
      :where  [:and
               [:= :d.name db-name]
               [:not [:exists {:select [[[:inline 1]]]
                               :from [[:metabase_field :f]]
                               :where [:and
                                       [:= :f.table_id :t.id]
                                       [:= :f.name leaf]
                                       [:= :f.unique_field_helper [:inline 0]]
                                       [:= :f.is_defective_duplicate [:inline false]]]}]]]}]}))

(defn- insert-nested-stub!
  "Insert one nested stub (with parent). INNER JOINs `metabase_field` to find
  the parent's int id (parent must already exist in `metabase_field` by the
  time this fires — `compute-stubs!` returns specs in root-first order so
  ancestors land first). Unique-field NOT EXISTS uses the parent's int id."
  [db-name schema tbl-name leaf path parent-leaf parent-path]
  (t2/query
   {:insert-into
    [[:metabase_field stub-insert-cols]
     {:select [:t.id leaf path :parent.id
               [[:inline "type/*"]] [[:inline "__stub__"]] [[:inline false]] [[:inline false]]
               :%now :%now]
      :from   [[:metabase_database :d]]
      :join   [[:metabase_table :t]
               [:and [:= :t.db_id :d.id]
                [:= [:coalesce :t.schema [:inline ""]] [:coalesce schema [:inline ""]]]
                [:= :t.name tbl-name]
                [:= :t.is_defective_duplicate [:inline false]]]
               [:metabase_field :parent]
               [:and [:= :parent.table_id :t.id]
                [:= :parent.name parent-leaf]
                [:= [:coalesce :parent.nfc_path [:inline ""]] [:coalesce parent-path [:inline ""]]]
                [:= :parent.is_defective_duplicate [:inline false]]]]
      :where  [:and
               [:= :d.name db-name]
               [:not [:exists {:select [[[:inline 1]]]
                               :from [[:metabase_field :f]]
                               :where [:and
                                       [:= :f.table_id :t.id]
                                       [:= :f.name leaf]
                                       [:= :f.unique_field_helper :parent.id]
                                       [:= :f.is_defective_duplicate [:inline false]]]}]]]}]}))

(defn- insert-one-stub!
  "Dispatch on `:parent-portable-id` to pick the root or nested INSERT shape."
  [{:keys [portable-id parent-portable-id]}]
  (let [pid      (vec portable-id)
        db-name  (get pid 0)
        schema   (get pid 1)
        tbl-name (get pid 2)
        leaf     (peek pid)
        path     (encode-path-or-nil (subvec pid 3 (dec (count pid))))]
    (if-let [parent-pid (some-> parent-portable-id vec)]
      (let [parent-leaf (peek parent-pid)
            parent-path (encode-path-or-nil (subvec parent-pid 3 (dec (count parent-pid))))]
        (insert-nested-stub! db-name schema tbl-name leaf path parent-leaf parent-path))
      (insert-root-stub! db-name schema tbl-name leaf path))))

(defn insert-stubs-where-not-exists!
  "Insert stub rows for every spec in `stub-specs`, in order. `compute-stubs!`
  returns specs in root-first dependency order so each spec's parent is
  guaranteed to exist by the time the insert runs.

  Each insert is a single SQL `INSERT … SELECT … WHERE NOT EXISTS`, so a
  concurrent insert of the same natural key is a silent no-op rather than a
  unique-violation throw.

  Wraps the loop in `t2/with-transaction` for atomicity. Composes with an
  outer transaction (Toucan2 joins outer)."
  [stub-specs]
  (t2/with-transaction [_]
    (doseq [spec stub-specs]
      (insert-one-stub! spec))))

(def ^:private fields-clobber-cols
  "Columns clobbered on UPDATE-EXISTS in [[merge-fields-pass-1!]] /
  [[merge-fields-pass-2!]]. The matched-row payload is overwritten regardless of
  whether values changed (the import is an alternate sync). `parent_id` is not
  clobbered: it's part of the match key (already correct on a matched row).
  `fk_target_field_id` is clobbered by Pass 2 only (using the resolved
  `staging.fk_target_id`), since Pass 1 only handles non-FK staging rows."
  [:base_type :database_type :description
   :effective_type :semantic_type :coercion_strategy :nfc_path])

(defn- target-field-id-clobber-subquery
  "Correlated subquery used by `merge-fields-pass-*!`'s UPDATE to fetch one
  column value from the matched staging row. The match is a single PK lookup on
  `target_field_id` (pre-resolved by `resolve-target-field-ids-in-staging!`),
  so each subquery is an indexed one-row probe — no joins, no COALESCE."
  [col]
  {:select [(keyword (str "fi." (name col)))]
   :from   [[:metabase_field_import :fi]]
   :where  [:= :fi.target_field_id :metabase_field.id]})

(def ^:private fields-payload-changed-predicate
  "OR-block over the seven clobber-payload columns plus `active`. Used by
  the skip-if-unchanged check on the merge-fields UPDATE: if every observable
  column already matches staging, no UPDATE fires (no dead tuple). Used
  verbatim by Pass 1 and as the prefix of Pass 2's predicate (which appends
  `fk_target_field_id`).

  Coalesce-with-empty-string is the portable NULL-safe equivalent of
  `IS DISTINCT FROM` (PG/H2-only). For `effective_type` we coalesce against
  `base_type` on both sides because the export side omits `:effective_type`
  when it equals `:base_type` (documented asymmetric optimization at
  metadata.clj:186) and the application universally treats
  `effective_type IS NULL` as 'use base_type'. `active` is checked against
  TRUE since SET sets it to TRUE always (so a stub with active=false still
  fires the UPDATE). `updated_at` is deliberately NOT in the predicate."
  [[:!= [:coalesce :metabase_field.base_type         [:inline ""]] [:coalesce :fi.base_type         [:inline ""]]]
   [:!= [:coalesce :metabase_field.database_type     [:inline ""]] [:coalesce :fi.database_type     [:inline ""]]]
   [:!= [:coalesce :metabase_field.description       [:inline ""]] [:coalesce :fi.description       [:inline ""]]]
   [:!= [:coalesce :metabase_field.effective_type    :metabase_field.base_type]
    [:coalesce :fi.effective_type                :fi.base_type]]
   [:!= [:coalesce :metabase_field.semantic_type     [:inline ""]] [:coalesce :fi.semantic_type     [:inline ""]]]
   [:!= [:coalesce :metabase_field.coercion_strategy [:inline ""]] [:coalesce :fi.coercion_strategy [:inline ""]]]
   [:!= [:coalesce :metabase_field.nfc_path          [:inline ""]] [:coalesce :fi.nfc_path          [:inline ""]]]
   [:!= :metabase_field.active [:inline true]]])

(defn merge-fields-pass-1!
  "Merge non-FK staging rows into `metabase_field` atomically, in two SQL
  statements wrapped in a single `t2/with-transaction`. \"Non-FK\" means
  `fi.fk_target_db_name IS NULL`.

    1. **UPDATE** rows whose `target_field_id` resolved AND whose staging row
       has no FK. Clobbers the seven payload columns (`base_type`,
       `database_type`, `description`, `effective_type`, `semantic_type`,
       `coercion_strategy`, `nfc_path`), sets `active=true` (flips stubs to
       live), bumps `updated_at`. Each SET column is a single-key lookup on
       `staging.target_field_id`. Skip-if-unchanged: the EXISTS subquery
       additionally requires that at least one observable column differs.
    2. **INSERT** rows whose `target_field_id` is NULL AND whose staging row
       has no FK. Sets `active=true`, `is_defective_duplicate=false`,
       `fk_target_field_id=NULL`.

  Order matters: UPDATE first so on a clean-schema import the UPDATE matches
  nothing (fast no-op) and the INSERT writes each row exactly once.

  Pre-condition: `resolve-target-field-ids-in-staging!` must have run (the
  orchestrator does this just before calling this fn).

  After Pass 1 lands, every non-FK staging row exists in `metabase_field`. The
  orchestrator then re-resolves `target_field_id` (round 2) and resolves
  `fk_target_id` against `metabase_field` — for FK staging rows whose target
  is non-FK (the common case) this picks up the just-inserted target rows so
  Pass 2 can carry the resolved id through the INSERT/UPDATE.

  Composes with an outer `t2/with-transaction`: t2 joins outer."
  []
  (t2/with-transaction [_]
    (t2/query
     {:update :metabase_field
      :set    (-> (into {} (map (fn [c] [c (target-field-id-clobber-subquery c)])) fields-clobber-cols)
                  (assoc :active     [:inline true]
                         :updated_at :%now))
      :where  [:and
               [:= :metabase_field.is_defective_duplicate [:inline false]]
               [:exists {:select [[[:inline 1]]]
                         :from   [[:metabase_field_import :fi]]
                         :where  [:and
                                  [:= :fi.target_field_id :metabase_field.id]
                                  [:= :fi.fk_target_db_name nil]
                                  (into [:or] fields-payload-changed-predicate)]}]]})
    ;; INSERT non-FK rows with no matching live row (target_field_id IS NULL,
    ;; fk_target_db_name IS NULL). fk_target_field_id stays NULL on these rows.
    (t2/query
     {:insert-into
      [[:metabase_field [:table_id :name :base_type :database_type :description
                         :effective_type :semantic_type :coercion_strategy
                         :nfc_path :parent_id :fk_target_field_id
                         :is_defective_duplicate :active :created_at :updated_at]]
       {:select [:t.id :fi.field_name :fi.base_type :fi.database_type :fi.description
                 :fi.effective_type :fi.semantic_type :fi.coercion_strategy
                 :fi.nfc_path :fi.parent_id [[:inline nil]]
                 [[:inline false]] [[:inline true]] :%now :%now]
        :from [[:metabase_field_import :fi]]
        :join [[:metabase_database :d] [:= :d.name :fi.db_name]
               [:metabase_table :t]    [:and
                                        [:= :t.db_id :d.id]
                                        [:= [:coalesce :t.schema [:inline ""]] [:coalesce :fi.table_schema [:inline ""]]]
                                        [:= :t.name :fi.table_name]
                                        [:= :t.is_defective_duplicate [:inline false]]]]
        :where [:and
                [:= :fi.target_field_id nil]
                [:= :fi.fk_target_db_name nil]]}]})))

(defn merge-fields-pass-2!
  "Merge FK staging rows into `metabase_field` atomically. \"FK\" means
  `fi.fk_target_db_name IS NOT NULL`. Two SQL statements in a single
  `t2/with-transaction`:

    1. **UPDATE** rows whose `target_field_id` resolved AND whose staging row
       has an FK. Clobbers the seven payload columns AND `fk_target_field_id`
       (from `staging.fk_target_id`). Skip-if-unchanged predicate includes
       `fk_target_field_id` in the change check (compared NULL-safely with
       `COALESCE(., 0)` since 0 is never a valid id).
    2. **INSERT** rows whose `target_field_id` is NULL AND whose staging row
       has an FK. `fk_target_field_id` is set in the INSERT from
       `staging.fk_target_id` — no separate UPDATE pass needed for the
       common case (FK target was non-FK and got resolved between Pass 1 and
       Pass 2). For FK chain cases where the target is itself a Pass-2 row,
       `staging.fk_target_id` may still be NULL at INSERT time, so the
       column lands NULL and the orchestrator's final `merge-fk-targets!`
       cleanup fills it in.

  Pre-conditions:
    - Pass 1 has run (so non-FK rows exist in `metabase_field`).
    - `resolve-target-field-ids-in-staging!` ran after Pass 1 (so newly-
      inserted non-FK rows have their `target_field_id` populated, useful when
      another FK row points at them).
    - `resolve-fk-target-ids-in-staging!` ran after Pass 1 (so `fk_target_id`
      is populated for FK rows whose target exists by now).

  Composes with an outer `t2/with-transaction`: t2 joins outer."
  []
  (t2/with-transaction [_]
    (t2/query
     {:update :metabase_field
      :set    (-> (into {} (map (fn [c] [c (target-field-id-clobber-subquery c)])) fields-clobber-cols)
                  (assoc :active             [:inline true]
                         :fk_target_field_id (target-field-id-clobber-subquery :fk_target_id)
                         :updated_at         :%now))
      :where  [:and
               [:= :metabase_field.is_defective_duplicate [:inline false]]
               [:exists {:select [[[:inline 1]]]
                         :from   [[:metabase_field_import :fi]]
                         :where  [:and
                                  [:= :fi.target_field_id :metabase_field.id]
                                  [:!= :fi.fk_target_db_name nil]
                                  (into [:or]
                                        (conj fields-payload-changed-predicate
                                              [:!= [:coalesce :metabase_field.fk_target_field_id [:inline 0]]
                                               [:coalesce :fi.fk_target_id [:inline 0]]]))]}]]})
    ;; INSERT FK rows with no matching live row. fk_target_field_id is set
    ;; from staging.fk_target_id (resolved between Pass 1 and Pass 2 for
    ;; non-chain cases; NULL for chain cases — handled by the cleanup
    ;; merge-fk-targets! after the second resolve pass).
    (t2/query
     {:insert-into
      [[:metabase_field [:table_id :name :base_type :database_type :description
                         :effective_type :semantic_type :coercion_strategy
                         :nfc_path :parent_id :fk_target_field_id
                         :is_defective_duplicate :active :created_at :updated_at]]
       {:select [:t.id :fi.field_name :fi.base_type :fi.database_type :fi.description
                 :fi.effective_type :fi.semantic_type :fi.coercion_strategy
                 :fi.nfc_path :fi.parent_id :fi.fk_target_id
                 [[:inline false]] [[:inline true]] :%now :%now]
        :from [[:metabase_field_import :fi]]
        :join [[:metabase_database :d] [:= :d.name :fi.db_name]
               [:metabase_table :t]    [:and
                                        [:= :t.db_id :d.id]
                                        [:= [:coalesce :t.schema [:inline ""]] [:coalesce :fi.table_schema [:inline ""]]]
                                        [:= :t.name :fi.table_name]
                                        [:= :t.is_defective_duplicate [:inline false]]]]
        :where [:and
                [:= :fi.target_field_id nil]
                [:!= :fi.fk_target_db_name nil]]}]})))

(defn assert-no-unresolved-parent-refs!
  "Defensive guard: every staging row with a non-NULL `parent_db_name` should
  have a non-NULL `parent_id` by the time this fires (after both
  `resolve-existing-parents-in-staging!` calls and `insert-stubs-where-not-exists!`).
  If any remain unresolved, something invalidated `compute-stubs!`'s decisions
  between compute and merge — e.g., a concurrent delete (impossible under the
  preconditions, but cheap to verify). Throws `ex-info` with
  `:kind :stub_resolution_invalidated`; intended to fire inside the merge txn
  so the throw rolls everything back."
  []
  (let [n (-> (t2/query {:select [[[:count :*] :n]]
                         :from   [:metabase_field_import]
                         :where  [:and
                                  [:!= :parent_db_name nil]
                                  [:= :parent_id nil]]})
              first :n)]
    (when (pos? n)
      (throw (ex-info "Stub resolution invalidated between compute and merge"
                      {:kind :stub_resolution_invalidated, :n-unresolved n})))))

(def ^:private ^:const orphan-staging-warn-cap
  "Maximum orphan staging rows reported per phase, capped to avoid log spam at
  scale (millions of rows). The WARN line carries the sample, not the total
  count — assumes operator response is to investigate the file vs target
  mismatch rather than enumerate every row."
  50)

(defn warn-on-orphan-staging-rows!
  "Emit operator-facing WARN lines for staging rows that the merge silently
  dropped — preserves today's per-row WARN observability under the new
  drain-then-merge architecture. Two phases:

    - **Tables**: rows in `metabase_table_import` whose `db_name` isn't in the
      matched-target-db set (i.e., the file references a database the target
      instance doesn't have, or matched on name but not engine).
    - **Fields**: rows in `metabase_field_import` whose `(db_name, schema,
      table_name)` doesn't JOIN to any `metabase_table` row (the table didn't
      exist and didn't get inserted because its db wasn't matched).

  Capped at [[orphan-staging-warn-cap]] per phase. Intended to run inside the
  merge txn after all merges, so live state is final-as-of-this-txn."
  [matched-target-db-ids]
  (let [matched-names (when (seq matched-target-db-ids)
                        (set (map :name (t2/select [:model/Database :name]
                                                   :id [:in (vec matched-target-db-ids)]))))
        orphan-tables (t2/query
                       (cond-> {:select [:db_name :table_schema :table_name]
                                :from   [:metabase_table_import]
                                :limit  orphan-staging-warn-cap}
                         (seq matched-names)
                         (assoc :where [:not [:in :db_name (vec matched-names)]])))
        orphan-fields (t2/query
                       {:select [:db_name :table_schema :table_name :field_name]
                        :from   [:metabase_field_import]
                        :where  [:not [:exists {:select [[[:inline 1]]]
                                                :from   [[:metabase_table :t]]
                                                :join   [[:metabase_database :d] [:= :d.id :t.db_id]]
                                                :where  [:and
                                                         [:= :d.name :metabase_field_import.db_name]
                                                         [:= [:coalesce :t.schema [:inline ""]]
                                                          [:coalesce :metabase_field_import.table_schema [:inline ""]]]
                                                         [:= :t.name :metabase_field_import.table_name]
                                                         [:= :t.is_defective_duplicate [:inline false]]]}]]
                        :limit  orphan-staging-warn-cap})]
    (when (seq orphan-tables)
      (log/warnf "metadata-file-import: %d orphan staging table row(s) (db_name not in matched target dbs, sample up to %d): %s"
                 (count orphan-tables) orphan-staging-warn-cap (pr-str orphan-tables)))
    (when (seq orphan-fields)
      (log/warnf "metadata-file-import: %d orphan staging field row(s) (no matching table in appdb, sample up to %d): %s"
                 (count orphan-fields) orphan-staging-warn-cap (pr-str orphan-fields)))))

(defn merge-fk-targets!
  "Set `metabase_field.fk_target_field_id` from
  `metabase_field_import.fk_target_id` for every staging row whose FK target
  was resolved. Single UPDATE wrapped in `t2/with-transaction` for caller
  composability.

  Pre-condition: every staging row with non-NULL `fk_target_id` must also have
  non-NULL `target_field_id` (the row's own metabase_field.id). The
  orchestrator guarantees this by running
  [[resolve-target-field-ids-in-staging!]] after [[merge-fields!]] (so
  just-inserted rows get their target_field_id populated) and then
  [[resolve-fk-target-ids-in-staging!]].

  The outer UPDATE pre-filters with an uncorrelated `WHERE id IN (SELECT
  target_field_id FROM staging WHERE fk_target_id IS NOT NULL)`. The planner
  hash-joins this once and the per-row SET subquery runs only against the
  matched subset, instead of evaluating both an EXISTS check and the SET
  subquery for every row of `metabase_field`. Each SET subquery is a
  single-column key lookup on `staging.target_field_id` — no joins.

  Driver-blind via t2. Composes with an outer transaction (t2 joins outer)."
  []
  (t2/with-transaction [_]
    ;; Skip-if-unchanged: the EXISTS subquery additionally requires that
    ;; the FK target value actually differs. We compare with COALESCE-with-0
    ;; since 0 is never a valid metabase_field id (PG sequences start at 1) —
    ;; this is the portable NULL-safe equivalent of IS DISTINCT FROM. The
    ;; uncorrelated IN-subquery pre-filter is kept intact so the outer
    ;; UPDATE still narrows to the staging-referenced rows up front.
    (t2/query
     {:update :metabase_field
      :set    {:fk_target_field_id
               {:select [:fi.fk_target_id]
                :from   [[:metabase_field_import :fi]]
                :where  [:= :fi.target_field_id :metabase_field.id]}}
      :where  [:and
               [:= :metabase_field.is_defective_duplicate [:inline false]]
               [:in :metabase_field.id
                {:select [:fi.target_field_id]
                 :from   [[:metabase_field_import :fi]]
                 :where  [:!= :fi.fk_target_id nil]}]
               [:exists {:select [[[:inline 1]]]
                         :from   [[:metabase_field_import :fi]]
                         :where  [:and
                                  [:= :fi.target_field_id :metabase_field.id]
                                  [:!= [:coalesce :fi.fk_target_id              [:inline 0]]
                                   [:coalesce :metabase_field.fk_target_field_id [:inline 0]]]]}]]})))

(defn assert-no-unresolved-fk-targets!
  "Defensive guard: every staging row with a non-NULL `fk_target_db_name`
  should have a non-NULL `fk_target_id` by the time this fires (after
  [[resolve-fk-target-ids-in-staging!]]). If any remain unresolved, the file
  references an FK target that exists nowhere in the target appdb — a
  corrupt-file signal. Throws `ex-info` with `:kind :fk_target_unresolved`;
  intended to fire inside the merge txn so the throw rolls everything back.

  Preserves today's `process-fields-fk-resolve!` hard-fail behavior."
  []
  (let [n (-> (t2/query {:select [[[:count :*] :n]]
                         :from   [:metabase_field_import]
                         :where  [:and
                                  [:!= :fk_target_db_name nil]
                                  [:= :fk_target_id nil]]})
              first :n)]
    (when (pos? n)
      (throw (ex-info "FK target unresolved — file references a field that does not exist"
                      {:kind :fk_target_unresolved, :n-unresolved n})))))

(defn resolve-fk-target-ids-in-staging!
  "Set `metabase_field_import.fk_target_id` to the int id of the matching
  `metabase_field` row, for every staging row whose `fk_target_db_name` is
  non-NULL. Same `(name = last, path = middle)` decomposition as
  [[resolve-existing-parents-in-staging!]] — the import treats portable ids
  uniformly regardless of the target row's storage shape.

  Runs inside the merge txn after `merge-fields!` so every field referenced
  by any FK is already in `metabase_field` (real or just-inserted stub).

  Idempotent. Driver-blind via t2 + correlated subquery in SET."
  []
  (t2/query
   {:update :metabase_field_import
    :set    {:fk_target_id
             {:select [:target.id]
              :from   [[:metabase_field :target]]
              :join   [[:metabase_table :tt]    [:= :tt.id :target.table_id]
                       [:metabase_database :td] [:= :td.id :tt.db_id]]
              :where  [:and
                       [:= :metabase_field_import.fk_target_db_name :td.name]
                       [:= [:coalesce :tt.schema [:inline ""]]
                        [:coalesce :metabase_field_import.fk_target_table_schema [:inline ""]]]
                       [:= :tt.name :metabase_field_import.fk_target_table_name]
                       [:= :target.name :metabase_field_import.fk_target_name]
                       [:= [:coalesce :target.nfc_path [:inline ""]]
                        [:coalesce :metabase_field_import.fk_target_path [:inline ""]]]
                       [:= :target.is_defective_duplicate [:inline false]]]}}
    :where  [:!= :metabase_field_import.fk_target_db_name nil]}))

(defn resolve-existing-parents-in-staging!
  "Set `metabase_field_import.parent_id` to the int id of the matching
  `metabase_field` row, for every staging row whose `parent_db_name` is
  non-NULL. The match key is the decomposed parent natural key:
  `(parent_db_name, parent_table_schema, parent_table_name, parent_path,
  parent_name)` against `(d.name, t.schema, t.name, parent.nfc_path,
  parent.name)`. Defective parents (`is_defective_duplicate = true`) are
  excluded.

  Idempotent — running again with the same staging contents produces the
  same parent_id assignments. Uses a correlated subquery in SET so it
  serializes portably across PG / H2 / MySQL via `t2/query`."
  []
  (t2/query
   {:update :metabase_field_import
    :set    {:parent_id
             {:select [:parent.id]
              :from   [[:metabase_field :parent]]
              :join   [[:metabase_table :pt]    [:= :pt.id :parent.table_id]
                       [:metabase_database :pd] [:= :pd.id :pt.db_id]]
              :where  [:and
                       [:= :metabase_field_import.parent_db_name :pd.name]
                       [:= [:coalesce :pt.schema [:inline ""]]
                        [:coalesce :metabase_field_import.parent_table_schema [:inline ""]]]
                       [:= :pt.name :metabase_field_import.parent_table_name]
                       [:= :parent.name :metabase_field_import.parent_name]
                       [:= [:coalesce :parent.nfc_path [:inline ""]]
                        [:coalesce :metabase_field_import.parent_path [:inline ""]]]
                       [:= :parent.is_defective_duplicate [:inline false]]]}}
    :where  [:!= :metabase_field_import.parent_db_name nil]}))

(defn resolve-target-field-ids-in-staging!
  "Set `metabase_field_import.target_field_id` to the int id of the matching
  `metabase_field` row for every staging row whose match key resolves. The
  match key is `(db_name, table_schema, table_name, field_name,
  COALESCE(parent_id, 0))` against `(d.name, t.schema, t.name, f.name,
  f.unique_field_helper)`. Defective rows on either side are excluded.

  Lets `merge-fields!`'s UPDATE key on a single column (target_field_id =
  metabase_field.id) instead of repeating the 3-table-join match in each
  correlated subquery. Run AFTER stubs have been inserted and parents
  re-resolved (so `parent_id` reflects the post-stub state). Rows that do
  not match keep `target_field_id` NULL — `merge-fields!`'s INSERT then
  picks up exactly those rows.

  Idempotent — running again with the same staging contents produces the
  same assignments. Uses a correlated subquery in SET so it serializes
  portably across PG / H2 / MySQL via `t2/query`."
  []
  (t2/query
   {:update :metabase_field_import
    :set    {:target_field_id
             {:select [:f.id]
              :from   [[:metabase_field :f]]
              :join   [[:metabase_table :t]    [:= :t.id :f.table_id]
                       [:metabase_database :d] [:= :d.id :t.db_id]]
              :where  [:and
                       [:= :metabase_field_import.db_name :d.name]
                       [:= [:coalesce :t.schema [:inline ""]]
                        [:coalesce :metabase_field_import.table_schema [:inline ""]]]
                       [:= :t.name :metabase_field_import.table_name]
                       [:= :f.name :metabase_field_import.field_name]
                       [:= :f.unique_field_helper
                        [:coalesce :metabase_field_import.parent_id [:inline 0]]]
                       [:= :f.is_defective_duplicate [:inline false]]
                       [:= :t.is_defective_duplicate [:inline false]]]}}}))

;;; ==================== fields (batch) ====================

(def ^:private stub-base-type
  "Sentinel `:base_type` for stub field rows. Distinguishes import-inserted
  placeholders from real rows when scanning for unfilled stubs at end-of-import."
  "type/*")

(def ^:private stub-database-type
  "Sentinel `:database_type` for stub field rows."
  "__stub__")

(defn stub-row?
  "True if `row` is a placeholder stub. Checks `:database_type` (not `:base_type`,
  which goes through the model's keyword transform on read)."
  [{:keys [database_type]}]
  (= stub-database-type database_type))

