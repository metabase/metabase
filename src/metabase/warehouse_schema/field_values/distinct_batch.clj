(ns metabase.warehouse-schema.field-values.distinct-batch
  "Bulk distinct-values fetcher using SQL `UNION ALL`.

  For each field in the input set, builds a flat per-field arm of the shape

      SELECT <arm-ordinal> AS field_idx, <cast-to-text>(col) AS value_out
      FROM <table>
      GROUP BY <cast-to-text>(col)
      <driver-correct LIMIT clause>

  Arms are tagged with their ordinal in the batch rather than with the field's name. The name comes from the
  warehouse verbatim, and an inline string literal built from it is a SQL injection sink on any engine whose
  string lexer we don't escape for; an integer ordinal is unforgeable. It also means two fields that
  happen to share a name stay distinct.

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
  field's known `base_type`.

  Lives in its own namespace because it pulls in `metabase.driver.sql.query-processor` and
  `metabase.query-processor`, and the latter's transitive load chain (actions → parameters →
  chain-filter → params.field-values → field → field-values) would form a cycle if these
  requires lived in `metabase.warehouse-schema.models.field-values`."
  (:require
   [clojure.string :as str]
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

(defn- decode-value
  "Coerce a string value (from `CAST(... AS <text>)`) back to a native Clojure value using the
  field's `base_type`. NULL/`nil` passes through unchanged.

  We only decode types whose Clojure representation would JSON-encode differently than a
  string: numbers and booleans need to land in `:model/FieldValues.values` as JSON numbers /
  booleans, not strings, to match the per-field MBQL path. Temporal types (`:type/Date`,
  `:type/DateTime`, `:type/Time`) and `:type/UUID` are *already* JSON-encoded as strings by
  `mi/transform-json` on the way to the DB, so leaving them as strings here matches what the
  per-field path stores after its round-trip — no decoding needed."
  [base-type ^String s]
  (cond
    (nil? s)                       nil
    (isa? base-type :type/Boolean) (contains? #{"true" "t" "1"} (u/lower-case-en s))
    (isa? base-type :type/Integer) (try (Long/parseLong s)
                                        (catch NumberFormatException _
                                          (try (bigint s)
                                               (catch NumberFormatException _ s))))
    ;; `:type/Decimal` derives from `:type/Float`, so it has to come first.
    (isa? base-type :type/Decimal) (try (bigdec s)
                                        (catch NumberFormatException _ s))
    (isa? base-type :type/Float)   (try (Double/parseDouble s)
                                        (catch NumberFormatException _ s))
    :else                          s))

(defn- table-honeysql
  "Driver-aware HoneySQL identifier for `table`. Routes through `sql.qp/->honeysql` so drivers
  that need to qualify table identifiers further (e.g. BigQuery's project-id prefix) get their
  chance."
  [driver {:keys [schema name]}]
  (sql.qp/->honeysql driver
                     (if (seq schema)
                       (h2x/identifier :table schema name)
                       (h2x/identifier :table name))))

(defn- cast-to-text-honeysql
  "Driver-correct HoneySQL fragment for `CAST(col AS <driver's text type>)`."
  [driver col-name]
  (sql.qp/->honeysql driver [::sql.qp/cast-to-text {} (h2x/identifier :field col-name)]))

(defn- build-arm
  "HoneySQL for one UNION arm. `idx` is the field's position in the batch and becomes the arm's tag."
  [driver table field idx]
  (let [cast-expr (cast-to-text-honeysql driver (:name field))
        inner     {:select   [[[:inline idx] :field_idx]
                              [cast-expr :value_out]]
                   ;; `:from` wraps the identifier expression in an extra vector — `[[expr]]` so HoneySQL
                   ;; treats it as a single table expression rather than `[table alias …]`.
                   :from     [[(table-honeysql driver table)]]
                   ;; Only `cast-expr` goes in `:group-by`. The `[:inline idx]` tag is a literal in
                   ;; the SELECT list and needs no GROUP BY entry.
                   :group-by [cast-expr]}
        limited   (sql.qp/apply-top-level-clause driver :limit inner {:limit field-values/*distinct-limit*})]
    ;; The per-field `SELECT … GROUP BY … LIMIT N` is built as an inner subquery and wrapped in an
    ;; outer `SELECT * FROM (<inner>)`. The wrap is required. A `UNION ALL` of arms that each carry
    ;; their own `LIMIT` is illegal SQL. The LIMIT would bind to the whole union. Nesting the
    ;; limited query as a subquery parenthesizes it; the outer arms then carry no LIMIT and union
    ;; cleanly.
    {:select [:*]
     :from   [[limited :_arm]]}))

(defn- build-union
  "Build the full HoneySQL form for one batch of fields. Single field → no UNION wrapper."
  [driver table fields]
  (let [arms (into [] (map-indexed #(build-arm driver table %2 %1)) fields)]
    (if (= 1 (count arms))
      (first arms)
      {:union-all arms})))

(defn- decode-arm-idx
  "Coerce the `field_idx` tag a driver returned back to a Clojure integer. Drivers disagree on the type they
  hand back for an inline integer literal (`Long` on most, `BigDecimal` on Oracle/Snowflake, …), so normalize
  rather than assume. Returns `nil` for anything unrecognizable."
  [x]
  (cond
    (number? x) (long x)
    (string? x) (try (Long/parseLong (str/trim x)) (catch NumberFormatException _ nil))))

(defn run-distinct-batch
  "Execute one UNION ALL query covering `fields` from one `table`. The caller is responsible for
  ensuring `(count fields)` ≤ [[*batch-size*]] (the per-query arm cap) and that all `fields`
  belong to `table`.

  Returns `{field-id → {:values [decoded …] :raw-count N}}` with all input fields pre-seeded so
  fields with zero distinct values still appear. Each field's `:values` is capped at
  `field-values/*distinct-limit*` by the per-arm `LIMIT`.

  Does NOT swallow exceptions — callers wrap with `metabase.sync.util/with-error-handling`
  (or equivalent) to decide log-and-continue vs abort semantics."
  [table fields]
  (let [db-id          (:db_id table)
        driver         (:engine (t2/select-one :model/Database 'id db-id))
        fields         (vec fields)
        hsql           (build-union driver table fields)
        [sql & params] (sql.qp/format-honeysql driver hsql)
        result         (qp/process-query
                        {:database db-id
                         :type     :native
                         :native   {:query sql, :params (vec params)}})
        rows           (-> result :data :rows)]
    (reduce (fn [acc [arm-idx value-str]]
              ;; Arms are tagged by ordinal rather than by name: the name is warehouse-controlled and has no
              ;; business being in the query text as a literal, and ordinals also keep two
              ;; identically-named fields in the same batch from collapsing into one.
              (if-let [field (get fields (decode-arm-idx arm-idx))]
                (let [v (decode-value (:base_type field) value-str)]
                  (-> acc
                      (update-in [(:id field) :values] (fnil conj []) v)
                      (update-in [(:id field) :raw-count] (fnil inc 0))))
                acc))
            (into {} (map (fn [f] [(:id f) {:values [] :raw-count 0}])) fields)
            rows)))
