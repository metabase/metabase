(ns metabase.warehouses-rest.metadata-file-import
  "Boot-time loader that streams database metadata + field values from files on disk, sharing the
  batch processors in `metabase.warehouses-rest.metadata-import-core` with the streaming NDJSON
  endpoints in `metabase.warehouses-rest.api.metadata-import`. Gated by two environment variables:

    - `MB_TABLE_METADATA_PATH` — path to a JSON document of the shape produced by
      `GET /api/database/metadata`: `{\"databases\": [...], \"tables\": [...], \"fields\": [...]}`.
    - `MB_FIELD_VALUES_PATH`   — path to a JSON document of the shape produced by
      `GET /api/database/field-values`: `{\"field_values\": [...]}`.

  Both files are read with Jackson's streaming API so neither is materialized in memory. If either
  env var is set, `disable-sync` must be true; otherwise startup hard-fails. Missing files also
  hard-fail. Target `:model/Database` rows must already exist for each source `(name, engine)`
  pair — unmatched source databases produce WARN logs and their tables / fields are skipped."
  (:require
   [clojure.string :as str]
   [environ.core :as env]
   [metabase.util.log :as log]
   [metabase.warehouses-rest.metadata-import-core :as core]
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

(defn- env-path
  "Read `*env*` at `k`, treating blank strings as absent."
  [k]
  (let [v (get *env* k)]
    (when (and (string? v) (not (str/blank? v))) v)))

;;; ============================ Streaming JSON reader ============================

(def ^:private ^ObjectMapper object-mapper (ObjectMapper.))

(defn- keywordize
  "Convert a `java.util.Map` parsed by Jackson into a Clojure map with keyword keys. Nested
  values (`java.util.List`/`java.util.Map`) are left as-is — consumers only need keyword access
  on the top-level entry, which is what the core processors expect."
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
  batch of `[line-num item]` tuples (up to `batch-size`). `line-num` is the 1-indexed position of
  the item within the source array — the same shape core processors expect from the HTTP path.
  Each batch runs inside its own `t2/with-transaction`; after commit, `on-responses` is called
  with the `ArrayList` buffer so callers can drain id-mapping responses."
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
      (loop [batch    (transient [])
             line-num 0]
        (let [t (.nextToken parser)]
          (cond
            (= t JsonToken/END_ARRAY)
            (when (pos? (count batch))
              (flush! (persistent! batch)))

            (= t JsonToken/START_OBJECT)
            (let [raw        (.readValueAs parser LinkedHashMap)
                  item       (keywordize raw)
                  ln         (inc line-num)
                  next-batch (conj! batch [ln item])]
              (if (>= (count next-batch) batch-size)
                (do (flush! (persistent! next-batch))
                    (recur (transient []) ln))
                (recur next-batch ln)))

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
     file "databases" core/import-batch-size
     (fn [batch buffer]
       (doseq [[ln line] batch]
         (core/process-databases-line! buffer ln line)))
     (fn [buffer] (fold-id-map! buffer id-map)))
    @id-map))

(defn- load-tables!
  "Phase 2 — stream the `tables` array, rewriting each `db_id` through `db-id-map`. Tables whose
  `db_id` didn't map are skipped (unmatched source DB). Returns `{old-tbl-id → target-tbl-id}`."
  [^File file db-id-map]
  (let [id-map (atom {})]
    (stream-array-batches!
     file "tables" core/import-batch-size
     (fn [batch buffer]
       (let [rewritten (into [] (keep (fn [[ln {:keys [db_id] :as row}]]
                                        (when-some [new-db-id (get db-id-map db_id)]
                                          [ln (assoc row :db_id new-db-id)])))
                             batch)]
         (when (seq rewritten)
           (core/process-tables-batch! rewritten buffer))))
     (fn [buffer] (fold-id-map! buffer id-map)))
    @id-map))

(defn- load-fields-insert!
  "Phase 3 — stream the `fields` array, rewriting `table_id` through `tbl-id-map`. Returns
  `[field-id-map inserted-set]` — the full (new|existing)-id map plus the set of source ids that
  were freshly inserted (and therefore need the finalize pass)."
  [^File file tbl-id-map]
  (let [id-map  (atom {})
        inserts (atom #{})]
    (stream-array-batches!
     file "fields" core/import-batch-size
     (fn [batch buffer]
       (let [rewritten (into [] (keep (fn [[ln {:keys [table_id] :as row}]]
                                        (when-some [new-tbl-id (get tbl-id-map table_id)]
                                          [ln (assoc row :table_id new-tbl-id)])))
                             batch)]
         (when (seq rewritten)
           (core/process-fields-batch! rewritten buffer))))
     (fn [buffer] (fold-id-map! buffer id-map inserts)))
    [@id-map @inserts]))

(defn- load-fields-finalize!
  "Phase 4 — re-stream the `fields` array. For each source id that was freshly inserted, build a
  finalize row with `id` remapped to target, and `parent_id` / `fk_target_field_id` remapped via
  the full field-id map (nil when the referenced source field didn't map)."
  [^File file fld-id-map insert-set]
  (stream-array-batches!
   file "fields" core/import-batch-size
   (fn [batch buffer]
     (let [finalize-rows
           (into [] (keep (fn [[ln {:keys [id parent_id fk_target_field_id]}]]
                            (when (contains? insert-set id)
                              (when-some [new-id (get fld-id-map id)]
                                [ln {:id                 new-id
                                     :parent_id          (when parent_id (get fld-id-map parent_id))
                                     :fk_target_field_id (when fk_target_field_id
                                                           (get fld-id-map fk_target_field_id))}]))))
                 batch)]
       (when (seq finalize-rows)
         (core/process-finalize-batch! finalize-rows buffer))))
   (fn [_buffer])))

(defn- load-field-values!
  "Phase 5 — stream the `field_values` array, rewriting each `field_id` through `fld-id-map`.
  Entries whose source field id is unmapped are skipped with a WARN."
  [^File file fld-id-map]
  (stream-array-batches!
   file "field_values" core/import-batch-size
   (fn [batch buffer]
     (let [rewritten (into [] (keep (fn [[ln {:keys [field_id] :as row}]]
                                      (if-some [new-id (get fld-id-map field_id)]
                                        [ln (assoc row :field_id new-id)]
                                        (do (log/warnf "metadata-file-import: skipping field_values for field_id=%s (no mapping)"
                                                       (pr-str field_id))
                                            nil))))
                           batch)]
       (when (seq rewritten)
         (core/process-field-values-batch! rewritten buffer))))
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
