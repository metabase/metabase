(ns metabase.warehouses-rest.metadata-file-import
  "Boot-time loader that streams database metadata + field values from files on disk, mirroring
  the streaming NDJSON endpoints in `metabase.warehouses-rest.api.metadata-import` but without
  the HTTP round-trip. Gated by two environment variables:

    - `MB_TABLE_METADATA_PATH` — path to a JSON document of the shape produced by
      `GET /api/database/metadata`: `{\"databases\": [...], \"tables\": [...], \"fields\": [...]}`.
    - `MB_FIELD_VALUES_PATH`   — path to a JSON document of the shape produced by
      `GET /api/database/field-values`: `{\"field_values\": [...]}`.

  Both are read with Jackson's streaming API so neither file is materialized in memory. If either
  env var is set, `disable-sync` must be true; otherwise startup hard-fails. Missing files also
  hard-fail. Target `:model/Database` rows must already exist for each source `(name, engine)`
  pair — unmatched source databases produce WARN logs and their tables / fields are skipped.

  The batch processors below are a deliberate fork of their counterparts in
  `metabase.warehouses-rest.api.metadata-import`; they should be consolidated once the HTTP +
  file paths are both in production."
  (:require
   [clojure.string :as str]
   [environ.core :as env]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.warehouses.settings :as warehouses.settings]
   [toucan2.core :as t2])
  (:import
   (com.fasterxml.jackson.core JsonParser JsonToken)
   (com.fasterxml.jackson.databind ObjectMapper)
   (java.io File FileInputStream InputStreamReader)
   (java.nio.charset StandardCharsets)
   (java.util ArrayList LinkedHashMap)))

(set! *warn-on-reflection* true)

;;; ============================ Env + config ============================

(def ^:dynamic *env*
  "Environment map. Dynamic for test rebinding; defaults to `environ.core/env`, which strips the
  `MB_` prefix and lowercases with dashes — so `MB_TABLE_METADATA_PATH` is read as
  `:mb-table-metadata-path`."
  env/env)

(def ^:private table-metadata-path-key :mb-table-metadata-path)
(def ^:private field-values-path-key   :mb-field-values-path)

(def ^:private ^:const import-batch-size
  "Row batch size per transaction. Matches the value in the HTTP importer so memory and
  prepared-statement parameter counts have the same ceiling."
  2000)

(defn- env-path
  "Read `*env*` at `k`, treating blank strings as absent."
  [k]
  (let [v (get *env* k)]
    (when (and (string? v) (not (str/blank? v))) v)))

;;; ============================ Forked batch processors ============================
;;;
;;; NOTE: Each section below is a per-phase copy of the equivalent processor in
;;; `metabase.warehouses-rest.api.metadata-import`, with HTTP-response shaping stripped out.
;;; The shape of `buffer` (a `java.util.ArrayList`) is preserved so the call-site code that
;;; folds responses into id-maps looks identical to what the HTTP path does.

(defn- engine-name
  [engine]
  (when engine (name engine)))

(defn- throw-bad-input!
  "Throw an `ex-info` describing an invalid input row. Stops the boot step with a loud error."
  [detail extras]
  (throw (ex-info (str "invalid_input: " detail)
                  (merge {:kind :invalid_input, :detail detail} extras))))

;; ---- databases (per-line) ----

(defn- process-databases-line!
  "Match one database payload entry against an existing `:model/Database` by `(name, engine)`.
  Appends `{:old_id :new_id}` on match or `{:old_id :error \"no_match\" :detail}` otherwise —
  the caller logs and skips downstream tables/fields for unmatched source databases."
  [^ArrayList buffer {:keys [id name engine]}]
  (when-not (int? id) (throw-bad-input! "database id must be an integer" {}))
  (when-not (string? name) (throw-bad-input! "database name must be a string" {:old_id id}))
  (when-not (or (string? engine) (keyword? engine))
    (throw-bad-input! "database engine is required" {:old_id id}))
  (if-some [match (t2/select-one [:model/Database :id]
                                 :name   name
                                 :engine (engine-name engine))]
    (.add buffer {:old_id id :new_id (:id match)})
    (.add buffer {:old_id id
                  :error  "no_match"
                  :detail (format "No database with name=%s engine=%s"
                                  (pr-str name) (pr-str (engine-name engine)))})))

