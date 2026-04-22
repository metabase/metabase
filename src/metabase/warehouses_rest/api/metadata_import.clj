(ns metabase.warehouses-rest.api.metadata-import
  "Per-endpoint processors and `import-*-ndjson!` wrappers for the streaming metadata-import
  endpoints in `metabase.warehouses-rest.api`. The generic NDJSON streaming driver lives in
  `metabase.warehouses-rest.api.ndjson-import`; this namespace holds the domain-specific glue
  that knows about `:model/Database`, `:model/Table`, `:model/Field`, and `:model/FieldValues`.

  See `METADATA_IMPORT_API_CONTRACT.md` for the shape of the requests and responses."
  (:require
   [clojure.string :as str]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.warehouses-rest.api.ndjson-import :as ndjson-import]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ^:const import-batch-size
  "Row batch size passed to `ndjson-import/stream-import!`. An 8-column field row at 2000 rows/batch
  is 16k prepared-statement parameters — safely under Postgres' 65535 cap and MySQL's default
  `max_allowed_packet`."
  2000)

(defn- engine-name
  "Normalize `engine` (string or keyword) to a string for natural-key lookup."
  [engine]
  (when engine (name engine)))

;;; ----------------------------------------- POST /field-values -----------------------------------------

(def ^:private ^:const field-values-advanced-types
  "Non-`:full` FieldValues types. Kept in sync with `field-values/advanced-field-values-types`."
  ["sandbox" "linked-filter"])

(defn- validate-field-values-line!
  "Validate one field-values line. Throws `ex-info` with `:kind :invalid_input` on failure; otherwise
  returns a normalized map `{:line, :field_id, :values, :has_more_values, :human_readable_values}`."
  [line-num {:keys [field_id values has_more_values human_readable_values] :as _line}]
  (when-not (int? field_id)
    (ndjson-import/bad-input! line-num "field_id" "field_id is required and must be an integer"))
  (when-not (sequential? values)
    (ndjson-import/bad-input! line-num "values" "values is required and must be an array"
                              :field_id field_id))
  {:line                  line-num
   :field_id              field_id
   :values                (or values [])
   :has_more_values       (boolean has_more_values)
   :human_readable_values human_readable_values})

