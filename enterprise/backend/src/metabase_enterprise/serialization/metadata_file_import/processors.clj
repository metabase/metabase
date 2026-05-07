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
      [[merge-fields!]], [[resolve-fk-target-ids-in-staging!]],
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

(defn drain-tables-into-staging!
  "Stream `:tables` from `metadata-file` into `metabase_table_import`.

  Validates each row against [[schemas/table-info]] up front. Computes
  `display_name` at drain time via [[humanization/name->human-readable-name]] —
  the merge SQL can then carry the value verbatim instead of re-implementing
  the algorithm in three SQL dialects. Writes only to staging; no live-data
  writes."
  [^File metadata-file]
  (parsers/stream-array-batches!
   metadata-file :tables import-batch-size
   (fn [batch]
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
         (t2/insert! :metabase_table_import rows))))))

(defn merge-tables!
  "Merge `metabase_table_import` into `metabase_table` atomically.

  Two SQL statements wrapped in a single `t2/with-transaction`:

    1. **INSERT** rows whose natural key isn't already present in
       `metabase_table` (active, non-defective). Sets `active=true` and
       `data_layer='internal'`; lets column defaults handle `field_order`,
       `initial_sync_status`, `view_count`, etc.
    2. **UPDATE** matched rows by clobbering `description` from staging
       (`updated_at` bumped to `NOW()`).

  Both statements JOIN `metabase_database` on `db_name`, so staging rows whose
  source DB has no target are silently dropped — the orphan-warn pass (commit
  4) emits the operator-facing log line.

  The `set-new-table-permissions!` `:after-insert` hook on `:model/Table` does
  not fire here because the INSERT goes through the raw table keyword
  (`:metabase_table`) rather than the model. This preserves today's
  per-table-permission gap; batched-grant work is tracked separately.

  Composes safely inside a larger transaction: Toucan2's `t2/with-transaction`
  joins an outer txn rather than creating a savepoint, so when an outer caller
  (e.g., the commit-4 orchestrator) wraps several merge steps in one txn, this
  function's inner txn participates in the outer's all-or-nothing semantics."
  []
  (t2/with-transaction [_]
    ;; INSERT rows that don't already exist
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
        :where [:not [:exists {:select [[[:inline 1]]]
                               :from [[:metabase_table :t]]
                               :where [:and
                                       [:= :t.db_id :d.id]
                                       [:= [:coalesce :t.schema [:inline ""]]
                                        [:coalesce :it.table_schema [:inline ""]]]
                                       [:= :t.name :it.table_name]
                                       [:= :t.is_defective_duplicate [:inline false]]
                                       [:= :t.active [:inline true]]]}]]}]})
    ;; UPDATE matched rows (clobber description, bump updated_at)
    (t2/query
     {:update :metabase_table
      :set    {:description {:select [:it.description]
                             :from [[:metabase_table_import :it]]
                             :join [[:metabase_database :d] [:= :d.name :it.db_name]]
                             :where [:and
                                     [:= :metabase_table.db_id :d.id]
                                     [:= [:coalesce :metabase_table.schema [:inline ""]]
                                      [:coalesce :it.table_schema [:inline ""]]]
                                     [:= :metabase_table.name :it.table_name]]}
               :updated_at :%now}
      :where  [:exists {:select [[[:inline 1]]]
                        :from [[:metabase_table_import :it]]
                        :join [[:metabase_database :d] [:= :d.name :it.db_name]]
                        :where [:and
                                [:= :metabase_table.db_id :d.id]
                                [:= [:coalesce :metabase_table.schema [:inline ""]]
                                 [:coalesce :it.table_schema [:inline ""]]]
                                [:= :metabase_table.name :it.table_name]
                                [:= :metabase_table.is_defective_duplicate [:inline false]]
                                [:= :metabase_table.active [:inline true]]]}]})))

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

(defn drain-fields-into-staging!
  "Stream `:fields` from `metadata-file` into `metabase_field_import`.

  Validates each row up front. Decomposes wire `:table_id`, `:parent_id`, and
  `:fk_target_field_id` into staging columns. Encodes wire `:nfc_path` to match
  `metabase_field.nfc_path`. Resolved-id columns (`parent_id`, `fk_target_id`)
  start NULL — they're filled by `resolve-existing-parents-in-staging!` and
  (commit 4) `resolve-fk-target-ids-in-staging!`. Writes only to staging."
  [^File metadata-file]
  (parsers/stream-array-batches!
   metadata-file :fields import-batch-size
   (fn [batch]
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
         (t2/insert! :metabase_field_import rows))))))

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

