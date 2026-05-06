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
   [metabase.models.interface :as mi]
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

(defn- resolve-table-ids-batch
  "Resolve each distinct portable `:table_id` triple in `lines` to a target
  integer table id. Returns `{[db-name schema-or-nil table-name] → target-id}`
  with vector keys."
  [lines]
  (let [triples   (into #{} (keep (fn [{:keys [table_id]}] (some-> table_id vec))) lines)
        db-names  (into #{} (map #(get % 0)) triples)
        tbl-names (into #{} (map #(get % 2)) triples)]
    (if (empty? triples)
      {}
      (let [rows (t2/query {:select [[:t.id :id] [:t.schema :schema]
                                     [:t.name :tbl-name] [:d.name :db-name]]
                            :from   [[:metabase_table :t]]
                            :join   [[:metabase_database :d] [:= :t.db_id :d.id]]
                            :where  [:and
                                     [:= :t.active true]
                                     [:= :t.is_defective_duplicate false]
                                     [:in :d.name db-names]
                                     [:in :t.name tbl-names]]})]
        (into {}
              (comp (map (fn [{:keys [id schema tbl-name db-name]}]
                           [[db-name schema tbl-name] id]))
                    (filter (fn [[triple _]] (contains? triples triple))))
              rows)))))

(defn- decode-nfc-path
  "Decode `metabase_field.nfc_path` (JSON-encoded string or NULL) to a Clojure
  vector or nil."
  [s]
  (some-> s json/decode vec))

(defn- encode-nfc-path
  "Encode a parent-ancestry path vector for storage in `metabase_field.nfc_path`.
  Returns the JSON-encoded string for non-empty paths, nil for empty/nil — root
  fields and depth-1 stubs have NULL `nfc_path`."
  [anc-path]
  (when (seq anc-path)
    (json/encode anc-path)))

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

(defn- new-stub-field-row
  "Row map for inserting a placeholder stub field — marker fields
  `database_type=\"__stub__\"` + `base_type=\"type/*\"` + `active=false`."
  [target-table-id parent-vec resolved-parent-id]
  (let [pv         (vec parent-vec)
        leaf-name  (peek pv)
        ;; `nfc-path` for the parent storage row = the parent's `:id` minus the
        ;; `[db schema table]` prefix and the leaf name. Empty for flat-root
        ;; parents (length-4 :id), non-empty for middle parents.
        anc-path   (not-empty (subvec pv 3 (dec (count pv))))
        now        (mi/now)]
    {:table_id               target-table-id
     :name                   leaf-name
     :nfc_path               (encode-nfc-path anc-path)
     :parent_id              resolved-parent-id
     :base_type              stub-base-type
     :database_type          stub-database-type
     :active                 false
     :is_defective_duplicate false
     :fk_target_field_id     nil
     :created_at             now
     :updated_at             now}))

(defn- ensure-ancestors!
  "Walk up the parent chain from `parent-vec` until hitting an existing ancestor
  (in `cache!` or via natural-key SELECT) or reaching the table root. Insert
  placeholder stub rows depth-first for every missing ancestor on the way back
  down. Returns the int id of the immediate parent (real or just-inserted stub).
  `cache!` is a `volatile!` `{portable-vec → int}` updated in place.

  Future optimization: bulk-insert per depth level."
  [parent-vec target-table-id cache!]
  (letfn [(reduce-down [parent-int-id missing]
            ;; missing was built leaf-side-first; reverse for root-first inserts
            (reduce (fn [pid stub-pid]
                      (let [stub-row (new-stub-field-row target-table-id stub-pid pid)
                            stub-id  (first (t2/insert-returning-pks! :model/Field [stub-row]))]
                        (vswap! cache! assoc stub-pid stub-id)
                        stub-id))
                    parent-int-id
                    (rseq missing)))]
    (loop [pid (vec parent-vec), missing []]
      (if-let [hit (get @cache! pid)]
        (reduce-down hit missing)
        (let [resolved (resolve-parent-ids-batch [pid])]
          (if-let [hit (get resolved pid)]
            (do (vswap! cache! assoc pid hit)
                (reduce-down hit missing))
            (if (= 4 (count pid))
              ;; root-level stub — no further ancestor exists
              (let [stub-row (new-stub-field-row target-table-id pid nil)
                    stub-id  (first (t2/insert-returning-pks! :model/Field [stub-row]))]
                (vswap! cache! assoc pid stub-id)
                (reduce-down stub-id missing))
              ;; recurse on the parent of pid
              (recur (vec (butlast pid)) (conj missing pid)))))))))

(defn- match-fields-batch
  "Look up every existing target Field matching any (target-table-id, name,
  target-parent-id) triple in `lines`. Returns
  `{[table-id name parent-id] → existing-id}`.

  Scoped to `is_defective_duplicate=false`; `active` is not filtered (stubs
  included)."
  [lines]
  (let [triples (into #{} (map (juxt :table_id :name :parent_id)) lines)
        tbl-ids (into #{} (keep :table_id) lines)
        names   (into #{} (keep :name) lines)]
    (if (or (empty? tbl-ids) (empty? names))
      {}
      (let [rows (t2/select [:model/Field :id :table_id :name :parent_id]
                            {:where [:and
                                     [:= :is_defective_duplicate false]
                                     [:in :table_id tbl-ids]
                                     [:in :name names]]})]
        (into {}
              (comp (map (fn [{:keys [id table_id name parent_id]}]
                           [[table_id name parent_id] id]))
                    (filter (fn [[triple _]] (contains? triples triple))))
              rows)))))

(defn- field-clobber
  "Payload that overwrites a matched field row. Excludes `parent_id` — the
  natural-key match already fixes it on the matched row. `fk_target_field_id`
  is set by [[process-fields-fk-resolve!]]. Sets `active=true` to flip stubs
  to live."
  [{:keys [base_type database_type description semantic_type effective_type coercion_strategy]}]
  (cond-> {:active true}
    (some? base_type)         (assoc :base_type base_type)
    (some? database_type)     (assoc :database_type database_type)
    (some? description)       (assoc :description description)
    (some? semantic_type)     (assoc :semantic_type semantic_type)
    (some? effective_type)    (assoc :effective_type effective_type)
    (some? coercion_strategy) (assoc :coercion_strategy coercion_strategy)))

(defn- new-field-row
  "Insert payload for a real field. Caller has already resolved
  `resolved-parent-id` and `store-nfc-path`. `fk_target_field_id` starts
  NULL — set by [[process-fields-fk-resolve!]]."
  [{:keys [name base_type database_type description effective_type
           semantic_type coercion_strategy]}
   target-table-id
   resolved-parent-id
   store-nfc-path]
  (cond-> {:table_id               target-table-id
           :name                   name
           :base_type              base_type
           :nfc_path               (encode-nfc-path store-nfc-path)
           :parent_id              resolved-parent-id
           :fk_target_field_id     nil
           :is_defective_duplicate false
           :active                 true}
    (some? database_type)     (assoc :database_type database_type)
    (some? description)       (assoc :description description)
    (some? effective_type)    (assoc :effective_type effective_type)
    (some? semantic_type)     (assoc :semantic_type semantic_type)
    (some? coercion_strategy) (assoc :coercion_strategy coercion_strategy)))

(defn- field-match-key
  [{:keys [target-table-id resolved-parent row]}]
  [target-table-id (:name row) resolved-parent])

(defn- classify-fields-batch
  "Resolve `:target-table-id`, `:resolved-parent`, and `:store-nfc-path` for
  each row. Returns `[{:line :row :target-table-id :resolved-parent :store-nfc-path}]`,
  preserving input order. Drops rows whose `:table_id` doesn't resolve."
  [batch table-id-map parent-cache!]
  (into []
        (keep (fn [[ln line]]
                (when-let [tgt-tbl (get table-id-map (vec (:table_id line)))]
                  (let [parent-vec      (some-> (:parent_id line) vec)
                        resolved-parent (when parent-vec
                                          (or (get @parent-cache! parent-vec)
                                              (ensure-ancestors! parent-vec tgt-tbl parent-cache!)))
                        store-nfc-path  (some-> (:nfc_path line) vec)]
                    {:line             ln
                     :row              line
                     :target-table-id  tgt-tbl
                     :resolved-parent  resolved-parent
                     :store-nfc-path   store-nfc-path}))))
        batch))

(defn- clobber-matched-fields!
  "Overwrites each matched target field with the [[field-clobber]] payload.
  Stubs and real-row re-imports go through the same path."
  [in-rows match-idx]
  (doseq [{:as in-row :keys [row]} in-rows
          :let [match-key (field-match-key in-row)
                payload   (field-clobber row)]
          :when (contains? match-idx match-key)]
    (t2/update! :model/Field (get match-idx match-key) payload)))

(defn- bulk-insert-unmatched-fields!
  "Bulk-INSERT every classified row that doesn't match an existing target field.
  Returns `{[target-table-id name resolved-parent] → new-id}`."
  [in-rows match-idx]
  (let [unmatched   (filterv (fn [in-row] (not (contains? match-idx (field-match-key in-row))))
                             in-rows)
        insert-rows (mapv (fn [{:keys [target-table-id resolved-parent store-nfc-path row]}]
                            (new-field-row row target-table-id resolved-parent store-nfc-path))
                          unmatched)
        new-ids     (when (seq insert-rows)
                      (t2/insert-returning-pks! :model/Field insert-rows))]
    (zipmap (map field-match-key unmatched) new-ids)))

(defn process-fields!
  "Process a batch of `[line-num row]` field tuples. Match-or-insert against
  the target appdb (overwrites matched rows; stubs absent parents). Returns
  an eduction of result maps:

    `{:source-id <portable-field-id> :target-id M :status :matched}`
    `{:source-id <portable-field-id> :target-id M :status :inserted}`
    `{:source-id <portable-field-id> :status :no-target-table :line L :detail S}`

  `:source-id` is the row's portable field id (a vector ending with the
  field's leaf name)."
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/field-info ln line {:source-id (portable-field-id-vec line)}))
  (let [lines         (mapv second batch)
        table-id-map  (resolve-table-ids-batch lines)
        parent-vecs   (into #{}
                            (keep (fn [line] (some-> (:parent_id line) vec)))
                            lines)
        parent-cache! (volatile! (resolve-parent-ids-batch parent-vecs))
        in-rows       (classify-fields-batch batch table-id-map parent-cache!)
        match-idx     (match-fields-batch
                       (mapv (fn [{:keys [target-table-id resolved-parent row]}]
                               {:table_id  target-table-id
                                :name      (:name row)
                                :parent_id resolved-parent})
                             in-rows))]
    (clobber-matched-fields! in-rows match-idx)
    (let [id-by-key (bulk-insert-unmatched-fields! in-rows match-idx)
          ;; line-number → classified record (some lines may have been filtered out).
          by-line   (into {} (map (juxt :line identity)) in-rows)]
      (eduction
       (map (fn [[ln line]]
              (let [src-id (portable-field-id-vec line)]
                (if-let [classified (get by-line ln)]
                  (let [match-key (field-match-key classified)]
                    (if-let [existing (get match-idx match-key)]
                      {:source-id src-id :target-id existing :status :matched}
                      {:source-id src-id :target-id (get id-by-key match-key)
                       :status :inserted}))
                  {:source-id src-id :status :no-target-table :line ln
                   :detail   (format "No target table with portable id=%s"
                                     (pr-str (vec (:table_id line))))}))))
       batch))))

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