(defn- process-field-values-batch!
  "Validate every line, then issue a fixed number of statements per batch regardless of batch size:
  one presence-check SELECT against `metabase_field`, one SELECT of existing full FieldValues for
  the batch's field ids, one bulk DELETE of any per-field advanced FieldValues (mirroring the
  per-row `define-before-insert` behaviour at batch granularity), and one bulk INSERT for the new
  rows. Updates happen per-row (the demo path has zero updates; this is the documented fallback).

  Bypassing the Toucan2 model for the INSERT avoids firing `define-before-insert` per row — we
  insert directly into the `metabase_fieldvalues` table with pre-serialized JSON. The contract
  hard-codes `type = 'full'` and `hash_key = NULL` for this endpoint, so the model's invariant
  assertions are trivially satisfied."
  [batch ^java.util.ArrayList buffer]
  (let [validated (mapv (fn [[ln line]]
                          (try (validate-field-values-line! ln line)
                               (catch Throwable e
                                 (throw (ndjson-import/wrap-row-error e ln {:field_id (:field_id line)})))))
                        batch)
        field-ids (mapv :field_id validated)]
    (when (seq field-ids)
      ;; `metabase_fieldvalues.field_id` has a FK to `metabase_field.id`, so a missing id would
      ;; raise SQLState 23503 — but that strips per-line attribution and the contract's
      ;; `invalid_field_id` error requires `:line`. One SELECT catches it with full attribution.
      (let [present (into #{} (map :id)
                          (t2/query (into [(str "SELECT id FROM metabase_field WHERE id IN ("
                                                (str/join ", " (repeat (count field-ids) "?")) ")")]
                                          field-ids)))
            missing (first (filter (fn [{:keys [field_id]}] (not (contains? present field_id)))
                                   validated))]
        (when missing
          (throw (ex-info "invalid_field_id"
                          {:kind     :invalid_field_id
                           :line     (:line missing)
                           :field_id (:field_id missing)
                           :detail   (format "Field with id=%d does not exist" (:field_id missing))})))))
    (let [existing-rows (when (seq field-ids)
                          (t2/query (into [(str "SELECT id, field_id FROM metabase_fieldvalues "
                                                "WHERE type = 'full' AND hash_key IS NULL AND field_id IN ("
                                                (str/join ", " (repeat (count field-ids) "?")) ")")]
                                          field-ids)))
          existing-by-field (into {} (map (juxt :field_id :id)) existing-rows)
          {:keys [to-insert to-update]} (group-by (fn [{:keys [field_id]}]
                                                    (if (contains? existing-by-field field_id)
                                                      :to-update :to-insert))
                                                  validated)]
      (when (seq to-insert)
        ;; Mirror `define-before-insert`'s cleanup of advanced FieldValues in one DELETE per batch.
        (t2/query (into [(str "DELETE FROM metabase_fieldvalues "
                              "WHERE type IN ('" (str/join "', '" field-values-advanced-types) "') "
                              "AND field_id IN ("
                              (str/join ", " (repeat (count to-insert) "?")) ")")]
                        (map :field_id to-insert)))
        ;; Bulk INSERT via table keyword (skips `:model/FieldValues` hooks). JSON columns are
        ;; pre-serialized; `created_at`/`updated_at` filled with the app-db's `now()` form.
        (t2/insert! :metabase_fieldvalues
                    (mapv (fn [{:keys [field_id values has_more_values human_readable_values]}]
                            {:field_id              field_id
                             :type                  "full"
                             :hash_key              nil
                             :values                (mi/json-in values)
                             :has_more_values       has_more_values
                             :human_readable_values (when (some? human_readable_values)
                                                      (mi/json-in human_readable_values))
                             :created_at            (mi/now)
                             :updated_at            (mi/now)})
                          to-insert)))
      ;; Updates: the demo path (fresh target) sends zero; per-row is an acceptable fallback.
      (doseq [{:keys [field_id values has_more_values human_readable_values]} to-update]
        (t2/update! :model/FieldValues (get existing-by-field field_id)
                    (cond-> {:values          values
                             :has_more_values has_more_values}
                      (some? human_readable_values)
                      (assoc :human_readable_values human_readable_values))))
      ;; Emit response lines in the original batch order.
      (doseq [{:keys [field_id]} validated]
        (if (contains? existing-by-field field_id)
          (.add buffer {:field_id field_id :updated true})
          (.add buffer {:field_id field_id :created true}))))))

(defn import-field-values-ndjson!
  "Read NDJSON `in`, upsert one `FieldValues` row per line on `field_id`, write NDJSON `out`."
  [^java.io.InputStream in ^java.io.OutputStream out]
  (ndjson-import/stream-import!
   in out import-batch-size
   (fn [batch buffer]
     (process-field-values-batch! batch buffer))))

;;; ----------------------------------------- POST /metadata/databases -----------------------------------------

(defn- process-databases-line!
  [^java.util.ArrayList buffer line-num {:keys [id name engine]}]
  (try
    (when-not (int? id)
      (ndjson-import/bad-input! line-num "id" "id is required and must be an integer"))
    (when-not (string? name)
      (ndjson-import/bad-input! line-num "name" "name is required and must be a string" :old_id id))
    (when-not (or (string? engine) (keyword? engine))
      (ndjson-import/bad-input! line-num "engine" "engine is required" :old_id id))
    (if-some [match (t2/select-one [:model/Database :id]
                                   :name   name
                                   :engine (engine-name engine))]
      (.add buffer {:old_id id :new_id (:id match)})
      (throw (ex-info "no_match"
                      {:kind :no_match
                       :line line-num
                       :old_id id
                       :detail (format "No database with name=%s engine=%s"
                                       (pr-str name) (pr-str (engine-name engine)))})))
    (catch Throwable e
      (throw (ndjson-import/wrap-row-error e line-num {:old_id id})))))