;; ---- tables (batch) ----

(defn- validate-tables-line!
  [{:keys [id db_id name]}]
  (when-not (int? id) (throw-bad-input! "table id must be an integer" {}))
  (when-not (int? db_id) (throw-bad-input! "table db_id must be an integer" {:old_id id}))
  (when-not (string? name) (throw-bad-input! "table name must be a string" {:old_id id})))

(defn- match-tables-batch
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
  "Row for bulk-inserting into `:metabase_table`. Mirrors `new-table-row` in the HTTP path: skips
  `:model/Table` hooks (they'd take one `with-db-scoped-permissions-lock` per row) and re-applies
  the defaults that `define-before-insert` would have set. Safe on the Jekyll demo path where
  the target appdb is fresh and carries default DB-level permissions."
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
  [batch ^ArrayList buffer]
  (doseq [line batch] (validate-tables-line! line))
  (let [match-idx (match-tables-batch batch)
        unmatched (filterv #(not (contains? match-idx [(:db_id %) (:schema %) (:name %)])) batch)]
    (when (seq unmatched)
      (let [needed  (into #{} (keep :db_id) unmatched)
            present (into #{} (map :id)
                          (t2/select [:model/Database :id] :id [:in needed]))
            missing (first (filter (fn [{:keys [db_id schema name]}]
                                     (and (some? db_id)
                                          (not (contains? match-idx [db_id schema name]))
                                          (not (contains? present db_id))))
                                   batch))]
        (when-let [{:keys [id db_id]} missing]
          (throw (ex-info (format "Database with id=%d does not exist" db_id)
                          {:kind :invalid_db_id, :old_id id})))))
    (doseq [{:keys [db_id schema name description]} batch
            :when (and (contains? match-idx [db_id schema name]) (some? description))]
      (t2/update! :model/Table (get match-idx [db_id schema name]) {:description description}))
    (let [rows      (mapv new-table-row unmatched)
          new-ids   (when (seq rows) (t2/insert-returning-pks! :metabase_table rows))
          id-by-nat (zipmap (map (juxt :db_id :schema :name) unmatched) new-ids)]
      (doseq [{:keys [id db_id schema name]} batch]
        (if-let [existing (get match-idx [db_id schema name])]
          (.add buffer {:old_id id :existing_id existing})
          (.add buffer {:old_id id :new_id (get id-by-nat [db_id schema name])}))))))

;; ---- fields (batch) — insert pass with is_defective_duplicate=true ----

(defn- match-root-field
  [table-id name]
  (t2/select-one [:model/Field :id]
                 {:where [:and
                          [:= :table_id table-id]
                          [:= :name name]
                          [:= :parent_id nil]
                          [:= :active true]
                          [:= :is_defective_duplicate false]]}))

(defn- matched-field-patch
  [{:keys [description semantic_type coercion_strategy effective_type]}]
  (cond-> {}
    (some? description)       (assoc :description description)
    (some? semantic_type)     (assoc :semantic_type semantic_type)
    (some? coercion_strategy) (assoc :coercion_strategy coercion_strategy)
    (some? effective_type)    (assoc :effective_type effective_type)))

(defn- new-defective-field-row
  "See `new-defective-field-row` in the HTTP importer — every new row is inserted with
  `is_defective_duplicate = true` so it's exempt from `idx_unique_field`. The finalize pass flips
  the flag after every field exists and `parent_id` can be safely written."
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
  [{:keys [id table_id name base_type database_type] :as line}]
  (when-not (int? id) (throw-bad-input! "field id must be an integer" {}))
  (when-not (int? table_id) (throw-bad-input! "field table_id must be an integer" {:old_id id}))
  (when-not (string? name) (throw-bad-input! "field name must be a string" {:old_id id}))
  (when-not (string? base_type) (throw-bad-input! "field base_type must be a string" {:old_id id}))
  (when-not (string? database_type) (throw-bad-input! "field database_type must be a string" {:old_id id}))
  (if-some [existing (match-root-field table_id name)]
    (let [patch (matched-field-patch line)]
      (when (seq patch)
        (t2/update! :model/Field (:id existing) patch))
      [:match {:old_id id :existing_id (:id existing)}])
    (if-not (t2/exists? :model/Table :id table_id)
      (throw (ex-info (format "Table with id=%d does not exist" table_id)
                      {:kind :invalid_table_id, :old_id id}))
      [:insert (new-defective-field-row line) {:old_id id}])))

(defn- process-fields-batch!
  [batch ^ArrayList buffer]
  (let [classified  (mapv classify-fields-line! batch)
        insert-rows (into [] (keep (fn [[tag row _echo]] (when (= tag :insert) row))) classified)
        new-ids     (when (seq insert-rows) (t2/insert-returning-pks! :model/Field insert-rows))
        id-queue    (volatile! (seq new-ids))]
    (doseq [[tag payload echo] classified]
      (case tag
        :match  (.add buffer payload)
        :insert (let [nid (first @id-queue)]
                  (vswap! id-queue next)
                  (.add buffer (merge echo {:new_id nid})))))))

;; ---- fields (batch) — finalize pass ----

(defn- finalize-batch-sql+params
  "Build one `UPDATE metabase_field ...` statement that sets `parent_id`, `fk_target_field_id`,
  and flips `is_defective_duplicate = false` for every row in the batch. Uses scalar subqueries
  over a `VALUES` table so the same SQL works on Postgres, H2, and MySQL."
  [validated]
  (let [row-count (count validated)
        tuple-sql (fn [idx]
                    (if (zero? idx)
                      "(?, CAST(? AS INTEGER), CAST(? AS INTEGER))"
                      "(?, ?, ?)"))
        values-sql      (str/join ", " (map tuple-sql (range row-count)))
        in-placeholders (str/join ", " (repeat row-count "?"))
        values-params   (into [] (mapcat (fn [[id p fk]] [id p fk])) validated)
        id-params       (mapv first validated)
        sql (str "UPDATE metabase_field SET "
                 "parent_id = (SELECT v.parent_id FROM (VALUES " values-sql
                 ") AS v(id, parent_id, fk_target_field_id) WHERE v.id = metabase_field.id), "
                 "fk_target_field_id = (SELECT v.fk_target_field_id FROM (VALUES " values-sql
                 ") AS v(id, parent_id, fk_target_field_id) WHERE v.id = metabase_field.id), "
                 "is_defective_duplicate = FALSE "
                 "WHERE id IN (" in-placeholders ")")]
    (into [sql] (concat values-params values-params id-params))))

(defn- validate-finalize-line!
  [{:keys [id parent_id fk_target_field_id]}]
  (when-not (int? id) (throw-bad-input! "finalize id must be an integer" {}))
  (when-not (or (nil? parent_id) (int? parent_id))
    (throw-bad-input! "parent_id must be an integer or null" {:id id}))
  (when-not (or (nil? fk_target_field_id) (int? fk_target_field_id))
    (throw-bad-input! "fk_target_field_id must be an integer or null" {:id id}))
  [id parent_id fk_target_field_id])

(defn- process-finalize-batch!
  [batch ^ArrayList buffer]
  (let [validated (mapv validate-finalize-line! batch)
        q         (finalize-batch-sql+params validated)
        updated   (first (t2/query q))]
    (when (not= updated (count validated))
      (throw (ex-info "finalize UPDATE affected fewer rows than the batch"
                      {:kind :not_found
                       :detail (format "updated=%d batch=%d" updated (count validated))})))
    (doseq [[id] validated]
      (.add buffer {:id id :ok true}))))

;; ---- field values (batch) ----

(def ^:private ^:const field-values-advanced-types
  "Non-`:full` FieldValues types cleared before INSERT by `define-before-insert` on the model.
  Mirrored here in one batch-DELETE to match the model's invariant without incurring per-row
  hook cost."
  ["sandbox" "linked-filter"])

(defn- validate-field-values-line!
  [{:keys [field_id values has_more_values human_readable_values]}]
  (when-not (int? field_id) (throw-bad-input! "field_id must be an integer" {}))
  ;; Jackson decodes JSON arrays as `java.util.ArrayList`, which is `java.util.List` but not
  ;; `clojure.lang.Sequential`. Accept both forms so this processor works for file-path inputs.
  (when-not (instance? java.util.List values)
    (throw-bad-input! "values must be an array" {:field_id field_id}))
  {:field_id              field_id
   :values                (or values [])
   :has_more_values       (boolean has_more_values)
   :human_readable_values human_readable_values})

(defn- process-field-values-batch!
  [batch ^ArrayList buffer]
  (let [validated (mapv validate-field-values-line! batch)
        field-ids (mapv :field_id validated)]
    (when (seq field-ids)
      (let [present (into #{} (map :id)
                          (t2/query (into [(str "SELECT id FROM metabase_field WHERE id IN ("
                                                (str/join ", " (repeat (count field-ids) "?")) ")")]
                                          field-ids)))
            missing (first (filter #(not (contains? present (:field_id %))) validated))]
        (when missing
          (throw (ex-info (format "Field with id=%d does not exist" (:field_id missing))
                          {:kind :invalid_field_id, :field_id (:field_id missing)})))))
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

;;; ============================ Streaming JSON reader ============================

(def ^:private ^ObjectMapper object-mapper (ObjectMapper.))

(defn- keywordize
  "Convert a `java.util.Map` parsed by Jackson into a Clojure map with keyword keys. Leaf values
  (including nested `java.util.List`/`java.util.Map`) are left as-is — consumers only need
  keyword access on the top-level entry, which matches what the HTTP processors expect."
  [^LinkedHashMap m]
  (persistent!
   (reduce (fn [acc [k v]] (assoc! acc (keyword k) v))
           (transient {})
           m)))

(defn- advance-to-array!
  "Advance `parser` from start-of-input through a top-level JSON object until we enter the array
  valued at `target-key` (i.e. the parser has just consumed the START_ARRAY token). Throws if
  the key is absent or its value isn't an array."
  [^JsonParser parser ^String target-key]
  (let [t (.nextToken parser)]
    (when (not= t JsonToken/START_OBJECT)
      (throw (ex-info "Expected JSON document to begin with an object"
                      {:kind :bad_shape, :target-key target-key}))))
  (loop []
    (let [t (.nextToken parser)]
      (cond
        (or (nil? t) (= t JsonToken/END_OBJECT))
        (throw (ex-info (format "Key %s not found in top-level object" target-key)
                        {:kind :missing_key, :key target-key}))

        (= t JsonToken/FIELD_NAME)
        (if (= target-key (.getCurrentName parser))
          (let [vt (.nextToken parser)]
            (when (not= vt JsonToken/START_ARRAY)
              (throw (ex-info (format "Value of %s must be an array" target-key)
                              {:kind :bad_shape, :key target-key}))))
          (do (.nextToken parser) (.skipChildren parser) (recur)))

        :else (recur)))))

(defn- stream-array-batches!
  "Open `file`, navigate to the array at top-level `key`, and call `process-batch!` with each
  batch (up to `batch-size` decoded maps). Each batch runs inside its own `t2/with-transaction`;
  after the transaction commits, `on-responses` is called with the `ArrayList` buffer the
  processor filled, so the caller can drain id-mapping responses before the buffer is discarded.

  Matches the per-batch transaction semantics of `ndjson-import/stream-import!`: a failure
  inside a batch rolls back that batch and propagates out, aborting subsequent batches."
  [^File file ^String key batch-size process-batch! on-responses]
  (with-open [fis    (FileInputStream. file)
              reader (InputStreamReader. fis StandardCharsets/UTF_8)
              parser (.createParser (.getFactory object-mapper) reader)]
    (advance-to-array! parser key)
    (let [flush! (fn [batch]
                   (let [buffer (ArrayList.)]
                     (t2/with-transaction [_conn]
                       (process-batch! batch buffer))
                     (on-responses buffer)))]
      (loop [batch (transient [])]
        (let [t (.nextToken parser)]
          (cond
            (= t JsonToken/END_ARRAY)
            (when (pos? (count batch))
              (flush! (persistent! batch)))

            (= t JsonToken/START_OBJECT)
            (let [raw        (.readValueAs parser LinkedHashMap)
                  item       (keywordize raw)
                  next-batch (conj! batch item)]
              (if (>= (count next-batch) batch-size)
                (do (flush! (persistent! next-batch))
                    (recur (transient [])))
                (recur next-batch)))

            (nil? t)
            (throw (ex-info (format "Unexpected end-of-input in array %s" key)
                            {:kind :bad_shape, :key key}))

            :else
            (throw (ex-info (format "Unexpected token %s in array %s" (.asString t) key)
                            {:kind :bad_shape, :key key}))))))))

;;; ============================ Phase orchestration ============================

(defn- fold-id-map!
  "Read `{:old_id :new_id|:existing_id|:error}` entries from `buffer` into `id-map-atom`. When
  `inserts-atom` is supplied, source ids that got a `:new_id` (i.e. freshly inserted rather
  than matched) are also conj'd onto its set."
  ([buffer id-map-atom]
   (fold-id-map! buffer id-map-atom nil))
  ([buffer id-map-atom inserts-atom]
   (doseq [entry buffer]
     (let [old-id (:old_id entry)]
       (cond
         (contains? entry :new_id)
         (do (swap! id-map-atom assoc old-id (:new_id entry))
             (when inserts-atom (swap! inserts-atom conj old-id)))

         (contains? entry :existing_id)
         (swap! id-map-atom assoc old-id (:existing_id entry))

         (:error entry)
         (log/warnf "metadata-file-import: skipped old_id=%s (%s): %s"
                    (pr-str old-id) (:error entry) (:detail entry)))))))

(defn- load-databases!
  "Phase 1 — stream the `databases` array and return `{old-db-id → target-db-id}`."
  [^File file]
  (let [id-map (atom {})]
    (stream-array-batches!
     file "databases" import-batch-size
     (fn [batch buffer]
       (doseq [line batch] (process-databases-line! buffer line)))
     (fn [buffer] (fold-id-map! buffer id-map)))
    @id-map))

(defn- load-tables!
  "Phase 2 — stream the `tables` array, rewriting each `db_id` through `db-id-map`. Tables whose
  `db_id` did not map are skipped (source DB was unmatched). Returns `{old-tbl-id → target-tbl-id}`."
  [^File file db-id-map]
  (let [id-map (atom {})]
    (stream-array-batches!
     file "tables" import-batch-size
     (fn [batch buffer]
       (let [rewritten (into [] (keep (fn [{:keys [db_id] :as row}]
                                        (when-some [new-db-id (get db-id-map db_id)]
                                          (assoc row :db_id new-db-id))))
                             batch)]
         (when (seq rewritten)
           (process-tables-batch! rewritten buffer))))
     (fn [buffer] (fold-id-map! buffer id-map)))
    @id-map))

(defn- load-fields-insert!
  "Phase 3 — stream the `fields` array, rewriting `table_id` through `tbl-id-map`. Returns
  `[field-id-map inserted-set]` where `inserted-set` is the set of source ids that were freshly
  inserted (and therefore need a finalize pass)."
  [^File file tbl-id-map]
  (let [id-map   (atom {})
        inserts  (atom #{})]
    (stream-array-batches!
     file "fields" import-batch-size
     (fn [batch buffer]
       (let [rewritten (into [] (keep (fn [{:keys [table_id] :as row}]
                                        (when-some [new-tbl-id (get tbl-id-map table_id)]
                                          (assoc row :table_id new-tbl-id))))
                             batch)]
         (when (seq rewritten)
           (process-fields-batch! rewritten buffer))))
     (fn [buffer] (fold-id-map! buffer id-map inserts)))
    [@id-map @inserts]))

(defn- load-fields-finalize!
  "Phase 4 — re-stream the `fields` array. For each source id that was freshly inserted, build a
  finalize row with `id` remapped to target, and `parent_id` / `fk_target_field_id` remapped
  via the full field-id map (nil when the referenced source field didn't map)."
  [^File file fld-id-map insert-set]
  (stream-array-batches!
   file "fields" import-batch-size
   (fn [batch buffer]
     (let [finalize-rows
           (into [] (keep (fn [{:keys [id parent_id fk_target_field_id]}]
                            (when (contains? insert-set id)
                              (when-some [new-id (get fld-id-map id)]
                                {:id                 new-id
                                 :parent_id          (when parent_id (get fld-id-map parent_id))
                                 :fk_target_field_id (when fk_target_field_id
                                                       (get fld-id-map fk_target_field_id))}))))
                 batch)]
       (when (seq finalize-rows)
         (process-finalize-batch! finalize-rows buffer))))
   (fn [_buffer])))

(defn- load-field-values!
  "Phase 5 — stream the `field_values` array, rewriting each `field_id` through `fld-id-map`.
  Entries whose source field id is unmapped are skipped with a WARN."
  [^File file fld-id-map]
  (stream-array-batches!
   file "field_values" import-batch-size
   (fn [batch buffer]
     (let [rewritten (into [] (keep (fn [{:keys [field_id] :as row}]
                                      (if-some [new-id (get fld-id-map field_id)]
                                        (assoc row :field_id new-id)
                                        (do (log/warnf "metadata-file-import: skipping field_values for field_id=%s (no mapping)"
                                                       (pr-str field_id))
                                            nil))))
                           batch)]
       (when (seq rewritten)
         (process-field-values-batch! rewritten buffer))))
   (fn [_buffer])))

;;; ============================ Top-level entrypoint ============================

(defn- assert-file-readable! [^String path]
  (let [f (File. path)]
    (when-not (.exists f)
      (throw (ex-info (format "Metadata file not found at path %s" (pr-str path))
                      {:kind :file_not_found, :path path})))
    (when-not (.canRead f)
      (throw (ex-info (format "Metadata file at path %s is not readable" (pr-str path))
                      {:kind :file_not_readable, :path path})))
    f))

(defn- require-sync-disabled! []
  (when-not (warehouses.settings/disable-sync)
    (throw (ex-info (str "MB_TABLE_METADATA_PATH / MB_FIELD_VALUES_PATH require `disable-sync` "
                         "to be true. Set `MB_DISABLE_SYNC=true` or add `disable-sync: true` to "
                         "your config.yml.")
                    {:kind :sync-must-be-disabled}))))

(defn initialize-from-env!
  "If `MB_TABLE_METADATA_PATH` or `MB_FIELD_VALUES_PATH` is set in the environment, stream the
  referenced file(s) through the metadata-import pipeline. Returns `:ok` in every successful
  case — including the no-env-vars case, which is a silent no-op.

  Pre-conditions (all hard failures):
    - `disable-sync` must be true when either path is set.
    - Files referenced by the env vars must exist and be readable.
    - `MB_FIELD_VALUES_PATH` on its own is not supported — the field-id map is derived from the
      metadata file, so loading just field values would leave the file ids unresolved.

  Invoked once during boot from `metabase.core.config-from-file/init-from-file-if-code-available!`."
  []
  (let [metadata-path (env-path table-metadata-path-key)
        fv-path       (env-path field-values-path-key)]
    (cond
      (and (nil? metadata-path) (nil? fv-path))
      :ok

      (and (some? fv-path) (nil? metadata-path))
      (do (require-sync-disabled!)
          (throw (ex-info "MB_FIELD_VALUES_PATH set without MB_TABLE_METADATA_PATH — field ids cannot be resolved"
                          {:kind :missing_metadata_path})))

      :else
      (do
        (require-sync-disabled!)
        (let [metadata-file (assert-file-readable! metadata-path)
              fv-file       (when fv-path (assert-file-readable! fv-path))]
          (log/infof "metadata-file-import: loading metadata from %s" metadata-path)
          (let [db-id-map             (load-databases! metadata-file)
                tbl-id-map            (load-tables! metadata-file db-id-map)
                [fld-id-map inserted] (load-fields-insert! metadata-file tbl-id-map)]
            (load-fields-finalize! metadata-file fld-id-map inserted)
            (log/infof "metadata-file-import: databases=%d tables=%d fields=%d (inserted=%d)"
                       (count db-id-map) (count tbl-id-map) (count fld-id-map) (count inserted))
            (when fv-file
              (log/infof "metadata-file-import: loading field values from %s" fv-path)
              (load-field-values! fv-file fld-id-map))))
        :ok))))
