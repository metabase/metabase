(ns metabase-enterprise.transform-optimizer.context
  "Top-level context builder for the transform optimizer.

  Stitches together:
    - `transforms-inspector.context/build-context` for sources/target/joins
      (we re-use it rather than reimplementing source extraction).
    - `transforms-base.util/compile-source` for the compiled native SQL we
      feed to the LLM and to EXPLAIN.
    - Foreign-key edges and `database_indexed` flags from the appdb
      (`Field.fk_target_field_id`).
    - Full index shape (composite columns, INCLUDE, partial predicate, type)
      from the source DB via `index-introspection`.
    - An `EXPLAIN (FORMAT JSON, VERBOSE)` plan tree.
    - Recent run history with durations.

  The returned map is what `prompt.clj` (to come) renders into the LLM
  context block — it is not yet a string, just a data shape."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transform-optimizer.explain :as opt.explain]
   [metabase-enterprise.transform-optimizer.index-introspection :as opt.indexes]
   [metabase-enterprise.transforms-inspector.context :as inspector.context]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; SQL compilation

(defn- transform-sql
  "Compile a `:query`-type transform down to the native SQL string we feed to
  EXPLAIN and to the LLM. Returns `nil` (with a warning) if compilation
  fails — the optimizer should still produce a degraded context rather than
  bailing entirely."
  [transform]
  (try
    (-> (transforms-base.u/compile-source transform nil) :query)
    (catch Exception e
      (log/warnf e "transform-optimizer: failed to compile source SQL (transform-id=%s)"
                 (:id transform))
      nil)))

;; ---------------------------------------------------------------------------
;; Foreign-key resolution
;;
;; The inspector's `fields` only carry the basic Field shape. For optimizer
;; context we want each field's FK target resolved to (target_schema,
;; target_table, target_column) so the LLM can reason about join paths
;; without us having to dump the full appdb.

(defn- collect-fk-target-ids [sources]
  (into #{}
        (comp (mapcat :fields)
              (keep :fk_target_field_id))
        sources))

(defn- ^java.util.Map fk-target-index [target-ids]
  ;; Two batch queries (fields → tables) then a small in-memory join.
  (when (seq target-ids)
    (let [target-fields (t2/select [:model/Field :id :name :table_id]
                                   :id [:in target-ids])
          table-ids     (into #{} (map :table_id) target-fields)
          id->table     (when (seq table-ids)
                          (into {} (map (juxt :id identity))
                                (t2/select [:model/Table :id :schema :name]
                                           :id [:in table-ids])))]
      (into {}
            (keep (fn [{:keys [id name table_id]}]
                    (when-let [t (get id->table table_id)]
                      [id {:target_schema   (:schema t)
                           :target_table    (:name t)
                           :target_column   name
                           :target_field_id id}])))
            target-fields))))

;; ---------------------------------------------------------------------------
;; `database_indexed` lookup (cheap appdb-only signal that complements full
;; index introspection — useful as a fallback when index-introspection fails)

(defn- field-id->indexed
  "Return `{field-id -> bool}` for every field on the given source tables. The
  inspector's collect-field-metadata doesn't include this column, so we fetch
  it separately."
  [source-table-ids]
  (when (seq source-table-ids)
    (into {}
          (map (juxt :id (comp boolean :database_indexed)))
          (t2/select [:model/Field :id :database_indexed]
                     :table_id [:in source-table-ids]
                     :active true))))

;; ---------------------------------------------------------------------------
;; Source enrichment

(defn- enrich-fields [fields fk-index id->indexed?]
  (mapv (fn [{:keys [id fk_target_field_id] :as field}]
          (cond-> (dissoc field :fingerprint)
            (some? id)
            (assoc :indexed? (boolean (get id->indexed? id)))

            fk_target_field_id
            (assoc :foreign_key (get fk-index fk_target_field_id))))
        fields))

(defn- source->table-pair [{:keys [schema table_name]}]
  (when (and schema table_name)
    [schema table_name]))

(defn- attach-indexes [sources indexes-by-table]
  (mapv (fn [{:keys [schema table_name] :as src}]
          (assoc src
                 :indexes
                 (get indexes-by-table
                      [(some-> schema     str/lower-case)
                       (some-> table_name str/lower-case)]
                      [])))
        sources))

(defn- enrich-sources [sources fk-index id->indexed?]
  (mapv (fn [{:keys [fields] :as src}]
          (assoc src :fields (enrich-fields fields fk-index id->indexed?)))
        sources))

;; ---------------------------------------------------------------------------
;; Run history

(defn- duration-ms [^java.time.OffsetDateTime start ^java.time.OffsetDateTime end]
  (when (and start end)
    (- (.toEpochMilli (.toInstant end))
       (.toEpochMilli (.toInstant start)))))

(defn- run-history [transform-id n]
  (->> (t2/select [:model/TransformRun :id :status :start_time :end_time :message :run_method]
                  :transform_id transform-id
                  {:order-by [[:start_time :desc]]
                   :limit    n})
       (mapv (fn [run]
               (assoc run :duration_ms (duration-ms (:start_time run) (:end_time run)))))))

;; ---------------------------------------------------------------------------
;; Entry point

(defn build-context
  "Assemble the optimizer's per-transform context map. `opts` are forwarded to
  `explain/explain` (the only meaningful one today is `:analyze? true` —
  *don't* pass it for transforms whose latest run took longer than a few
  seconds; that's what we're trying to avoid).

  Returns a map of:
    :transform        {id, name, source_database_id, target}
    :sql              compiled native SQL or nil
    :sources          [{schema, table_name, db_id, column_count,
                        fields [{name, base_type, indexed?, foreign_key …}],
                        indexes [{name, definition, key_columns,
                                  include_columns, access_method,
                                  partial_predicate, …}]} …]
    :target           inspector target-table info, or nil
    :indexes_partial? true when full catalog introspection was unavailable
                      (non-Postgres driver, transient failure) — callers
                      should annotate the LLM prompt accordingly.
    :explain          parsed JSON plan tree, or nil
    :run_history      [{id, status, start_time, end_time, duration_ms,
                        run_method, message} …] (most recent first)"
  [transform & {:as opts}]
  (let [inspector   (inspector.context/build-context transform)
        sources     (:sources inspector)
        db-id       (:db-id inspector)
        driver-kw   (:driver inspector)
        database    (when db-id (t2/select-one :model/Database :id db-id))
        sql         (transform-sql transform)
        fk-index    (fk-target-index (collect-fk-target-ids sources))
        id->indexed (field-id->indexed (into #{} (keep :table_id) sources))
        enriched    (enrich-sources sources fk-index id->indexed)
        indexes     (when (and driver-kw database (seq sources))
                      (try
                        (opt.indexes/fetch-indexes
                         driver-kw database
                         (into [] (keep source->table-pair) sources))
                        (catch Exception e
                          (log/warnf e "index introspection failed (transform-id=%s)"
                                     (:id transform))
                          nil)))
        idx-by-tbl  (opt.indexes/group-by-table (or indexes []))
        with-idx    (attach-indexes enriched idx-by-tbl)
        explained   (when (and database sql)
                      (opt.explain/explain driver-kw database sql (or opts {})))]
    {:transform        {:id                 (:id transform)
                        :name               (:name transform)
                        :target             (:target transform)
                        :source_database_id (:source_database_id transform)}
     :sql              sql
     :sources          with-idx
     :target           (:target inspector)
     :indexes_partial? (and (seq sources) (nil? indexes))
     :explain          explained
     :run_history      (run-history (:id transform) 10)}))
