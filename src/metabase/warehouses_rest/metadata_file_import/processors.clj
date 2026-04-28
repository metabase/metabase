(ns metabase.warehouses-rest.metadata-file-import.processors
  "Pure batch processors for the metadata file importer.

  Each `process-*!` function takes a batch of `[line-num row]` tuples (plus
  loader-pre-resolved id mappings where relevant), validates every row up
  front, runs the bulk SQL once per batch, and returns an `eduction` that
  emits one result map per input row in input order.

  The eduction shape lets callers compose with `reduce` / `transduce` without
  ever materializing a full per-batch result vector. The eager work (validation,
  SELECT, INSERT, UPDATE, DELETE) runs at call time so re-iteration is safe and
  validation errors surface immediately rather than at consumption time.

  No HTTP coupling; no NDJSON; no `ArrayList` buffer. Errors propagate as
  `ex-info` with `:kind`, `:line`, and `:source-id` attribution so the loader
  can produce useful boot-time error messages.

  All SQL is generated through toucan2 / HoneySQL plus a single hand-rolled
  `VALUES`-table UPDATE in [[finalize-batch-sql+params]]. The latter pattern
  is portable across Postgres, H2, and MySQL 8+ — see [[process-fields-fk-finalize!]]."
  (:require
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouses-rest.metadata-file-import.schemas :as schemas]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def ^:const import-batch-size
  "Row batch size shared by all processors. An 8-column field row at 2000 rows/batch is 16k
  prepared-statement parameters — safely under Postgres' 65535 cap and MySQL's default
  `max_allowed_packet`."
  2000)

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

;;; ============================== databases (batch) ==============================

(defn- engine-name
  "Normalize `engine` (string or keyword) to a string for natural-key comparison.
  Toucan2's `:model/Database` reads `:engine` as a keyword via `define-after-select`,
  but file-imported rows always carry strings. Normalize both sides to string."
  [engine]
  (when engine (name engine)))