(defn import-databases-ndjson!
  "Read NDJSON `in`, match each line against `:model/Database` by `(name, engine)`, write NDJSON
  `out` with `{old_id, new_id}` per line."
  [^java.io.InputStream in ^java.io.OutputStream out]
  (ndjson-import/stream-import!
   in out import-batch-size
   (fn [batch buffer]
     (doseq [[line-num line] batch]
       (process-databases-line! buffer line-num line)))))

;;; ----------------------------------------- POST /metadata/tables -----------------------------------------

(defn- validate-tables-line!
  [line-num {:keys [id db_id name] :as _line}]
  (when-not (int? id)
    (ndjson-import/bad-input! line-num "id" "id is required and must be an integer"))
  (when-not (int? db_id)
    (ndjson-import/bad-input! line-num "db_id" "db_id is required and must be an integer" :old_id id))
  (when-not (string? name)
    (ndjson-import/bad-input! line-num "name" "name is required and must be a string" :old_id id)))

(defn- match-tables-batch
  "Look up every existing `(db_id, schema, name)` match for the batch in one SELECT, scoped to
  `active=true AND is_defective_duplicate=false`. Returns `{[db-id schema name] → existing-id}`.
  Over-includes by filtering SQL on `(db_id IN ..., name IN ...)` and then precisely intersects
  in Clojure — keeps the generated SQL simple for large batches and correctly handles nil schemas."
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
  "Row for bulk-inserting into `:metabase_table` via a raw table keyword, bypassing the
  `:model/Table` insert hooks. The only hook skipped with any side effect is `define-after-insert →
  set-new-table-permissions!`; that call takes a `with-db-scoped-permissions-lock` cluster lock per
  table, and Postgres runs out of `max_locks_per_transaction` slots after ~1700 per-row
  invocations inside one batch transaction.

  Safe on the demo path (target is a fresh appdb whose Database row carries default DB-level
  permissions from `set-new-database-permissions!`): the skipped hook's decision would be Case 1
  (no-op) anyway. Not safe against an appdb where any group has gone table-granular on the target
  DB — skipped tables would get no per-table permission entry.

  Replicates the non-perms defaults that `:model/Table`'s `define-before-insert` would otherwise
  apply: `display_name`, `data_layer`. `field_order` falls back to the DB column default
  (`'database'`); no existing driver overrides `metabase.driver/default-field-order`."
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

(defn- process-tables-batch!
  "Validate every line, pre-fetch matches in one SELECT, pre-check referenced db_ids in one SELECT,
  bulk-insert unmatched rows in one statement, and emit response records in original batch order.

  Matches with a non-nil `description` still get a per-row UPDATE (matches are rare on the demo
  path); unmatched rows are inserted via the raw `:metabase_table` keyword (see `new-table-row`)."
  [batch ^java.util.ArrayList buffer]
  (doseq [[ln line] batch]
    (try
      (validate-tables-line! ln line)
      (catch Throwable e
        (throw (ndjson-import/wrap-row-error e ln {:old_id (:id line)})))))
  (let [lines     (mapv second batch)
        match-idx (match-tables-batch lines)
        unmatched (filterv (fn [{:keys [db_id schema name]}]
                             (not (contains? match-idx [db_id schema name])))
                           lines)]
    ;; One existence check per batch for the db_ids referenced by unmatched lines.
    (when (seq unmatched)
      (let [needed  (into #{} (keep :db_id) unmatched)
            present (into #{} (map :id)
                          (t2/select [:model/Database :id] :id [:in needed]))
            missing (first (filter (fn [[_ln {:keys [db_id schema name]}]]
                                     (and (some? db_id)
                                          (not (contains? match-idx [db_id schema name]))
                                          (not (contains? present db_id))))
                                   batch))]
        (when-let [[ln {:keys [id db_id]}] missing]
          (throw (ex-info "invalid_db_id"
                          {:kind   :invalid_db_id
                           :line   ln
                           :old_id id
                           :detail (format "Database with id=%d does not exist" db_id)})))))
    ;; Matched rows with a description get a per-row UPDATE. Rare on the demo path.
    (doseq [{:keys [db_id schema name description]} lines
            :when (and (contains? match-idx [db_id schema name]) (some? description))]
      (t2/update! :model/Table (get match-idx [db_id schema name]) {:description description}))
    ;; Unmatched rows: one bulk INSERT bypassing :model/Table hooks. See `new-table-row` docstring.
    (let [rows      (mapv new-table-row unmatched)
          new-ids   (when (seq rows) (t2/insert-returning-pks! :metabase_table rows))
          id-by-nat (zipmap (map (juxt :db_id :schema :name) unmatched) new-ids)]
      (doseq [[_ln {:keys [id db_id schema name]}] batch]
        (if-let [existing (get match-idx [db_id schema name])]
          (.add buffer {:old_id id :existing_id existing})
          (.add buffer {:old_id id :new_id (get id-by-nat [db_id schema name])}))))))

(defn import-tables-ndjson!
  "Read NDJSON `in`, match/insert `:model/Table` rows, write NDJSON `out` with either
  `{old_id, existing_id}` or `{old_id, new_id}` per line."
  [^java.io.InputStream in ^java.io.OutputStream out]
  (ndjson-import/stream-import!
   in out import-batch-size
   (fn [batch buffer]
     (process-tables-batch! batch buffer))))

;;; ----------------------------------------- POST /metadata/fields -----------------------------------------

(defn- match-root-field
  "Match an incoming root-level field by `(table_id, name) AND parent_id IS NULL`, scoped to
  active + not defective. Returns the existing row on match, nil otherwise."
  [table-id name]
  (t2/select-one [:model/Field :id]
                 {:where [:and
                          [:= :table_id table-id]
                          [:= :name name]
                          [:= :parent_id nil]
                          [:= :active true]
                          [:= :is_defective_duplicate false]]}))

(defn- matched-field-patch
  "Writable keys for a matched field — excludes parent_id (never re-parent matched rows) and
  fk_target_field_id (handled in the finalize pass)."
  [{:keys [description semantic_type coercion_strategy effective_type]}]
  (cond-> {}
    (some? description)       (assoc :description description)
    (some? semantic_type)     (assoc :semantic_type semantic_type)
    (some? coercion_strategy) (assoc :coercion_strategy coercion_strategy)
    (some? effective_type)    (assoc :effective_type effective_type)))

(defn- new-defective-field-row
  "Row for the fields insert pass. Every row is inserted with `is_defective_duplicate = true`,
  `parent_id = NULL`, `fk_target_field_id = NULL` so it's exempt from `idx_unique_field`. The
  finalize pass flips the flag and writes the real pointers."
  [{:keys [table_id name base_type database_type description effective_type semantic_type coercion_strategy]}]
  (cond-> {:table_id               table_id
           :name                   name
           :base_type              base_type
           :database_type          database_type
           :active                 true
           :is_defective_duplicate true}
    (some? description)       (assoc :description description)
    (some? effective_type)    (assoc :effective_type effective_type)
    (some? semantic_type)     (assoc :semantic_type semantic_type)
    (some? coercion_strategy) (assoc :coercion_strategy coercion_strategy)))

(defn- classify-fields-line!
  "Classify a field line as `[:match echo]` (already present on target), `[:insert row echo]` (new
  row to bulk-insert), or throws `ex-info` with `:kind :invalid_input` or `:invalid_table_id`.
  For matched root-level rows, the patch UPDATE runs here since we already have the target id.
  Unexpected exceptions from the DB lookups are tagged with `:line` and `:old_id` by
  `ndjson-import/wrap-row-error`."
  [line-num {:keys [id table_id name base_type database_type] :as line}]
  (try
    (when-not (int? id)
      (ndjson-import/bad-input! line-num "id" "id is required and must be an integer"))
    (when-not (int? table_id)
      (ndjson-import/bad-input! line-num "table_id" "table_id is required and must be an integer" :old_id id))
    (when-not (string? name)
      (ndjson-import/bad-input! line-num "name" "name is required and must be a string" :old_id id))
    (when-not (string? base_type)
      (ndjson-import/bad-input! line-num "base_type" "base_type is required and must be a string" :old_id id))
    (when-not (string? database_type)
      (ndjson-import/bad-input! line-num "database_type" "database_type is required and must be a string" :old_id id))
    (if-some [existing (match-root-field table_id name)]
      (let [patch (matched-field-patch line)]
        (when (seq patch)
          (t2/update! :model/Field (:id existing) patch))
        [:match {:old_id id :existing_id (:id existing)}])
      (if-not (t2/exists? :model/Table :id table_id)
        (throw (ex-info "invalid_table_id"
                        {:kind :invalid_table_id
                         :line line-num
                         :old_id id
                         :detail (format "Table with id=%d does not exist" table_id)}))
        [:insert (new-defective-field-row line) {:old_id id}]))
    (catch Throwable e
      (throw (ndjson-import/wrap-row-error e line-num {:old_id id})))))

(defn- process-fields-batch!
  "Classify each line in `batch`, bulk-insert the `:insert` rows, and append response records to
  `buffer` in input order. Any throwable propagates out and rolls back the batch."
  [batch ^java.util.ArrayList buffer]
  (let [classified  (mapv (fn [[line-num line]] (classify-fields-line! line-num line)) batch)
        insert-rows (into [] (keep (fn [[tag row _echo]] (when (= tag :insert) row))) classified)
        new-ids     (when (seq insert-rows)
                      (t2/insert-returning-pks! :model/Field insert-rows))
        id-queue    (volatile! (seq new-ids))]
    (doseq [[tag payload echo] classified]
      (case tag
        :match (.add buffer payload)
        :insert (let [nid (first @id-queue)]
                  (vswap! id-queue next)
                  (.add buffer (merge echo {:new_id nid})))))))

(defn import-fields-ndjson!
  "Read NDJSON `in`, insert fields with `is_defective_duplicate = true` (and `parent_id = NULL`,
  `fk_target_field_id = NULL`) so sibling nested fields don't collide on `idx_unique_field`. Write
  NDJSON `out` with either `{old_id, new_id}` or `{old_id, existing_id}` per line."
  [^java.io.InputStream in ^java.io.OutputStream out]
  (ndjson-import/stream-import!
   in out import-batch-size
   (fn [batch buffer]
     (process-fields-batch! batch buffer))))

