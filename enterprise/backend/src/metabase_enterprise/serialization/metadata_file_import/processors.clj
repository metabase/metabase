(ns metabase-enterprise.serialization.metadata-file-import.processors
  "Pure batch processors for the metadata file importer.

  Each `process-*!` function takes a batch of `[line-num row]` tuples,
  validates every row up front, runs the bulk SQL once per batch, and returns
  an `eduction` that emits one result map per input row in input order.

  The eduction shape lets callers compose with `reduce` / `transduce` without
  ever materializing a full per-batch result vector. The eager work (validation,
  SELECT, INSERT, UPDATE, DELETE) runs at call time so re-iteration is safe and
  validation errors surface immediately rather than at consumption time.

  Errors propagate as `ex-info` with `:kind`, `:line`, and `:source-id`
  attribution so the loader can produce useful boot-time error messages."
  (:require
   [malli.error :as me]
   [metabase-enterprise.serialization.metadata-file-import.parsers :as parsers]
   [metabase-enterprise.serialization.metadata-file-import.schemas :as schemas]
   [metabase.models.humanization :as humanization]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io File)
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def import-batch-size
  "Row batch size shared by all processors."
  500)

;;; ============================== Error utilities ==============================

(defn- unique-violation?
  "True if `e` or any cause is a SQL unique-constraint violation. Handles Postgres and H2 via
  SQLState `\"23505\"` (SQL:2003 standard) and MySQL/MariaDB via SQLState `\"23000\"` + vendor
  error code 1062."
  [^Throwable e]
  (loop [^Throwable cause e]
    (cond
      (nil? cause) false
      (instance? SQLException cause)
      (let [sql-ex ^SQLException cause]
        (or (case (.getSQLState sql-ex)
              "23505" true
              "23000" (= 1062 (.getErrorCode sql-ex))
              false)
            (recur (.getCause cause))))
      :else (recur (.getCause cause)))))

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

(defn- wrap-row-error
  "Tag an exception from a per-row processor with `:line` and `echo-extras` so the caller can
  attribute the failure to a specific row. An already-classified `ExceptionInfo` (one whose
  ex-data carries `:kind`) passes through unchanged — it carries its own attribution from the
  throw site. Unrecognized exceptions get classified as `:unique_violation` (SQLState match) or
  `:server_error`."
  [^Throwable e line-num echo-extras]
  (let [data (when (instance? ExceptionInfo e) (ex-data e))]
    (if (:kind data)
      e
      (ex-info (.getMessage e)
               (merge echo-extras
                      {:kind   (if (unique-violation? e) :unique_violation :server_error)
                       :line   line-num
                       :detail (.getMessage e)})
               e))))

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

(defn- portable-field-id-vec
  "Wire `:id` normalized to a Clojure vector. The export emits `:id` directly;
  the importer reads it verbatim and only normalizes container type so it can
  be used as a hash-map key (Jackson's ArrayList and Clojure's PersistentVector
  hash differently past the array-map size threshold)."
  [{:keys [id]}]
  (vec id))

(defn- decode-nfc-path
  "Decode `metabase_field.nfc_path` (JSON-encoded string or NULL) to a Clojure
  vector or nil."
  [s]
  (some-> s json/decode vec))

