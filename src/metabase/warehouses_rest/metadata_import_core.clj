(ns metabase.warehouses-rest.metadata-import-core
  "Pure batch processors for the metadata import pipeline — no HTTP / NDJSON coupling.

  Shared by two callers:

    - `metabase.warehouses-rest.api.metadata-import` — the streaming NDJSON endpoints under
      `POST /api/database/metadata/*` and `POST /api/database/field-values`.
    - `metabase.warehouses-rest.metadata-file-import` — the boot-time loader that streams a
      JSON file on disk (pointed at by `MB_TABLE_METADATA_PATH` / `MB_FIELD_VALUES_PATH`).

  Each `process-*-batch!` takes a batch of `[line-num parsed-map]` tuples plus a
  `java.util.ArrayList` buffer; the processor runs validation + DB writes, and pushes response
  maps (`{:old_id :new_id|:existing_id|:error ...}` / `{:id :ok true}` / `{:field_id :created|:updated true}`)
  into the buffer. Callers wrap the call in their own transaction per batch and drain the buffer
  afterwards — the HTTP path writes the buffer to an NDJSON response stream; the file path folds
  it into in-memory id maps for the next phase."
  (:require
   [clojure.string :as str]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (java.sql SQLException)
   (java.util ArrayList)))

(set! *warn-on-reflection* true)

(def ^:const import-batch-size
  "Row batch size shared by both callers. An 8-column field row at 2000 rows/batch is 16k
  prepared-statement parameters — safely under Postgres' 65535 cap and MySQL's default
  `max_allowed_packet`."
  2000)

;;; ============================== Error utilities ==============================

