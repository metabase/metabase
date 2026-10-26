(ns dev.dbt-import.resolve
  "Stage 2 of the converter: bind IR metrics to Metabase names and types.

  Takes the IR (see [[dev.dbt-import.schemas.ir]]) and a config, and for every metric works out the serdes portable
  refs of its source table and aggregated column, the column's Metabase base type, and a deterministic `entity_id`.
  Metrics that cannot be expressed as a single-aggregation Metabase metric are reported in `:unsupported` with a
  reason instead of failing the run.

  The manifest's column list is documentation, not the warehouse schema: a project may declare no `data_type`, or
  not document the column at all. The column is then resolved without a base type and the instance supplies it when
  the serdes import binds the field; a column that does not exist fails there, with the authoritative metadata.

  Only knows the IR, not the manifest, so another semantic layer's parser would plug in unchanged."
  (:require
   [better-cond.core :as b]
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [dev.dbt-import.schemas.ir :as schemas.ir]
   [dev.dbt-import.schemas.resolved :as schemas.resolved]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mu/defn entity-id :- ::schemas.resolved/entity-id
  "A deterministic `entity_id` for the string `s`. Re-running the converter on the same input produces the same IDs,
  so a re-import updates the existing metrics instead of duplicating them."
  [s :- :string]
  ;; generate-nano-id seeds a RNG from a hex string parsed as a long, so hand it 15 hex chars (60 bits) of the hash
  (u/generate-nano-id (subs (codecs/bytes->hex (buddy-hash/sha256 s)) 0 15)))

(mu/defn- metric-entity-id :- ::schemas.resolved/entity-id
  [{:keys [unique-id]} :- ::schemas.ir/metric]
  (entity-id (str "dbt-import/metric/" unique-id)))

(mu/defn- collection-entity-id :- ::schemas.resolved/entity-id
  [project :- [:maybe :string]]
  (entity-id (str "dbt-import/collection/" project)))

(mu/defn- normalize-type-name :- :string
  "`VARCHAR(255)` → `varchar`, `timestamp(6) with time zone` → `timestamp with time zone`, `DOUBLE  PRECISION` →
  `double precision`: lower-cased, without length or precision arguments, single-spaced. The form a driver's type map
  is keyed by, give or take case."
  [s :- :string]
  (-> s
      u/lower-case-en
      (str/replace #"\s*\([^)]*\)" "")
      (str/replace #"\s+" " ")
      str/trim))

(def ^:private array-type-re
  "`integer[]`, `numeric(10,2)[]`: a warehouse array type."
  #"\[\s*\]$")

(mu/defn base-type :- [:maybe ::lib.schema.common/base-type]
  "The Metabase base type for a warehouse `data-type` string, as the `driver` maps it during sync, or nil when it is
  unknown or missing. `overrides` (the config's `:base-types`) wins over the driver; its keys are normalized the same
  way as the type."
  [driver    :- :keyword
   overrides :- [:maybe ::schemas.resolved/config.base-types]
   data-type :- [:maybe :string]]
  (when-not (str/blank? data-type)
    (let [type-name (normalize-type-name data-type)
          overrides (update-keys (or overrides {}) normalize-type-name)]
      (cond
        (contains? overrides type-name)
        (get overrides type-name)

        ;; an array is an array; Metabase does not type the elements
        (re-find array-type-re type-name)
        :type/*

        :else
        ;; Postgres keys its type map by lower-case names, MySQL and H2 by upper-case ones
        (some (fn [f]
                (sql-jdbc.sync/database-type->base-type driver (keyword (f type-name))))
              [identity
               u/upper-case-en])))))

(def ^:private identifier-re
  "A bare column name, optionally table-qualified. Each part is either quoted (`\"Sales\"`, `` `sales` ``) or a run of
  letters, digits and underscores in any script that is not all digits (so `1.0` is not table `1`, column `0`); a
  leading digit is legal in a warehouse when quoted, and dbt projects write it unquoted in `expr`. Surrounding
  whitespace, including the newline a YAML block scalar adds, is ignored."
  (let [bare "(?=[\\p{L}\\p{N}_]*[\\p{L}_])[\\p{L}\\p{N}_]+"]
    (re-pattern (str "(?s)^\\s*"
                     "(?:(?:\"[^\"]+\"|`[^`]+`|" bare ")\\s*\\.\\s*)?"
                     "(?:\"([^\"]+)\"|`([^`]+)`|(" bare "))"
                     "\\s*$"))))

(def ^:private integer-literal-re #"(?s)^\s*\d+\s*$")
(def ^:private keyword-literal-re #"(?is)^\s*(?:true|false|null)\s*$")
(def ^:private wildcard-re #"(?s)^\s*\*\s*$")

(mr/def ::parsed-expr
  [:map
   [:kind  [:enum :column :literal :wildcard :sql]]
   [:name  {:optional true} :string]
   [:value {:optional true} :string]])

(mu/defn- parse-expr :- ::parsed-expr
  "What an IR `expr` is: a bare column name (`:name`, unquoted and unqualified), a literal (`:value`, as written, so
  the report can quote it), the wildcard `*`, or anything else, which is SQL."
  [expr :- :string]
  (cond
    (re-matches wildcard-re expr)
    {:kind :wildcard}

    (or (re-matches integer-literal-re expr)
        (re-matches keyword-literal-re expr))
    {:kind :literal, :value (str/trim expr)}

    :else
    (if-let [[_ quoted backticked bare] (re-matches identifier-re expr)]
      {:kind :column, :name (or quoted backticked bare)}
      {:kind :sql})))

(mu/defn- find-column :- [:maybe ::schemas.ir/column]
  "`columns` entry named `column-name`, exactly or ignoring case."
  [columns     :- [:map-of :string ::schemas.ir/column]
   column-name :- :string]
  (or (get columns column-name)
      (some (fn [[documented-name column]]
              (when (= (u/lower-case-en documented-name) (u/lower-case-en column-name))
                column))
            columns)))

(mu/defn resolve-metric :- [:or ::schemas.resolved/metric ::schemas.ir/unsupported]
  "Resolve one IR metric against the IR `semantic-models` (keyed by name) and `config`, or explain why it cannot be a
  Metabase metric yet."
  [config          :- ::schemas.resolved/config
   semantic-models :- [:map-of :string ::schemas.ir/semantic-model]
   {:keys [agg expr agg-params non-additive-dimension filters semantic-model fill-nulls-with] :as metric}
   :- ::schemas.ir/metric]
  (let [unsupported (fn [reason]
                      {:name      (:name metric)
                       :unique-id (:unique-id metric)
                       :reason    reason})
        {:keys [relation columns] :as model} (get semantic-models semantic-model)]
    (b/cond
      (not model)
      (unsupported (format "semantic model %s not found" (pr-str semantic-model)))

      (seq filters)
      (unsupported "metric filters are not supported yet (QRES-3)")

      non-additive-dimension
      (unsupported "non-additive measures have no Metabase equivalent")

      :let [percentile (:percentile agg-params)]

      (and (= agg :percentile) (nil? percentile))
      (unsupported "percentile aggregation without a percentile value")

      ;; dbt documents the percentile as a fraction; emit tolerates a percentage, so allow up to 100
      (and (= agg :percentile) (not (<= 0 percentile 100)))
      (unsupported (format "percentile %s is out of range; dbt expects a fraction between 0 and 1" percentile))

      (and (= agg :percentile) (:use_discrete_percentile agg-params))
      (unsupported "discrete percentiles have no Metabase equivalent: Metabase percentiles are continuous")

      :let [database (get-in config [:databases (:database relation)])]

      (not database)
      (unsupported (format "no Metabase database configured for warehouse database %s; add it to :databases"
                           (pr-str (:database relation))))

      :let [source-table [database (:schema relation) (:table relation)]
            {:keys [kind], column-name :name, literal :value} (parse-expr expr)
            resolved {:metric       metric
                      :entity-id    (metric-entity-id metric)
                      :database     database
                      :source-table source-table}]

      (= kind :sql)
      (unsupported (format "expr %s is a SQL expression, not supported yet (QRES-3)" (pr-str expr)))

      ;; `count(*)`, like `count(1)`, is a row count
      (= kind :wildcard)
      (if (= agg :count)
        (assoc resolved :field nil)
        (unsupported (format "%s over * has no Metabase equivalent" (name agg))))

      (= kind :literal)
      (if (and (= literal "1") (#{:sum :count} agg))
        (assoc resolved :field nil)
        (unsupported (format "%s over the literal %s has no Metabase equivalent" (name agg) literal)))

      :let [column    (find-column columns column-name)
            data-type (some-> (:data-type column) str/trim not-empty)
            base-type (base-type (:driver config) (:base-types config) data-type)]

      (and data-type (not base-type))
      (unsupported (format "no base type known for column %s of type %s; add it to :base-types"
                           (pr-str (:name column)) (pr-str data-type)))

      (and (= agg :sum_boolean) base-type (not= base-type :type/Boolean))
      (unsupported (format "sum_boolean over the non-boolean column %s" (pr-str (:name column))))

      ;; COALESCE(MAX(text), 0) fails in the warehouse; every other aggregation has a numeric result
      (and (some? fill-nulls-with) (#{:min :max} agg) base-type (not (isa? base-type :type/Number)))
      (unsupported (format "fill_nulls_with %s on a non-numeric aggregation: %s of column %s, which is %s"
                           fill-nulls-with (name agg) (pr-str (:name column)) base-type))

      :else
      (assoc resolved :field {:ref       (conj source-table (or (:name column) column-name))
                              :base-type base-type}))))

(mu/defn resolve-manifest :- ::schemas.resolved/manifest
  "Resolve every metric in the IR. Unsupported metrics from the parse stage are carried over, so the result's
  `:unsupported` is the complete list for the run."
  [config                                               :- ::schemas.resolved/config
   {:keys [semantic-models metrics unsupported source]} :- ::schemas.ir/manifest]
  (let [{resolved false, failed true} (->> metrics
                                           (map #(resolve-metric config semantic-models %))
                                           (group-by #(contains? % :reason)))]
    {:collection  {:name      (:collection-name config "dbt metrics")
                   :entity-id (collection-entity-id (:project source))}
     :metrics     (vec resolved)
     :unsupported (into (vec unsupported) failed)}))