(defn- match-databases-batch
  "Look up every existing target Database matching any source row in the batch. Returns
  a `{[name engine-string] → existing-id}` map. Over-includes by `(name IN ..., engine IN ...)`
  then intersects against the actual source pairs in Clojure — keeps the SQL portable across
  Postgres / H2 / MySQL (no `(col, col) IN ((?, ?), ...)` tuple form)."
  [lines]
  (let [pairs   (into #{}
                      (map (fn [{:keys [name engine]}] [name (engine-name engine)]))
                      lines)
        names   (into #{} (map first) pairs)
        engines (into #{} (map second) pairs)]
    (if (or (empty? names) (empty? engines))
      {}
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
  "Validate every row, look up each by `(name, engine)` against `:model/Database`, and emit
  one result map per input row in input order. Returns an eduction.

  Result shapes:
    `{:source-id N :target-id M :status :matched}`
    `{:source-id N :status :no-match :line L :detail S}`

  Phase 1 is **non-fatal**: unmatched databases produce `:no-match` results that the loader
  logs as WARN and uses to skip dependent tables/fields. Validation failures throw."
  [batch]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/database-info ln line {:source-id (:id line)}))
  (let [match-idx (match-databases-batch (mapv second batch))]
    (eduction
     (map (fn [[ln {:keys [id name engine]}]]
            (if-let [target (match-idx [name (engine-name engine)])]
              {:source-id id :target-id target :status :matched}
              {:source-id id
               :status    :no-match
               :line      ln
               :detail    (format "No database with name=%s engine=%s"
                                  (pr-str name) (pr-str (engine-name engine)))})))
     batch)))

;;; ============================== tables (batch) ==============================

(defn- match-tables-batch
  "Look up every existing target Table matching any of the (target-db-id, schema, name)
  triples in `lines`, scoped to `active=true AND is_defective_duplicate=false`. Returns
  `{[db-id schema name] → existing-id}`. Over-includes by `(db_id IN ..., name IN ...)`
  in SQL then intersects in Clojure — keeps nil schemas correct without per-DBMS
  IS-NULL gymnastics."
  [lines]
  (let [triples (into #{} (map (juxt :db_id :schema :name)) lines)
        db-ids  (into #{} (keep :db_id) lines)
        names   (into #{} (keep :name) lines)]
    (if (or (empty? db-ids) (empty? names))
      {}
      (let [rows (t2/select [:model/Table :id :db_id :schema :name]
                            {:where [:and
                                     [:= :active true]
                                     [:= :is_defective_duplicate false]
                                     [:in :db_id db-ids]
                                     [:in :name names]]})]
        (into {}
              (comp (map (fn [{:keys [id db_id schema name]}] [[db_id schema name] id]))
                    (filter (fn [[triple _]] (contains? triples triple))))
              rows)))))

(defn- new-table-row
  "Row for inserting into `:metabase_table` via the raw table keyword, deliberately
  bypassing `:model/Table`'s `define-after-insert` hook → `set-new-table-permissions!`.
  That hook acquires `with-db-scoped-permissions-lock` per table; on a bulk insert of
  ~1700+ tables in one transaction it exhausts Postgres' `max_locks_per_transaction`.

  This is **safe on a fresh appdb** whose Database row carries default DB-level
  permissions, but **not safe** against an appdb where any group has gone
  table-granular on the target Database — those tables would silently lack their
  per-table permission rows. The batched-grant fix is tracked as item 6 in
  METADATA_FILE_IMPORT_PLAN.md.

  Replicates the non-permission defaults `:model/Table`'s `define-before-insert`
  applies (`display_name`, `data_layer`). `field_order` falls back to the column
  default `'database'`."
  [{:keys [db_id name schema description]}]
  (let [now (mi/now)]
    (cond-> {:db_id               db_id
             :name                name
             :schema              schema
             :display_name        (humanization/name->human-readable-name name)
             :data_layer          "internal"
             :active              true
             :initial_sync_status "complete"
             :created_at          now
             :updated_at          now}
      (some? description) (assoc :description description))))

(defn- patch-matched-tables!
  "Patch-on-match policy (§10c): when a matched target table exists and the source
  carries a non-nil `:description`, update the target's description. Remove the
  body of this fn to flip to no-patch."
  [target-lines match-idx]
  (doseq [{:keys [db_id schema name description]} target-lines
          :when (and (contains? match-idx [db_id schema name])
                     (some? description))]
    (t2/update! :model/Table (get match-idx [db_id schema name])
                {:description description})))

(defn- bulk-insert-unmatched-tables!
  "Bulk-insert every `target-line` whose `(db_id, schema, name)` triple is absent
  from `match-idx`. Returns `{[db-id schema name] → new-id}` for the inserted rows
  so callers can resolve target ids in input order."
  [target-lines match-idx]
  (let [unmatched   (filterv (fn [{:keys [db_id schema name]}]
                               (not (contains? match-idx [db_id schema name])))
                             target-lines)
        insert-rows (mapv new-table-row unmatched)
        new-ids     (when (seq insert-rows)
                      (t2/insert-returning-pks! :metabase_table insert-rows))]
    (zipmap (map (juxt :db_id :schema :name) unmatched) new-ids)))

(defn process-tables!
  "Validate every row, remap `db_id` through `db-id-map` (skipping rows whose source
  db_id has no target), match-or-insert by `(target-db-id, schema, name)`, and emit
  one result map per input row in input order. Returns an eduction.

  Result shapes:
    `{:source-id N :target-id M :status :matched}`
    `{:source-id N :target-id M :status :inserted}`
    `{:source-id N :status :no-target-db :line L :detail S}`

  Patch-on-match policy: see [[patch-matched-tables!]] (§10c). Removing that call
  flips this processor to no-patch."
  [batch db-id-map]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/table-info ln line {:source-id (:id line)}))
  (let [target-lines (into []
                           (keep (fn [[_ln {:keys [db_id] :as line}]]
                                   (when-let [tgt (get db-id-map db_id)]
                                     (assoc line :db_id tgt))))
                           batch)
        match-idx    (match-tables-batch target-lines)]
    (patch-matched-tables! target-lines match-idx)
    (let [id-by-nat (bulk-insert-unmatched-tables! target-lines match-idx)]
      (eduction
       (map (fn [[ln {src-id :id, src-db :db_id, :keys [schema name]}]]
              (if-let [tgt-db (get db-id-map src-db)]
                (if-let [existing (get match-idx [tgt-db schema name])]
                  {:source-id src-id :target-id existing :status :matched}
                  {:source-id src-id :target-id (get id-by-nat [tgt-db schema name])
                   :status :inserted})
                {:source-id src-id :status :no-target-db :line ln
                 :detail   (format "Source db_id=%s has no target mapping"
                                   (pr-str src-db))})))
       batch))))

;;; ==================== fields (batch) — phase-3 insert pass ====================

(defn- match-fields-batch
  "Look up every existing target Field matching any (target_table_id, name, target_parent_id)
  triple in `lines`, scoped to `active=true AND is_defective_duplicate=false`. Returns
  `{[table-id name parent-id] → existing-id}`. Same over-include + intersect pattern as
  [[match-tables-batch]]; nil parent_ids (root fields) round-trip correctly through Clojure
  equality without per-DBMS IS-NULL gymnastics."
  [lines]
  (let [triples (into #{} (map (juxt :table_id :name :parent_id)) lines)
        tbl-ids (into #{} (keep :table_id) lines)
        names   (into #{} (keep :name) lines)]
    (if (or (empty? tbl-ids) (empty? names))
      {}
      (let [rows (t2/select [:model/Field :id :table_id :name :parent_id]
                            {:where [:and
                                     [:= :active true]
                                     [:= :is_defective_duplicate false]
                                     [:in :table_id tbl-ids]
                                     [:in :name names]]})]
        (into {}
              (comp (map (fn [{:keys [id table_id name parent_id]}]
                           [[table_id name parent_id] id]))
                    (filter (fn [[triple _]] (contains? triples triple))))
              rows)))))

(defn- field-patch
  "Writable metadata keys for the patch-on-match branch (§10c). Excludes `parent_id`
  (set correctly at insert time, never re-parented on match) and `fk_target_field_id`
  (owned by phase 4)."
  [{:keys [description semantic_type effective_type coercion_strategy]}]
  (cond-> {}
    (some? description)       (assoc :description description)
    (some? semantic_type)     (assoc :semantic_type semantic_type)
    (some? effective_type)    (assoc :effective_type effective_type)
    (some? coercion_strategy) (assoc :coercion_strategy coercion_strategy)))

(defn- new-field-row
  "Row for inserting into `:model/Field` during phase 3. `parent_id` carries the
  loader-resolved target id (or nil for root fields); `is_defective_duplicate` is
  always FALSE — the §11a multi-pass-by-depth design satisfies `idx_unique_field`
  by construction. `fk_target_field_id` starts NULL; phase 4 fills it in."
  [{:keys [name base_type database_type description effective_type
           semantic_type coercion_strategy]}
   target-table-id
   resolved-parent-id]
  (cond-> {:table_id               target-table-id
           :name                   name
           :base_type              base_type
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
  "Cache key for matching a classified field row against [[match-fields-batch]]'s output."
  [{:keys [target-table-id resolved-parent row]}]
  [target-table-id (:name row) resolved-parent])

(defn- classify-fields-batch
  "Project resolvable rows into the shape downstream helpers expect: each entry carries
  the line number, the original row, the loader-resolved target table id, and the
  loader-resolved parent id. Drops rows whose source `table_id` has no target."
  [batch table-id-map]
  (into []
        (keep (fn [[ln line resolved-parent-id]]
                (when-let [tgt-tbl (get table-id-map (:table_id line))]
                  {:line             ln
                   :row              line
                   :target-table-id  tgt-tbl
                   :resolved-parent  resolved-parent-id})))
        batch))

(defn- patch-matched-fields!
  "Patch-on-match policy (§10c): for each in-row that matches an existing target field,
  if the source carries patchable metadata (description / semantic_type / effective_type /
  coercion_strategy), issue an UPDATE. Remove the body of this fn to flip to no-patch."
  [in-rows match-idx]
  (doseq [{:as in-row :keys [row]} in-rows
          :let [match-key (field-match-key in-row)
                patch     (field-patch row)]
          :when (and (contains? match-idx match-key) (seq patch))]
    (t2/update! :model/Field (get match-idx match-key) patch)))

(defn- bulk-insert-unmatched-fields!
  "Bulk-insert every classified row that doesn't match an existing target field.
  Returns `{[target-table-id name resolved-parent] → new-id}` so callers can
  resolve target ids in input order."
  [in-rows match-idx]
  (let [unmatched   (filterv (fn [in-row] (not (contains? match-idx (field-match-key in-row))))
                             in-rows)
        insert-rows (mapv (fn [{:keys [target-table-id resolved-parent row]}]
                            (new-field-row row target-table-id resolved-parent))
                          unmatched)
        new-ids     (when (seq insert-rows)
                      (t2/insert-returning-pks! :model/Field insert-rows))]
    (zipmap (map field-match-key unmatched) new-ids)))

(defn process-fields-insert-pass!
  "Phase-3 batch processor for fields, called once per batch within the loader's
  multi-pass-by-depth loop.

  Tuple shape: `[line-num row resolved-parent-id-or-nil]`. The loader has already
  (a) skipped rows whose source id is in the field id-map, and
  (b) resolved each row's source `parent_id` to a target id via the field id-map,
      passing nil for root fields. Rows whose `parent_id` couldn't be resolved
      this pass were classified as deferred by the loader and don't appear in
      the batch.

  This processor remaps `table_id` via `table-id-map`, validates every row, runs
  one batched SELECT for matches, applies metadata patches on match (§10c policy),
  and bulk-inserts unmatched rows. Returns an eduction.

  Result shapes:
    `{:source-id N :target-id M :status :matched}`
    `{:source-id N :target-id M :status :inserted}`
    `{:source-id N :status :no-target-table :line L :detail S}`

  Patch-on-match: see [[patch-matched-fields!]] (§10c). Removing that call flips
  this processor to no-patch."
  [batch table-id-map]
  (doseq [[ln line _resolved-parent] batch]
    (validate-line! ::schemas/field-info ln line {:source-id (:id line)}))
  (let [in-rows   (classify-fields-batch batch table-id-map)
        match-idx (match-fields-batch
                   (mapv (fn [{:keys [target-table-id resolved-parent row]}]
                           {:table_id  target-table-id
                            :name      (:name row)
                            :parent_id resolved-parent})
                         in-rows))]
    (patch-matched-fields! in-rows match-idx)
    (let [id-by-key (bulk-insert-unmatched-fields! in-rows match-idx)]
      (eduction
       (map (fn [[ln {src-id :id, src-tbl :table_id, fld-name :name} resolved-parent]]
              (if-let [tgt-tbl (get table-id-map src-tbl)]
                (let [match-key [tgt-tbl fld-name resolved-parent]]
                  (if-let [existing (get match-idx match-key)]
                    {:source-id src-id :target-id existing :status :matched}
                    {:source-id src-id :target-id (get id-by-key match-key)
                     :status :inserted}))
                {:source-id src-id :status :no-target-table :line ln
                 :detail   (format "Source table_id=%s has no target mapping"
                                   (pr-str src-tbl))})))
       batch))))

;;; ==================== fields (batch) — phase-4 fk finalize ====================

(defn- finalize-batch-sql+params
  "Build a single `UPDATE metabase_field` statement that sets `fk_target_field_id` for
  every `[target-id resolved-fk-target-id]` pair in `tuples`. Uses scalar subqueries
  over a `VALUES` table — portable across Postgres, H2, and MySQL 8+. The first
  VALUES row casts to INTEGER so later all-null columns can't be inferred as text."
  [tuples]
  (let [n               (count tuples)
        tuple-sql       (fn [idx]
                          (if (zero? idx)
                            "(CAST(? AS INTEGER), CAST(? AS INTEGER))"
                            "(?, ?)"))
        values-sql      (str/join ", " (map tuple-sql (range n)))
        in-placeholders (str/join ", " (repeat n "?"))
        values-params   (into [] cat tuples)
        id-params       (mapv first tuples)
        sql (str "UPDATE metabase_field SET "
                 "fk_target_field_id = (SELECT v.fk_target_field_id "
                 "FROM (VALUES " values-sql ") AS v(id, fk_target_field_id) "
                 "WHERE v.id = metabase_field.id) "
                 "WHERE id IN (" in-placeholders ")")]
    (into [sql] (concat values-params id-params))))

(defn- raise-finalize-row-mismatch!
  "Called when the finalize UPDATE affected fewer rows than the batch — find which
  target id is missing and throw `:not_found` with row attribution. Falls back to
  `:server_error` if every target id is present (shouldn't happen with the batched
  UPDATE, but defensive)."
  [batch tuples affected]
  (let [target-ids (mapv first tuples)
        present    (into #{} (map :id)
                         (t2/query (into [(str "SELECT id FROM metabase_field WHERE id IN ("
                                               (str/join ", " (repeat (count target-ids) "?")) ")")]
                                         target-ids)))
        missing    (some (fn [[ln {src-id :id} tgt-id _]]
                           (when-not (contains? present tgt-id)
                             [ln src-id tgt-id]))
                         batch)]
    (when-let [[ln src-id tgt-id] missing]
      (throw (ex-info "not_found"
                      {:kind      :not_found
                       :line      ln
                       :source-id src-id
                       :target-id tgt-id
                       :detail    (format "Target field with id=%d does not exist" tgt-id)})))
    (throw (ex-info "finalize UPDATE affected fewer rows than the batch but no ids are missing"
                    {:kind   :server_error
                     :detail (format "updated=%d batch=%d" affected (count batch))}))))

(defn process-fields-fk-finalize!
  "Phase-4 batch processor for finalizing `fk_target_field_id` references.

  Tuple shape: `[line-num row resolved-target-id resolved-fk-target-id]`. The loader has
  (a) skipped rows with null `fk_target_field_id`, and
  (b) resolved both the row's own source id AND its `fk_target_field_id` to target ids
      via the field id-map. Both resolved values are guaranteed non-null — misses are
      detected by the loader and hard-fail per §10 (corrupt file).

  The SQL writes ONLY `fk_target_field_id`. Phase 3 already set `parent_id` correctly at
  insert time; `is_defective_duplicate` was always false. Bypasses `:model/Field`'s
  `define-before-update` hook (which would issue a per-row `FieldUserSettings` SELECT
  and silently merge stored user settings over the payload).

  Returns an eduction of `{:source-id N :target-id M :status :updated}` per input row."
  [batch]
  (doseq [[ln row _target-id _fk-target-id] batch]
    (validate-line! ::schemas/field-info ln row {:source-id (:id row)}))
  (when (seq batch)
    (let [tuples   (mapv (fn [[_ln _row tgt-id fk-tgt]] [tgt-id fk-tgt]) batch)
          affected (try (first (t2/query (finalize-batch-sql+params tuples)))
                        (catch Throwable e
                          (throw (wrap-row-error e nil nil))))]
      (when (not= affected (count batch))
        (raise-finalize-row-mismatch! batch tuples affected))))
  (eduction
   (map (fn [[_ln {src-id :id} tgt-id _fk-tgt]]
          {:source-id src-id :target-id tgt-id :status :updated}))
   batch))

;;; ============================ field values (batch) ============================

(def ^:private ^:const field-values-advanced-types
  "Non-`'full'` FieldValues types. Kept in sync with `field-values/advanced-field-values-types`."
  ["sandbox" "linked-filter"])

(defn- find-existing-full-field-values
  "Look up every existing 'full' FieldValues row for any of `target-field-ids`. Returns
  `{field-id → fieldvalues-id}`."
  [target-field-ids]
  (if (empty? target-field-ids)
    {}
    (into {}
          (map (juxt :field_id :id))
          (t2/query
           (into [(str "SELECT id, field_id FROM metabase_fieldvalues "
                       "WHERE type = 'full' AND hash_key IS NULL AND field_id IN ("
                       (str/join ", " (repeat (count target-field-ids) "?")) ")")]
                 target-field-ids)))))

(defn- delete-advanced-field-values!
  "Bulk DELETE pre-existing `'sandbox'` / `'linked-filter'` FieldValues for `field-ids`,
  mirroring `:model/FieldValues`'s `define-before-insert` at batch granularity."
  [field-ids]
  (when (seq field-ids)
    (t2/query
     (into [(str "DELETE FROM metabase_fieldvalues "
                 "WHERE type IN ('" (str/join "', '" field-values-advanced-types) "') "
                 "AND field_id IN ("
                 (str/join ", " (repeat (count field-ids) "?")) ")")]
           field-ids))))

(defn- bulk-insert-full-field-values!
  "Bulk-INSERT new 'full' FieldValues rows for every entry in `to-insert`. Bypasses
  `:model/FieldValues`'s `define-before-insert` because we DELETE the same advanced
  types ourselves in [[delete-advanced-field-values!]] — going through the model
  would N-multiply that work."
  [to-insert]
  (when (seq to-insert)
    (t2/insert! :metabase_fieldvalues
                (mapv (fn [{:keys [target-field-id line-data]}]
                        (let [{:keys [values has_more_values human_readable_values]} line-data
                              now (mi/now)]
                          (cond-> {:field_id        target-field-id
                                   :type            "full"
                                   :hash_key        nil
                                   :values          (mi/json-in (or values []))
                                   :has_more_values has_more_values
                                   :created_at      now
                                   :updated_at      now}
                            (some? human_readable_values)
                            (assoc :human_readable_values (mi/json-in human_readable_values)))))
                      to-insert))))

(defn- update-existing-full-field-values!
  "Per-row UPDATE for FieldValues rows that already had a 'full' entry. Goes through
  `:model/FieldValues` so the model's JSON encoding hooks fire on the payload."
  [to-update existing-by-field]
  (doseq [{:keys [target-field-id line-data]} to-update
          :let [{:keys [values has_more_values human_readable_values]} line-data]]
    (t2/update! :model/FieldValues (get existing-by-field target-field-id)
                (cond-> {:values          (or values [])
                         :has_more_values has_more_values}
                  (some? human_readable_values)
                  (assoc :human_readable_values human_readable_values)))))

(defn- classify-field-values-batch
  "Project resolvable rows into the shape downstream helpers expect: each entry carries
  the line number, the original row data, and the loader-resolved target field id.
  Drops rows whose source `field_id` has no target."
  [batch resolve-field-id-fn]
  (into []
        (keep (fn [[ln line]]
                (when-let [tgt (resolve-field-id-fn (:field_id line))]
                  (when (pos? tgt)
                    {:line ln :line-data line :target-field-id tgt}))))
        batch))

(defn process-field-values!
  "Phase-5 batch processor for field values. Each input row is upserted into
  `metabase_fieldvalues` with `type='full'` and `hash_key=NULL`.

  `resolve-field-id-fn` is a Clojure-callable (function or map) that maps a source
  `:field_id` to a target field id (or returns nil/-1 for a miss). The loader
  typically passes a thin wrapper around the disk-spooled IdMap.

  Per batch: one batch SELECT for existing 'full' rows, one bulk DELETE of advanced
  ('sandbox' / 'linked-filter') FieldValues for fields about to receive a new
  'full' row (mirrors `:model/FieldValues`'s `define-before-insert` at batch
  granularity), one bulk INSERT for new 'full' rows, and per-row UPDATE for
  existing ones.

  Returns an eduction.

  Result shapes:
    `{:source-field-id S :target-field-id T :status :inserted}`
    `{:source-field-id S :target-field-id T :status :updated}`
    `{:source-field-id S :status :no-target-field :line L :detail D}`"
  [batch resolve-field-id-fn]
  (doseq [[ln line] batch]
    (validate-line! ::schemas/field-values-info ln line
                    {:source-field-id (:field_id line)}))
  (let [in-rows           (classify-field-values-batch batch resolve-field-id-fn)
        target-field-ids  (mapv :target-field-id in-rows)
        existing-by-field (find-existing-full-field-values target-field-ids)
        {:keys [to-insert to-update]} (group-by (fn [{:keys [target-field-id]}]
                                                  (if (contains? existing-by-field target-field-id)
                                                    :to-update :to-insert))
                                                in-rows)]
    (delete-advanced-field-values! (mapv :target-field-id to-insert))
    (bulk-insert-full-field-values! to-insert)
    (update-existing-full-field-values! to-update existing-by-field)
    (eduction
     (map (fn [[ln {:keys [field_id]}]]
            (let [tgt (resolve-field-id-fn field_id)]
              (if (and tgt (pos? tgt))
                (if (contains? existing-by-field tgt)
                  {:source-field-id field_id :target-field-id tgt :status :updated}
                  {:source-field-id field_id :target-field-id tgt :status :inserted})
                {:source-field-id field_id :status :no-target-field :line ln
                 :detail (format "Source field_id=%s has no target mapping"
                                 (pr-str field_id))}))))
     batch)))