(defn unique-violation?
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

(defn bad-input!
  "Throw an `ex-info` classified as `:invalid_input`. `line-num` may be nil when the caller
  doesn't track line numbers (file path synthesizes 1-indexed array positions for the same slot)."
  [line-num field-name detail & extras]
  (throw (ex-info (format "invalid_input: %s" field-name)
                  (apply hash-map
                         :kind :invalid_input
                         :line line-num
                         :detail detail
                         extras))))

(defn wrap-row-error
  "Tag an exception from a per-row processor with `:line` and echo-extras so the caller can
  attribute the failure to a specific row. Already-classified `ExceptionInfo` (one with `:kind`
  in its ex-data) passes through unchanged — it carries its own attribution from the throw site.
  Unrecognized exceptions are classified as `:unique_violation` (SQLState match) or `:server_error`."
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

(defn- engine-name
  "Normalize `engine` (string or keyword) to a string for natural-key lookup."
  [engine]
  (when engine (name engine)))

;;; ============================== databases (per-line) ==============================

(defn process-databases-line!
  "Match one database payload entry against an existing `:model/Database` by `(name, engine)`.
  Appends one response map per call — either `{:old_id :new_id}` on match or
  `{:old_id :error \"no_match\" :line :detail}` when no target database is found. Callers log the
  `no_match` entries and skip dependent tables/fields for those `old_id`s."
  [^ArrayList buffer line-num {:keys [id name engine]}]
  (try
    (when-not (int? id)
      (bad-input! line-num "id" "id is required and must be an integer"))
    (when-not (string? name)
      (bad-input! line-num "name" "name is required and must be a string" :old_id id))
    (when-not (or (string? engine) (keyword? engine))
      (bad-input! line-num "engine" "engine is required" :old_id id))
    (if-some [match (t2/select-one [:model/Database :id]
                                   :name   name
                                   :engine (engine-name engine))]
      (.add buffer {:old_id id :new_id (:id match)})
      (.add buffer {:old_id id
                    :error  "no_match"
                    :line   line-num
                    :detail (format "No database with name=%s engine=%s"
                                    (pr-str name) (pr-str (engine-name engine)))}))
    (catch Throwable e
      (throw (wrap-row-error e line-num {:old_id id})))))

;;; ============================== tables (batch) ==============================

(defn- validate-tables-line!
  [line-num {:keys [id db_id name] :as _line}]
  (when-not (int? id)
    (bad-input! line-num "id" "id is required and must be an integer"))
  (when-not (int? db_id)
    (bad-input! line-num "db_id" "db_id is required and must be an integer" :old_id id))
  (when-not (string? name)
    (bad-input! line-num "name" "name is required and must be a string" :old_id id)))

(defn- match-tables-batch
  "Look up every existing `(db_id, schema, name)` match for the batch in one SELECT, scoped to
  `active=true AND is_defective_duplicate=false`. Returns `{[db-id schema name] → existing-id}`.
  Over-includes on `(db_id IN ..., name IN ...)` then intersects in Clojure — keeps SQL simple
  for large batches and handles nil schemas correctly."
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
  "Row for bulk-inserting into `:metabase_table` via a raw table keyword, bypassing `:model/Table`
  insert hooks. The only skipped side-effect is `define-after-insert → set-new-table-permissions!`;
  that call takes a `with-db-scoped-permissions-lock` per table and exhausts Postgres'
  `max_locks_per_transaction` after ~1700 rows in one batch transaction.

  Safe on the demo path (fresh target appdb whose Database row carries default DB-level
  permissions). Not safe against an appdb where any group has gone table-granular on the target
  DB — skipped tables would get no per-table permission entry.

  Replicates the non-perms defaults `:model/Table`'s `define-before-insert` would apply:
  `display_name`, `data_layer`. `field_order` falls back to the DB column default (`'database'`);
  no driver overrides `metabase.driver/default-field-order`."
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

(defn process-tables-batch!
  "Validate every line, pre-fetch matches in one SELECT, pre-check referenced `db_id`s in one
  SELECT, bulk-insert unmatched rows in one statement, and emit response records in original
  batch order. Matched rows with a non-nil `description` get a per-row UPDATE."
  [batch ^ArrayList buffer]
  (doseq [[ln line] batch]
    (try
      (validate-tables-line! ln line)
      (catch Throwable e
        (throw (wrap-row-error e ln {:old_id (:id line)})))))
  (let [lines     (mapv second batch)
        match-idx (match-tables-batch lines)
        unmatched (filterv (fn [{:keys [db_id schema name]}]
                             (not (contains? match-idx [db_id schema name])))
                           lines)]
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
    (doseq [{:keys [db_id schema name description]} lines
            :when (and (contains? match-idx [db_id schema name]) (some? description))]
      (t2/update! :model/Table (get match-idx [db_id schema name]) {:description description}))
    (let [rows      (mapv new-table-row unmatched)
          new-ids   (when (seq rows) (t2/insert-returning-pks! :metabase_table rows))
          id-by-nat (zipmap (map (juxt :db_id :schema :name) unmatched) new-ids)]
      (doseq [[_ln {:keys [id db_id schema name]}] batch]
        (if-let [existing (get match-idx [db_id schema name])]
          (.add buffer {:old_id id :existing_id existing})
          (.add buffer {:old_id id :new_id (get id-by-nat [db_id schema name])}))))))

;;; ============================== fields (batch) — insert pass ==============================

(defn- match-root-field
  "Match an incoming root-level field by `(table_id, name) AND parent_id IS NULL`, scoped to
  active + not defective."
  [table-id name]
  (t2/select-one [:model/Field :id]
                 {:where [:and
                          [:= :table_id table-id]
                          [:= :name name]
                          [:= :parent_id nil]
                          [:= :active true]
                          [:= :is_defective_duplicate false]]}))

(defn- matched-field-patch
  "Writable keys for a matched field — excludes `parent_id` (never re-parent matched rows) and
  `fk_target_field_id` (handled in the finalize pass)."
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
  "Classify a field line as `[:match echo]` (already present on target) or `[:insert row echo]`
  (new row to bulk-insert); throws `ex-info` on validation failure or missing target table."
  [line-num {:keys [id table_id name base_type database_type] :as line}]
  (try
    (when-not (int? id)
      (bad-input! line-num "id" "id is required and must be an integer"))
    (when-not (int? table_id)
      (bad-input! line-num "table_id" "table_id is required and must be an integer" :old_id id))
    (when-not (string? name)
      (bad-input! line-num "name" "name is required and must be a string" :old_id id))
    (when-not (string? base_type)
      (bad-input! line-num "base_type" "base_type is required and must be a string" :old_id id))
    (when-not (string? database_type)
      (bad-input! line-num "database_type" "database_type is required and must be a string" :old_id id))
    (if-some [existing (match-root-field table_id name)]
      (let [patch (matched-field-patch line)]
        (when (seq patch)
          (t2/update! :model/Field (:id existing) patch))
        [:match {:old_id id :existing_id (:id existing)}])
      (if-not (t2/exists? :model/Table :id table_id)
        (throw (ex-info "invalid_table_id"
                        {:kind   :invalid_table_id
                         :line   line-num
                         :old_id id
                         :detail (format "Table with id=%d does not exist" table_id)}))
        [:insert (new-defective-field-row line) {:old_id id}]))
    (catch Throwable e
      (throw (wrap-row-error e line-num {:old_id id})))))

(defn process-fields-batch!
  "Classify each line, bulk-insert the `:insert` rows, and append response records to `buffer`
  in input order. Any throwable propagates out (rolling back the batch at the caller's tx)."
  [batch ^ArrayList buffer]
  (let [classified  (mapv (fn [[line-num line]] (classify-fields-line! line-num line)) batch)
        insert-rows (into [] (keep (fn [[tag row _echo]] (when (= tag :insert) row))) classified)
        new-ids     (when (seq insert-rows)
                      (t2/insert-returning-pks! :model/Field insert-rows))
        id-queue    (volatile! (seq new-ids))]
    (doseq [[tag payload echo] classified]
      (case tag
        :match  (.add buffer payload)
        :insert (let [nid (first @id-queue)]
                  (vswap! id-queue next)
                  (.add buffer (merge echo {:new_id nid})))))))

;;; ============================== fields (batch) — finalize pass ==============================

(defn- validate-finalize-line!
  "Validate one finalize line and return `[line-num id parent_id fk_target_field_id]`."
  [line-num {:keys [id parent_id fk_target_field_id] :as _line}]
  (when-not (int? id)
    (bad-input! line-num "id" "id is required and must be an integer"))
  (when-not (or (nil? parent_id) (int? parent_id))
    (bad-input! line-num "parent_id" "parent_id must be an integer or null" :id id))
  (when-not (or (nil? fk_target_field_id) (int? fk_target_field_id))
    (bad-input! line-num "fk_target_field_id" "fk_target_field_id must be an integer or null" :id id))
  [line-num id parent_id fk_target_field_id])

(defn- finalize-batch-sql+params
  "Build a single `UPDATE metabase_field ...` statement that applies every validated finalize row
  at once. Uses scalar subqueries over a `VALUES` table so the same SQL works on Postgres, H2,
  and MySQL."
  [validated]
  (let [row-count (count validated)
        tuple-sql (fn [idx]
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

(defn process-finalize-batch!
  "Validate every line, issue one batched UPDATE per batch, and push one `{:id N :ok true}` per
  input line into `buffer`. Bypasses `:model/Field` `:define-before-update` (which would issue a
  per-row `FieldUserSettings` SELECT and silently merge stored user settings over the finalize
  payload)."
  [batch ^ArrayList buffer]
  (let [validated (mapv (fn [[ln line]]
                          (try (validate-finalize-line! ln line)
                               (catch Throwable e
                                 (throw (wrap-row-error e ln {:id (:id line)})))))
                        batch)
        [_sql & _ :as q] (finalize-batch-sql+params validated)
        updated   (try
                    (first (t2/query q))
                    (catch Throwable e
                      (throw (wrap-row-error e nil nil))))]
    (when (not= updated (count validated))
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
        (throw (ex-info "finalize UPDATE affected fewer rows than the batch but no ids are missing"
                        {:kind   :server_error
                         :detail (format "updated=%d batch=%d" updated (count validated))}))))
    (doseq [[_ln id _ _] validated]
      (.add buffer {:id id :ok true}))))

;;; ============================== field values (batch) ==============================

(def ^:private ^:const field-values-advanced-types
  "Non-`:full` FieldValues types. Kept in sync with `field-values/advanced-field-values-types`."
  ["sandbox" "linked-filter"])

(defn- validate-field-values-line!
  [line-num {:keys [field_id values has_more_values human_readable_values] :as _line}]
  (when-not (int? field_id)
    (bad-input! line-num "field_id" "field_id is required and must be an integer"))
  ;; Accept both `clojure.lang.PersistentVector` (cheshire-decoded NDJSON) and
  ;; `java.util.ArrayList` (Jackson-decoded from the file loader) — both are `java.util.List`.
  (when-not (instance? java.util.List values)
    (bad-input! line-num "values" "values is required and must be an array"
                :field_id field_id))
  {:line                  line-num
   :field_id              field_id
   :values                (or values [])
   :has_more_values       (boolean has_more_values)
   :human_readable_values human_readable_values})

(defn process-field-values-batch!
  "Validate every line, issue a fixed number of statements per batch regardless of batch size:
  one presence-check SELECT against `metabase_field`, one SELECT of existing full FieldValues,
  one bulk DELETE of per-field advanced FieldValues (mirrors `define-before-insert` at batch
  granularity), and one bulk INSERT. Updates happen per-row — rare on the demo path."
  [batch ^ArrayList buffer]
  (let [validated (mapv (fn [[ln line]]
                          (try (validate-field-values-line! ln line)
                               (catch Throwable e
                                 (throw (wrap-row-error e ln {:field_id (:field_id line)})))))
                        batch)
        field-ids (mapv :field_id validated)]
    (when (seq field-ids)
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
    (let [existing-rows     (when (seq field-ids)
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
        (t2/query (into [(str "DELETE FROM metabase_fieldvalues "
                              "WHERE type IN ('" (str/join "', '" field-values-advanced-types) "') "
                              "AND field_id IN ("
                              (str/join ", " (repeat (count to-insert) "?")) ")")]
                        (map :field_id to-insert)))
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
      (doseq [{:keys [field_id values has_more_values human_readable_values]} to-update]
        (t2/update! :model/FieldValues (get existing-by-field field_id)
                    (cond-> {:values          values
                             :has_more_values has_more_values}
                      (some? human_readable_values)
                      (assoc :human_readable_values human_readable_values))))
      (doseq [{:keys [field_id]} validated]
        (if (contains? existing-by-field field_id)
          (.add buffer {:field_id field_id :updated true})
          (.add buffer {:field_id field_id :created true}))))))