;;; ----------------------------------------- POST /metadata/fields/finalize -----------------------------------------

(defn- validate-finalize-line!
  "Validate one finalize line and return `[line-num id parent_id fk_target_field_id]`. Throws
  `ex-info` with `:kind :invalid_input` on validation failures."
  [line-num {:keys [id parent_id fk_target_field_id] :as _line}]
  (when-not (int? id)
    (ndjson-import/bad-input! line-num "id" "id is required and must be an integer"))
  (when-not (or (nil? parent_id) (int? parent_id))
    (ndjson-import/bad-input! line-num "parent_id" "parent_id must be an integer or null" :id id))
  (when-not (or (nil? fk_target_field_id) (int? fk_target_field_id))
    (ndjson-import/bad-input! line-num "fk_target_field_id" "fk_target_field_id must be an integer or null" :id id))
  [line-num id parent_id fk_target_field_id])

(defn- finalize-batch-sql+params
  "Build a single `UPDATE metabase_field ...` statement that applies every validated finalize row
  in one shot. Uses scalar subqueries over a `VALUES` table so the same SQL works on Postgres, H2,
  and MySQL — `UPDATE ... FROM` is Postgres-only and `MERGE` requires Postgres 15 (Metabase supports
  14). Returns `[sql & params]` suitable for `t2/query`."
  [validated]
  (let [row-count (count validated)
        tuple-sql (fn [idx]
                    ;; First tuple casts types so VALUES infers INTEGER/INTEGER even when every row's
                    ;; parent_id / fk_target_field_id is NULL; later tuples can be bare params.
                    (if (zero? idx)
                      "(?, CAST(? AS INTEGER), CAST(? AS INTEGER))"
                      "(?, ?, ?)"))
        values-sql      (str/join ", " (map tuple-sql (range row-count)))
        in-placeholders (str/join ", " (repeat row-count "?"))
        values-params   (into [] (mapcat (fn [[_ln id p fk]] [id p fk])) validated)
        id-params       (mapv (fn [[_ln id _ _]] id) validated)
        sql (str "UPDATE metabase_field SET "
                 "parent_id = (SELECT v.parent_id FROM (VALUES " values-sql
                 ") AS v(id, parent_id, fk_target_field_id) WHERE v.id = metabase_field.id), "
                 "fk_target_field_id = (SELECT v.fk_target_field_id FROM (VALUES " values-sql
                 ") AS v(id, parent_id, fk_target_field_id) WHERE v.id = metabase_field.id), "
                 "is_defective_duplicate = FALSE "
                 "WHERE id IN (" in-placeholders ")")]
    (into [sql] (concat values-params values-params id-params))))

