(ns dev.dbt-import.resolve
  "Stage 2 of the converter: bind IR metrics to Metabase names and types.

  Takes the IR (see [[dev.dbt-import.schemas.ir]]) and a config, and for every metric works out the serdes portable
  refs of its source table and aggregated column, the column's Metabase base type, and a deterministic `entity_id`.
  Metrics that cannot be expressed as a single-aggregation Metabase metric are reported in `:unsupported` with a
  reason instead of failing the run.

  Only knows the IR, not the manifest, so another semantic layer's parser would plug in unchanged."
  (:require
   [better-cond.core :as b]
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [dev.dbt-import.schemas.ir :as schemas.ir]
   [dev.dbt-import.schemas.resolved :as schemas.resolved]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

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
  "`VARCHAR(255)` → `:varchar`, `numeric(10, 2)` → `:numeric`, the form the driver's type map is keyed by."
  [s :- :string]
  (-> s u/lower-case-en (str/replace #"\s*\(.*\)\s*$" "") str/trim))

(mu/defn base-type :- [:maybe ::lib.schema.common/base-type]
  "The Metabase base type for a warehouse `data-type` string, as the `driver` maps it during sync, or nil when it is
  unknown or missing. `overrides` (the config's `:base-types`) wins over the driver."
  [driver    :- :keyword
   overrides :- [:maybe ::schemas.resolved/config.base-types]
   data-type :- [:maybe :string]]
  (when data-type
    (let [type-name (normalize-type-name data-type)]
      (or (get overrides type-name)
          (let [k (keyword type-name)]
            (driver/the-initialized-driver driver)
            (sql-jdbc.sync/database-type->base-type driver k))))))

(def ^:private identifier-re #"^[A-Za-z_][A-Za-z0-9_]*$")
(def ^:private integer-literal-re #"^\d+$")

(mu/defn- expr-kind :- [:enum :column :literal :sql]
  "What an IR `expr` is: a bare column name, an integer literal, or anything else (SQL)."
  [expr :- :string]
  (cond
    (re-matches identifier-re expr)      :column
    (re-matches integer-literal-re expr) :literal
    :else                                :sql))

(mu/defn- find-column :- [:maybe ::schemas.ir/column]
  "`columns` entry named `expr`, exactly or ignoring case."
  [columns :- [:map-of :string ::schemas.ir/column]
   expr    :- :string]
  (or (get columns expr)
      (some (fn [[column-name column]]
              (when (= (u/lower-case-en column-name) (u/lower-case-en expr))
                column))
            columns)))

(mu/defn resolve-metric :- [:or ::schemas.resolved/metric ::schemas.ir/unsupported]
  "Resolve one IR metric against the IR `semantic-models` (keyed by name) and `config`, or explain why it cannot be a
  Metabase metric yet."
  [config          :- ::schemas.resolved/config
   semantic-models :- [:map-of :string ::schemas.ir/semantic-model]
   {:keys [agg expr agg-params non-additive-dimension filters semantic-model] :as metric} :- ::schemas.ir/metric]
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

      (and (= agg :percentile) (not (:percentile agg-params)))
      (unsupported "percentile aggregation without a percentile value")

      :let [database (get-in config [:databases (:database relation)])]

      (not database)
      (unsupported (format "no Metabase database configured for warehouse database %s; add it to :databases"
                           (pr-str (:database relation))))

      :let [source-table [database (:schema relation) (:table relation)]
            kind         (expr-kind expr)
            resolved     {:metric       metric
                          :entity-id    (metric-entity-id metric)
                          :database     database
                          :source-table source-table}]

      (= kind :sql)
      (unsupported (format "expr %s is a SQL expression, not supported yet (QRES-3)" (pr-str expr)))

      (= kind :literal)
      (if (and (= expr "1") (#{:sum :count} agg))
        (assoc resolved :field nil)
        (unsupported (format "%s over the literal %s has no Metabase equivalent" (name agg) expr)))

      :let [column (find-column columns expr)]

      (not column)
      (unsupported (format "column %s not found on %s" (pr-str expr) (pr-str (:table relation))))

      :let [base-type (base-type (:driver config) (:base-types config) (:data-type column))]

      (not base-type)
      (unsupported (format "no base type known for column %s of type %s; add it to :base-types"
                           (pr-str (:name column)) (pr-str (:data-type column))))

      (and (= agg :sum_boolean) (not= base-type :type/Boolean))
      (unsupported (format "sum_boolean over the non-boolean column %s" (pr-str (:name column))))

      :else
      (assoc resolved :field {:ref       (conj source-table (:name column))
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
