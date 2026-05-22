(ns metabase.warehouse-schema.field-values.union-distinct
  "Bulk distinct-values fetcher using SQL `UNION ALL`.

  For each field in the input set, builds a flat per-field arm of the shape

      SELECT '<field-name>' AS field_name, <cast-to-text>(col) AS value_out
      FROM <table>
      GROUP BY '<field-name>', <cast-to-text>(col)
      <driver-correct LIMIT clause>

  Per-arm DISTINCT semantics come from `GROUP BY` rather than `SELECT DISTINCT` — both are
  equivalent here, but `GROUP BY` composes cleanly with every driver's
  [[sql.qp/apply-top-level-clause]] `:limit` transform (notably SQL Server's `TOP N` rewrite,
  which reads from `:select` and doesn't see `:select-distinct`).

  The cast goes through [[sql.qp/cast-to-text]] so each driver picks its native text type
  (Oracle's `VARCHAR2`, SQL Server's `VARCHAR(MAX)`, Spark SQL's `STRING`, etc.). The LIMIT
  goes through [[sql.qp/apply-top-level-clause]] so Oracle gets `WHERE rownum <= N` and
  SQL Server gets `SELECT TOP N`.

  Arms are then unioned via HoneySQL's `:union-all`, batched into groups so query text stays
  below driver parameter / length limits, and decoded back to native Clojure values using the
  field's known `base_type`."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *batch-size*
  "Number of per-field arms unioned into one query. Keeps query text well under driver limits."
  50)

(def ^:dynamic *distinct-limit*
  "Per-column DISTINCT cap. Mirrors the limit used by the per-field path so semantics match."
  1000)

(defn- decode-value
  "Coerce a string value (from `CAST(... AS <text>)`) back to a native Clojure value using the
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
  "Driver-aware HoneySQL identifier for `table`. Routes through `sql.qp/->honeysql` so drivers
  that need to qualify table identifiers further (e.g. BigQuery's project-id prefix) get their
  chance."
  [driver {:keys [schema name]}]
  (sql.qp/->honeysql driver
                     (if (and schema (seq schema))
                       (h2x/identifier :table schema name)
                       (h2x/identifier :table name))))

(defn- cast-to-text-honeysql
  "Driver-correct HoneySQL fragment for `CAST(col AS <driver's text type>)`."
  [driver col-name]
  (sql.qp/->honeysql driver
                     (sql.qp/mbql-clause driver ::sql.qp/cast-to-text
                                         (h2x/identifier :field col-name))))

(defn- build-arm
  "HoneySQL for one UNION arm.

  The per-field `SELECT … GROUP BY … LIMIT N` is built as an inner subquery and wrapped in an
  outer `SELECT * FROM (<inner>)`. The wrap is required: a `UNION ALL` of arms that each carry
  their own `LIMIT` is illegal SQL — the LIMIT would bind to the whole union. Nesting the
  limited query as a subquery parenthesizes it; the outer arms then carry no LIMIT and union
  cleanly."
  [driver table field]
  (let [tag       [:inline (:name field)]
        cast-expr (cast-to-text-honeysql driver (:name field))
        ;; `:from` wraps the identifier expression in an extra vector — `[[expr]]` — so HoneySQL
        ;; treats it as a single table expression rather than parsing the identifier's own
        ;; `[::identifier :table [...]]` vector as a `[table alias …]` spec.
        ;;
        ;; Only `cast-expr` goes in `GROUP BY`. `tag` is a constant in the SELECT list — a
        ;; literal needs no GROUP BY entry, and Postgres specifically rejects a non-integer
        ;; constant in GROUP BY ("non-integer constant in GROUP BY").
        inner     {:select   [[tag :field_name]
                              [cast-expr :value_out]]
                   :from     [[(table-honeysql driver table)]]
                   :group-by [cast-expr]}
        limited   (sql.qp/apply-top-level-clause driver :limit inner {:limit *distinct-limit*})]
    {:select [:*]
     :from   [[limited :_arm]]}))

(defn- build-union
  "Build the full HoneySQL form for one batch of fields. Single field → no UNION wrapper."
  [driver table fields]
  (let [arms (mapv #(build-arm driver table %) fields)]
    (if (= 1 (count arms))
      (first arms)
      {:union-all arms})))

(defn- run-batch
  "Execute one batched UNION query and aggregate rows by `field_name`. Returns
  `{field-id → {:values [decoded …] :raw-count N}}` with all input fields pre-seeded so fields
  with zero distinct values still appear."
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