(defn- parent-exists-in-metabase-field?
  "Probe `metabase_field` for a non-defective row whose natural-key matches the
  portable id `pid`. Match key: `(d.name, t.schema, t.name, f.name,
  f.nfc_path)`. Same `(name = last, path = middle)` decomposition that
  `resolve-existing-parents-in-staging!` uses."
  [pid]
  (let [v        (vec pid)
        db-name  (get v 0)
        schema   (get v 1)
        tbl-name (get v 2)
        leaf     (peek v)
        path     (encode-path-or-nil (subvec v 3 (dec (count v))))]
    (boolean
     (seq
      (t2/query {:select [[[:inline 1] :present]]
                 :from   [[:metabase_field :f]]
                 :join   [[:metabase_table :t]    [:= :t.id :f.table_id]
                          [:metabase_database :d] [:= :d.id :t.db_id]]
                 :where  [:and
                          [:= :d.name db-name]
                          [:= [:coalesce :t.schema [:inline ""]] [:coalesce schema [:inline ""]]]
                          [:= :t.name tbl-name]
                          [:= :f.name leaf]
                          [:= [:coalesce :f.nfc_path [:inline ""]] [:coalesce path [:inline ""]]]
                          [:= :f.is_defective_duplicate [:inline false]]]
                 :limit  1})))))

(defn- walk-ancestor-chain!
  "Walk up the parent chain from portable id `pid`, depth-first. For each
  ancestor not already in `cache!`:
    - if it exists in `metabase_field`, cache `:exists` and stop;
    - else recurse on its own parent (one element shorter), then conj a stub
      spec for `pid` to `stub-specs!` (root-first dependency order).

  `cache!` is a `volatile!` keyed by portable-id vector, valued either
  `:exists` (already in live) or `:stub` (will be inserted as part of this
  run)."
  [pid cache! stub-specs!]
  (when-not (contains? @cache! pid)
    (if (parent-exists-in-metabase-field? pid)
      (vswap! cache! assoc pid :exists)
      (let [parent-pid (when (> (count pid) 4) (subvec pid 0 (dec (count pid))))]
        (when parent-pid
          (walk-ancestor-chain! parent-pid cache! stub-specs!))
        (vswap! stub-specs! conj {:portable-id        pid
                                  :parent-portable-id parent-pid})
        (vswap! cache! assoc pid :stub)))))

(defn compute-stubs!
  "Walk every distinct unresolved-parent portable id in staging and return a
  vector of stub specs `{:portable-id ... :parent-portable-id ...}` for the
  ancestors missing from `metabase_field`. Specs are returned in dependency
  order (root before descendant) so a sequential insert can JOIN to its
  parent.

  Read-only against `metabase_field`; produces Clojure data only. Idempotent."
  []
  (let [missing-keys (collect-missing-parent-portable-ids)
        cache        (volatile! {})
        stub-specs   (volatile! [])]
    (doseq [k missing-keys]
      (walk-ancestor-chain! k cache stub-specs))
    @stub-specs))

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
  "Columns clobbered on UPDATE-EXISTS in [[merge-fields!]]. The matched-row
  payload is overwritten regardless of whether values changed (the import is
  an alternate sync). `parent_id` and `fk_target_field_id` are not clobbered:
  parent_id is part of the match key (already correct on a matched row),
  and fk_target_field_id is set later by phase 4."
  [:base_type :database_type :description
   :effective_type :semantic_type :coercion_strategy :nfc_path])

(defn- staging-clobber-subquery
  "Build the correlated subquery `metabase_field`'s `merge-fields!` UPDATE uses
  to fetch a column value from the matched staging row. Same JOIN+match shape
  for every column — only the SELECT differs."
  [col]
  {:select [(keyword (str "fi." (name col)))]
   :from   [[:metabase_field_import :fi]]
   :join   [[:metabase_database :d] [:= :d.name :fi.db_name]
            [:metabase_table :t]    [:and
                                     [:= :t.db_id :d.id]
                                     [:= [:coalesce :t.schema [:inline ""]] [:coalesce :fi.table_schema [:inline ""]]]
                                     [:= :t.name :fi.table_name]
                                     [:= :t.is_defective_duplicate [:inline false]]]]
   :where  [:and
            [:= :metabase_field.table_id :t.id]
            [:= :metabase_field.name :fi.field_name]
            [:= :metabase_field.unique_field_helper [:coalesce :fi.parent_id [:inline 0]]]]})