(defn- process-finalize-batch!
  "Validate every line, issue one batched UPDATE, then either emit one `{:id N :ok true}` per
  input line or classify a `:not_found` / `:unique_violation` / `:server_error` via
  `ndjson-import/wrap-row-error`.

  Runs one UPDATE regardless of batch size, bypassing the `:model/Field` `:define-before-update`
  hook — the hook's `sync-user-settings` issues a per-row `FieldUserSettings` select (quadratic
  query count) and worse, silently merges any non-nil user-settings value over the finalize
  payload (so a user-settings `fk_target_field_id` would override the one in the request). The
  contract requires finalize to win, so we write the raw SQL."
  [batch ^java.util.ArrayList buffer]
  (let [validated (mapv (fn [[ln line]]
                          (try (validate-finalize-line! ln line)
                               (catch Throwable e
                                 (throw (ndjson-import/wrap-row-error e ln {:id (:id line)})))))
                        batch)
        [_sql & _ :as q] (finalize-batch-sql+params validated)
        updated   (try
                    (first (t2/query q))
                    (catch Throwable e
                      (throw (ndjson-import/wrap-row-error e nil nil))))]
    (when (not= updated (count validated))
      ;; Short-rows: the UPDATE's row count is less than the batch. Look up exactly which ids are
      ;; missing and throw :not_found tagged with the first missing line. Unique violations would
      ;; already have thrown above via SQLException, so this path is strictly about absent ids.
      (let [batch-ids (mapv (fn [[_ln id _ _]] id) validated)
            present   (into #{} (map :id) (t2/query (into [(str "SELECT id FROM metabase_field WHERE id IN ("
                                                                (str/join ", " (repeat (count batch-ids) "?")) ")")]
                                                          batch-ids)))
            missing   (some (fn [[ln id _ _]] (when-not (contains? present id) [ln id]))
                            validated)]
        (when-let [[ln id] missing]
          (throw (ex-info "not_found"
                          {:kind   :not_found
                           :line   ln
                           :id     id
                           :detail (format "Field with id=%d does not exist" id)})))
        ;; If every id is present but the UPDATE still affected fewer rows, something is very wrong.
        (throw (ex-info "finalize UPDATE affected fewer rows than the batch but no ids are missing"
                        {:kind   :server_error
                         :detail (format "updated=%d batch=%d" updated (count validated))}))))
    (doseq [[_ln id _ _] validated]
      (.add buffer {:id id :ok true}))))

(defn import-fields-finalize-ndjson!
  "Read NDJSON `in`, apply one batched UPDATE per batch setting `parent_id`, `fk_target_field_id`,
  and flipping `is_defective_duplicate = false`. Write NDJSON `out` with `{id, ok: true}` per line."
  [^java.io.InputStream in ^java.io.OutputStream out]
  (ndjson-import/stream-import!
   in out import-batch-size
   (fn [batch buffer]
     (process-finalize-batch! batch buffer))))