(defn- resolve-parent-ids-batch
  "Resolve each portable field id in `parent-vecs` to a target integer field id.
  Returns `{parent-vec → target-int-id}` (vector keys), omitting parents not
  found on the target.

  Input vecs may be any storage shape; reconstruction branches per the shape,
  mirroring [[metabase-enterprise.serialization.metadata/external-field-id]]:

    - storage `parent_id` non-NULL: `[db schema table & nfc-path & leaf-name]`
    - storage `parent_id` NULL, `nfc_path` non-empty: `[db schema table & nfc-path]`
    - both NULL: `[db schema table leaf-name]`

  Resolves stubs from prior batches (matched on natural key, not on `active`)."
  [parent-vecs]
  (let [parents   (into #{} (map vec) parent-vecs)
        ;; Probe by `(db, table)` only — `:f.name` would miss JSON-unfolded
        ;; leaves whose storage `name` differs from anything in the wire id.
        db-names  (into #{} (map #(get % 0)) parents)
        tbl-names (into #{} (map #(get % 2)) parents)]
    (if (empty? parents)
      {}
      (let [rows (t2/query {:select [[:f.id :id] [:f.name :leaf-name] [:f.nfc_path :nfc-path]
                                     [:f.parent_id :parent-id]
                                     [:t.schema :schema] [:t.name :tbl-name] [:d.name :db-name]]
                            :from   [[:metabase_field :f]]
                            :join   [[:metabase_table :t]    [:= :f.table_id :t.id]
                                     [:metabase_database :d] [:= :t.db_id :d.id]]
                            :where  [:and
                                     [:= :f.is_defective_duplicate false]
                                     [:= :t.active true]
                                     [:= :t.is_defective_duplicate false]
                                     [:in :d.name db-names]
                                     [:in :t.name tbl-names]]})]
        (into {}
              (keep (fn [{:keys [id db-name schema tbl-name leaf-name nfc-path parent-id]}]
                      (let [anc (decode-nfc-path nfc-path)
                            pv  (cond
                                  ;; storage parent_id non-NULL
                                  (some? parent-id)
                                  (-> [db-name schema tbl-name]
                                      (into (or anc []))
                                      (conj leaf-name))
                                  ;; storage parent_id NULL, nfc_path non-empty —
                                  ;; full path including the leaf
                                  (seq anc)
                                  (into [db-name schema tbl-name] anc)
                                  ;; both NULL
                                  :else
                                  [db-name schema tbl-name leaf-name])]
                        (when (contains? parents pv)
                          [pv id]))))
              rows)))))

;;; ==================== fields (batch) — fk resolve ====================

(defn- finalize-batch!
  "Run a single `UPDATE metabase_field` that sets `fk_target_field_id` for every
  `[target-id resolved-fk-target-id]` pair in `tuples`. Returns the affected-row
  count."
  [tuples]
  (let [case-expr (-> (reduce (fn [c [id fk]]
                                (-> c (conj [:= :id id]) (conj fk)))
                              [:case]
                              tuples)
                      (conj :else :fk_target_field_id))
        ids       (mapv first tuples)]
    (first (t2/query {:update :metabase_field
                      :set    {:fk_target_field_id case-expr}
                      :where  [:in :id ids]}))))

(defn process-fields-fk-resolve!
  "Process a batch of `[line-num row]` field tuples, writing `:fk_target_field_id`
  on rows that have one. By the time this runs, every referenced field (own row
  or fk target) exists in the appdb as a real or stub row, so a resolve miss is
  treated as a corrupt file (hard-fail).

  Result shapes:
    `{:source-id <portable-field-id> :target-id M :status :updated}` (rows with fk-target)
    `{:source-id <portable-field-id> :status :no-fk}`                 (rows without)"
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/field-info ln line {:source-id (portable-field-id-vec line)}))
  (let [fk-rows (filterv (fn [[_ line]] (some? (:fk_target_field_id line))) batch)]
    (if (empty? fk-rows)
      (eduction
       (map (fn [[_ln line]] {:source-id (portable-field-id-vec line) :status :no-fk}))
       batch)
      (let [own-vecs  (mapv (fn [[_ line]] (portable-field-id-vec line)) fk-rows)
            fk-vecs   (mapv (fn [[_ line]] (vec (:fk_target_field_id line))) fk-rows)
            all-vecs  (into #{} (concat own-vecs fk-vecs))
            id-by-vec (resolve-parent-ids-batch all-vecs)
            tuples
            (mapv (fn [[ln _line] own-vec fk-vec]
                    (let [own-id (get id-by-vec own-vec)
                          fk-id  (get id-by-vec fk-vec)]
                      (when-not own-id
                        (throw (ex-info "fk-resolve: row's own portable id not found in target appdb"
                                        {:kind :not_found :line ln :source-id own-vec
                                         :detail (format "Row not found in target appdb: %s"
                                                         (pr-str own-vec))})))
                      (when-not fk-id
                        (throw (ex-info "fk-resolve: fk_target_field_id portable id not found in target appdb"
                                        {:kind :not_found :line ln :source-id own-vec
                                         :detail (format "FK target not found in target appdb: %s"
                                                         (pr-str fk-vec))})))
                      [own-id fk-id]))
                  fk-rows
                  own-vecs
                  fk-vecs)
            affected (try (finalize-batch! tuples)
                          (catch Throwable e
                            (throw (wrap-row-error e nil nil))))]
        (when (not= affected (count fk-rows))
          (throw (ex-info "fk-resolve UPDATE affected fewer rows than the fk-row batch"
                          {:kind   :server_error
                           :detail (format "updated=%d fk-rows=%d" affected (count fk-rows))})))
        (let [own-by-line (zipmap (mapv first fk-rows) (mapv first tuples))]
          (eduction
           (map (fn [[ln line]]
                  (let [src-id (portable-field-id-vec line)]
                    (if-let [own-id (get own-by-line ln)]
                      {:source-id src-id :target-id own-id :status :updated}
                      {:source-id src-id :status :no-fk}))))
           batch))))))
