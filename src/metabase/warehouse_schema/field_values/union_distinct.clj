(ns metabase.warehouse-schema.field-values.union-distinct
  "Bulk distinct-values fetcher using SQL `UNION ALL`.

   For each field in the input set, builds a `SELECT DISTINCT col FROM t LIMIT N` subquery,
   wraps it with a `CAST(... AS VARCHAR)` and a literal field-name tag, then UNIONs all the
   per-field arms into one query (batched into groups so query text stays small).

   Preserves master's per-column DISTINCT semantics: each column gets up to
   [[*distinct-limit*]] distinct values, and `has_more_values` reflects per-column truncation
   rather than a blanket table-row sample cap.

   Only supported on SQL drivers. Callers that need to handle non-SQL drivers should fall
   back to per-field [[metabase.warehouse-schema.models.field-values/distinct-values]]."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *batch-size*
  "Number of per-field arms unioned into one query. Keeps query text well under driver limits."
  50)

(def ^:dynamic *distinct-limit*
  "Per-column DISTINCT cap. Mirrors the limit used by the per-field path so that semantics match."
  1000)

(defmulti varchar-type
  "Return the SQL type keyword to use for `CAST(x AS ...)` on this driver. Default is `:varchar`;
   override for drivers whose native string type uses a different name (e.g. BigQuery's `STRING`)."
  {:arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod varchar-type :sql                [_] :varchar)
(defmethod varchar-type :bigquery-cloud-sdk [_] :string)

(defn- decode-value
  "Coerce a string value (from `CAST(... AS VARCHAR)`) back to a native Clojure value using the
   field's `base_type`. NULL/`nil` passes through unchanged."
  [base-type s]
  (cond
    (nil? s)                       nil
    (isa? base-type :type/Boolean) (contains? #{"true" "t" "1"} s)
    (isa? base-type :type/Integer) (try (Long/parseLong s)
                                        (catch NumberFormatException _
                                          (bigint s)))
    :else                          s))

(defn- table-honeysql
  "HoneySQL identifier for `table`. Returns a single dotted keyword like `:schema.name` so HoneySQL
   emits properly-quoted multi-part identifiers (e.g. `` `schema`.`name` `` on BigQuery,
   `\"schema\".\"name\"` on Postgres)."
  [{:keys [schema name]}]
  (if (and schema (seq schema))
    (keyword (str schema "." name))
    (keyword name)))

(defn- build-arm
  "HoneySQL for one UNION arm: `SELECT 'field-name' AS field_name, CAST(value AS varchar)
   AS value_out FROM (SELECT DISTINCT col AS value FROM t LIMIT N) inner`."
  [varchar table-form field]
  (let [col (keyword (:name field))]
    {:select [[[:inline (:name field)] :field_name]
              [[:cast :value varchar] :value_out]]
     :from   [[{:select-distinct [[col :value]]
                :from            [table-form]
                :limit           *distinct-limit*}
               :_inner]]}))

(defn- build-union
  "Build the full HoneySQL form for one batch of fields. Single field → no UNION wrapper."
  [driver table fields]
  (let [varchar    (varchar-type driver)
        table-form (table-honeysql table)
        arms       (mapv #(build-arm varchar table-form %) fields)]
    (if (= 1 (count arms))
      (first arms)
      {:union-all arms})))

(defn- run-batch
  "Execute one batched UNION query and group rows by `field_name`. Returns
   `{field-name → [decoded-value ...]}` plus a raw row count per field."
  [driver db-id table fields]
  (let [hsql           (build-union driver table fields)
        [sql & params] (sql.qp/format-honeysql driver hsql)
        result         (qp/process-query
                        {:database db-id
                         :type     :native
                         :native   {:query sql, :params (vec params)}})
        rows           (-> result :data :rows)
        by-name        (into {} (map (juxt :name identity)) fields)]
    (reduce (fn [acc [field-name value-str]]
              (let [field (get by-name field-name)
                    v     (decode-value (:base_type field) value-str)]
                (-> acc
                    (update-in [(:id field) :values] (fnil conj []) v)
                    (update-in [(:id field) :raw-count] (fnil inc 0)))))
            ;; Pre-seed every field so fields with zero distinct values still appear in the result.
            (into {} (map (fn [f] [(:id f) {:values [] :raw-count 0}])) fields)
            rows)))

(defn union-distinct-values
  "Fetch distinct values for multiple fields from the same `table-id` using SQL `UNION ALL`.
   Batches `fields` into groups of [[*batch-size*]] to keep query text small. Returns

       {field-id -> {:values [...] :raw-count N}}

   where `:raw-count` is the number of rows that field's arm produced (≤ [[*distinct-limit*]]).
   The caller decides `has_more_values` from `:raw-count` and applies any further
   char-length capping (e.g. via `limit-values`).

   Does NOT swallow exceptions — callers are expected to wrap this in
   `metabase.sync.util/with-error-handling` (or equivalent) so the sync framework can decide
   whether to log-and-continue or abort the run."
  [table-id fields]
  (when (seq fields)
    (let [table  (t2/select-one :model/Table :id table-id)
          db-id  (:db_id table)
          driver (:engine (t2/select-one :model/Database :id db-id))]
      (->> (partition-all *batch-size* fields)
           (mapcat (fn [batch] (run-batch driver db-id table batch)))
           (into {})))))

(defn- sql-driver-for-table? [table]
  (let [driver (:engine (t2/select-one :model/Database :id (:db_id table)))]
    (isa? driver/hierarchy driver :sql)))

(defn- persist-bulk-results!
  "For each field in `fields`, look up its results in `results` (from `union-distinct-values`),
   apply `limit-values` to cap by char length and dedupe, then persist via `persist-field-values!`.
   `fvs-map` is a {field-id → existing FieldValues row or nil} map for the comparison step.
   Returns a sequence of `::fv-created`/`::fv-updated`/`::fv-skipped`/`::fv-deleted` keywords
   (one per field)."
  [fields fvs-map results]
  (mapv (fn [field]
          (let [field-id        (u/the-id field)
                existing-fv     (get fvs-map field-id)
                {:keys [values raw-count]} (get results field-id {:values [] :raw-count 0})
                {capped-values :values
                 cap-hit?      :has_more_values} (field-values/limit-values values)
                row-limit-hit?  (>= raw-count *distinct-limit*)
                has-more-values (boolean (or cap-hit? row-limit-hit?))]
            (field-values/persist-field-values!
             field existing-fv capped-values has-more-values)))
        fields))

(defn sync-fields-grouped-by-table!
  "Sync FieldValues for `fields`, grouping by `:table_id` and using the UNION path on SQL drivers
   (one query per table) or a per-field DISTINCT fallback on non-SQL drivers (e.g. Mongo).

   `fields` does not need to be pre-grouped by table; the function groups them. Callers that
   need to skip inactive FieldValues should filter before calling.

   Returns a sequence of status keywords (one per field). Does not catch exceptions — callers
   wanting log-and-continue semantics should wrap each table-group in their own error handler."
  [fields]
  (when (seq fields)
    (let [fvs-map  (field-values/batched-get-latest-full-field-values (map u/the-id fields))
          by-table (group-by :table_id fields)]
      (into []
            (mapcat (fn [[table-id table-fields]]
                      (let [table (t2/select-one :model/Table :id table-id)]
                        (if (sql-driver-for-table? table)
                          (persist-bulk-results! table-fields fvs-map
                                                 (union-distinct-values table-id table-fields))
                          ;; Non-SQL driver: per-field DISTINCT via existing path
                          (mapv (fn [field]
                                  (field-values/create-or-update-full-field-values!
                                   field :field-values (get fvs-map (u/the-id field))))
                                table-fields)))))
            by-table))))