(defn merge-fields!
  "Merge `metabase_field_import` into `metabase_field` atomically, in two SQL
  statements wrapped in a single `t2/with-transaction`:

    1. **INSERT** rows whose natural key isn't already present in
       `metabase_field` (active OR inactive — stubs participate so the
       NOT EXISTS catches them and the second statement clobbers them).
       Sets `active=true`, `is_defective_duplicate=false`,
       `fk_target_field_id=NULL` (phase 4 fills it).
    2. **UPDATE** matched rows by clobbering the seven payload columns
       (`base_type`, `database_type`, `description`, `effective_type`,
       `semantic_type`, `coercion_strategy`, `nfc_path`), setting
       `active=true` (flips stubs to live), bumping `updated_at`. Each
       SET column uses a correlated subquery on staging.

  Match key is `(table_id, name, unique_field_helper)` where
  `unique_field_helper = COALESCE(parent_id, 0)` — stable across re-imports
  and lookup-friendly via the existing unique index.

  Composes with an outer `t2/with-transaction`: when commit-3's orchestrator
  wraps tables-merge + stub-insert + this together, all participate in the
  outer txn's all-or-nothing semantics."
  []
  (t2/with-transaction [_]
    ;; INSERT rows that don't already exist
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
        :where [:not [:exists {:select [[[:inline 1]]]
                               :from [[:metabase_field :f]]
                               :where [:and
                                       [:= :f.table_id :t.id]
                                       [:= :f.name :fi.field_name]
                                       [:= :f.unique_field_helper [:coalesce :fi.parent_id [:inline 0]]]
                                       [:= :f.is_defective_duplicate [:inline false]]]}]]}]})
    ;; UPDATE matched rows (clobber payload, flip active=true, bump updated_at)
    (t2/query
     {:update :metabase_field
      :set    (-> (into {} (map (fn [c] [c (staging-clobber-subquery c)])) fields-clobber-cols)
                  (assoc :active     [:inline true]
                         :updated_at :%now))
      :where  [:and
               [:= :metabase_field.is_defective_duplicate [:inline false]]
               [:exists {:select [[[:inline 1]]]
                         :from [[:metabase_field_import :fi]]
                         :join [[:metabase_database :d] [:= :d.name :fi.db_name]
                                [:metabase_table :t]    [:and
                                                         [:= :t.db_id :d.id]
                                                         [:= [:coalesce :t.schema [:inline ""]] [:coalesce :fi.table_schema [:inline ""]]]
                                                         [:= :t.name :fi.table_name]
                                                         [:= :t.is_defective_duplicate [:inline false]]]]
                         :where [:and
                                 [:= :metabase_field.table_id :t.id]
                                 [:= :metabase_field.name :fi.field_name]
                                 [:= :metabase_field.unique_field_helper [:coalesce :fi.parent_id [:inline 0]]]]}]]})))

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

  Match key: `(table_id, name, unique_field_helper)` against staging's
  natural-key columns + `COALESCE(fi.parent_id, 0)`. The OWN row is
  identified by its own staging columns; we set its `fk_target_field_id`
  to the staging row's `fk_target_id` (resolved earlier in the merge txn
  by [[resolve-fk-target-ids-in-staging!]]).

  Driver-blind via t2 + correlated subquery in SET. No second file read —
  every value comes from staging.

  Composes with an outer transaction (t2 joins outer)."
  []
  (t2/with-transaction [_]
    (t2/query
     {:update :metabase_field
      :set    {:fk_target_field_id
               {:select [:fi.fk_target_id]
                :from   [[:metabase_field_import :fi]]
                :join   [[:metabase_database :d] [:= :d.name :fi.db_name]
                         [:metabase_table :t]    [:and
                                                  [:= :t.db_id :d.id]
                                                  [:= [:coalesce :t.schema [:inline ""]] [:coalesce :fi.table_schema [:inline ""]]]
                                                  [:= :t.name :fi.table_name]
                                                  [:= :t.is_defective_duplicate [:inline false]]]]
                :where  [:and
                         [:= :metabase_field.table_id :t.id]
                         [:= :metabase_field.name :fi.field_name]
                         [:= :metabase_field.unique_field_helper [:coalesce :fi.parent_id [:inline 0]]]
                         [:!= :fi.fk_target_id nil]]}}
      :where  [:and
               [:= :metabase_field.is_defective_duplicate [:inline false]]
               [:exists {:select [[[:inline 1]]]
                         :from [[:metabase_field_import :fi]]
                         :join [[:metabase_database :d] [:= :d.name :fi.db_name]
                                [:metabase_table :t]    [:and
                                                         [:= :t.db_id :d.id]
                                                         [:= [:coalesce :t.schema [:inline ""]] [:coalesce :fi.table_schema [:inline ""]]]
                                                         [:= :t.name :fi.table_name]
                                                         [:= :t.is_defective_duplicate [:inline false]]]]
                         :where [:and
                                 [:= :metabase_field.table_id :t.id]
                                 [:= :metabase_field.name :fi.field_name]
                                 [:= :metabase_field.unique_field_helper [:coalesce :fi.parent_id [:inline 0]]]
                                 [:!= :fi.fk_target_id nil]]}]]})))

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

