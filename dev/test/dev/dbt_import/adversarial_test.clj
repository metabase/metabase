(ns dev.dbt-import.adversarial-test
  "Table-driven adversarial cases for the dbt → Metabase metric converter.

  Every case builds a small manifest in the shape `dbt parse` writes (manifest v12, dbt 1.12), runs it through the
  whole pipeline (`decode-manifest` → `parse` → `resolve` → `emit/aggregation-clause`) and checks one outcome:

  * `{:aggregation clause}`: the metric converts and emits exactly this aggregation (`:converted :any` accepts any);
  * `{:unsupported re}`: the metric lands in `:unsupported` with a reason matching `re` (`:any` accepts any reason);
  * `{:thrown re}`: the run throws, with a message matching `re`.

  Cases record what the converter *should* do. A case the converter gets wrong today carries `:pending \"why\"`. A
  pending case asserts that its expectation is still unmet, so the suite stays green; once a fix lands the case
  fails with a message saying to remove the marker. `pending-summary-test` prints every pending case."
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.schemas.dbt-manifest :as dbt-manifest]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (java.nio.file Files Path Paths)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------------ fixture ------------------------------------------------------------

(def ^:private db "Sales DB")

(def ^:private default-config
  {:databases     {"dbt_bi" db}
   :driver        :postgres
   :creator-email "admin@example.com"})

(def ^:private model-id "model.p.fact_sales")
(def ^:private sm-id "semantic_model.p.fact_sales")

(defn- fld
  "Portable `:field` clause for `column` on `public.fact_sales`."
  ([column base-type]
   (fld "public" "fact_sales" column base-type))
  ([schema table column base-type]
   [:field {:base-type base-type} [db schema table column]]))

(def ^:private pg-columns
  "Columns of `fact_sales`: name, declared Postgres `data_type`, the base type Postgres sync gives it, and a coarse
  kind used to decide which aggregations make sense."
  [["sales"         "float"                    :type/Float               :numeric]
   ["quantity"      "integer"                  :type/Integer             :numeric]
   ["amount"        "numeric(10, 2)"           :type/Decimal             :numeric]
   ["big_amount"    "bigint"                   :type/BigInteger          :numeric]
   ["small_qty"     "smallint"                 :type/Integer             :numeric]
   ["ratio"         "double precision"         :type/Float               :numeric]
   ["real_col"      "real"                     :type/Float               :numeric]
   ["price_money"   "money"                    :type/Decimal             :numeric]
   ["serial_id"     "serial"                   :type/Integer             :numeric]
   ["is_returned"   "boolean"                  :type/Boolean             :boolean]
   ["flag_bool"     "bool"                     :type/Boolean             :boolean]
   ["customer_key"  "text"                     :type/Text                :text]
   ["status"        "character varying(20)"    :type/Text                :text]
   ["code"          "char(3)"                  :type/Text                :text]
   ["order_uuid"    "uuid"                     :type/UUID                :uuid]
   ["payload"       "jsonb"                    :type/JSON                :json]
   ["date_day"      "date"                     :type/Date                :temporal]
   ["created_at"    "timestamp"                :type/DateTime            :temporal]
   ["created_at_tz" "timestamp with time zone" :type/DateTimeWithLocalTZ :temporal]
   ["shift_time"    "time"                     :type/Time                :temporal]
   ["blob"          "bytea"                    :type/*                   :binary]])

(def ^:private base-columns
  (into {"fact_sales_key" "integer"} (map (fn [[column-name data-type]] [column-name data-type])) pg-columns))

(defn- column-map
  "`columns` (name → data_type) as a node's `columns` map. A data type of `::remove` drops the column."
  [columns]
  (into {}
        (keep (fn [[column-name data-type]]
                (when-not (= data-type ::remove)
                  [column-name {:name column-name, :description "", :data_type data-type}])))
        columns))

(defn- model-node [columns]
  {:unique_id     model-id
   :resource_type "model"
   :name          "fact_sales"
   :database      "dbt_bi"
   :schema        "public"
   :alias         "fact_sales"
   :relation_name "\"dbt_bi\".\"public\".\"fact_sales\""
   :description   ""
   :columns       (column-map columns)})

(defn- base-measure []
  {:name                   "m"
   :agg                    "sum"
   :description            nil
   :label                  nil
   :create_metric          false
   :expr                   "sales"
   :agg_params             nil
   :non_additive_dimension nil
   :agg_time_dimension     nil
   :config                 {:meta {}}})

(defn- semantic-model [measures]
  {:unique_id      sm-id
   :name           "fact_sales"
   :label          nil
   :description    nil
   :model          "ref('fact_sales')"
   :node_relation  {:alias         "fact_sales"
                    :schema_name   "public"
                    :database      "dbt_bi"
                    :relation_name "\"dbt_bi\".\"public\".\"fact_sales\""}
   :defaults       {:agg_time_dimension "date_day"}
   :primary_entity nil
   :entities       [{:name "fact_sales_key", :type "primary", :description nil, :label nil, :role nil, :expr nil}
                    {:name "customer", :type "foreign", :description nil, :label nil, :role nil, :expr "customer_key"}]
   :dimensions     [{:name "date_day", :type "time", :description nil, :label nil, :is_partition false
                     :type_params {:time_granularity "day", :validity_params nil}, :expr nil}
                    {:name "status", :type "categorical", :description nil, :label nil, :is_partition false
                     :type_params nil, :expr nil}]
   :measures       measures
   :depends_on     {:macros [], :nodes [model-id]}
   :config         {:enabled true, :group nil, :meta {}}})

(defn- input-measure [overrides]
  (merge {:name "m", :filter nil, :alias nil, :join_to_timespine false, :fill_nulls_with nil} overrides))

(defn- base-type-params [im]
  {:measure                   im
   :input_measures            (if im [im] [])
   :numerator                 nil
   :denominator               nil
   :expr                      nil
   :window                    nil
   :grain_to_date             nil
   :metrics                   []
   :conversion_type_params    nil
   :cumulative_type_params    nil
   :metric_aggregation_params nil
   :fill_nulls_with           nil
   :join_to_timespine         false
   :is_private                nil})

(defn- base-metric []
  {:name             "m"
   :resource_type    "metric"
   :unique_id        "metric.p.m"
   :description      "d"
   :label            "M"
   :type             "simple"
   :filter           nil
   :metadata         nil
   :time_granularity nil
   :config           {:enabled true, :group nil, :meta {}}
   :depends_on       {:macros [], :nodes [sm-id]}
   :meta             {}
   :tags             []})

(defn- build-manifest
  "A manifest with one model node, one semantic model and one metric `m` (sum of `sales`). A case tweaks it with
  `:measure` (merged into the measure), `:measures` (replaces them), `:input-measure`, `:metric`, `:type-params`,
  `:columns` (merged into the node's columns) and finally `:edit`, a fn over the whole manifest."
  [{im-overrides :input-measure, :keys [measure measures metric type-params columns edit]}]
  (let [im      (input-measure im-overrides)
        metric' (merge (base-metric) metric)
        metric' (assoc metric' :type_params (merge (base-type-params im) (:type_params metric') type-params))]
    (cond-> {:metadata        {:dbt_schema_version "https://schemas.getdbt.com/dbt/manifest/v12.json"
                               :dbt_version        "1.12.6"
                               :project_name       "p"
                               :adapter_type       "postgres"}
             :nodes           {model-id (model-node (merge base-columns columns))}
             :semantic_models {sm-id (semantic-model (or measures [(merge (base-measure) measure)]))}
             :metrics         {(:unique_id metric') metric'}}
      edit edit)))

(defn- round-trip
  "The manifest as `dbt parse` would write it and the converter would read it: JSON with string keys."
  [manifest]
  (json/decode (json/encode manifest)))

(defn- run-case
  "Run a case through the whole pipeline and describe what happened to its metric."
  [{:keys [config metric-name] :as c}]
  (try
    (let [config      (merge default-config config)
          metric-name (or metric-name (get-in c [:metric :name]) "m")
          resolved    (->> (build-manifest c)
                           round-trip
                           dbt-manifest/decode-manifest
                           parse/parse-manifest
                           (resolve/resolve-manifest config))
          converted   (first (filter #(= metric-name (-> % :metric :name)) (:metrics resolved)))
          unsupported (first (filter #(= metric-name (:name %)) (:unsupported resolved)))]
      (cond
        converted   {:aggregation  (emit/aggregation-clause converted)
                     :source-table (:source-table converted)}
        unsupported {:unsupported (:reason unsupported)}
        :else       {:missing true}))
    (catch Throwable e
      {:thrown (or (ex-message e) (.getName (class e)))})))

(defn- matches-text? [expected actual]
  (and (string? actual)
       (or (= expected :any)
           (boolean (re-find expected actual)))))

(defn- satisfied? [expect result]
  (cond
    (= (:converted expect) :any)    (some? (:aggregation result))
    (contains? expect :aggregation) (and (= (:aggregation expect) (:aggregation result))
                                         (or (not (contains? expect :source-table))
                                             (= (:source-table expect) (:source-table result))))
    (contains? expect :unsupported) (matches-text? (:unsupported expect) (:unsupported result))
    (contains? expect :thrown)      (matches-text? (:thrown expect) (:thrown result))
    :else                           (throw (ex-info "case has no recognised expectation" {:expect expect}))))

(declare current-behaviour)

(defn- check-cases
  "Run `cases`. A pending case must still miss its expectation *and* still behave the way its pending reason says it
  does today (see [[current-behaviour]]), so a pending case cannot pass by accident, e.g. through a fixture bug."
  [cases]
  (doseq [{:keys [id expect pending] :as c} cases]
    (let [result (run-case c)
          ok?    (satisfied? expect result)]
      (testing (str id (when pending (str "  [pending: " pending "]")))
        (if pending
          (let [now (get @current-behaviour pending)]
            (is (not ok?) "this pending case now meets its expectation: remove its :pending marker")
            (is (some? now) "every pending reason needs an entry in current-behaviour")
            (when now
              (is (satisfied? now result)
                  (str "pending case changed behaviour\n  expected today " (pr-str now) "\n  actual         " (pr-str result)))))
          (is ok? (str "expected " (pr-str expect) "\n  actual   " (pr-str result))))))))

(def ^:private unsupported-sql #"SQL expression, not supported yet")
(def ^:private unsupported-filter #"filters are not supported yet")

;;; ------------------------------------------- 1. aggregation × column type (generated) -------------------------------------------

(defn- expected-clause [agg column base-type]
  (let [f (fld column base-type)]
    (case agg
      "sum"            [:sum {} f]
      "average"        [:avg {} f]
      "median"         [:median {} f]
      "percentile"     [:percentile {} f 0.9]
      "min"            [:min {} f]
      "max"            [:max {} f]
      "count"          [:count-where {} [:not-null {} f]]
      "count_distinct" [:distinct {} f]
      "sum_boolean"    [:count-where {} [:= {} f true]])))

(def ^:private aggregation-matrix-cases
  "Every aggregation over every column kind. Numeric aggregations need a numeric column; min and max need an orderable
  one; sum_boolean needs a boolean; counts take anything. min/max over uuid and bytea are skipped: whether they work
  depends on the warehouse version."
  (for [agg                                ["sum" "average" "median" "percentile" "min" "max" "count" "count_distinct" "sum_boolean"]
        [column data-type base-type kind] pg-columns
        :when (not (and (#{"min" "max"} agg) (#{:uuid :binary} kind)))
        :let [ok? (case agg
                    ("sum" "average" "median" "percentile") (= kind :numeric)
                    ("min" "max")                           (contains? #{:numeric :text :temporal} kind)
                    ("count" "count_distinct")              true
                    "sum_boolean"                           (= kind :boolean))]]
    (cond-> {:id      (format "%s over %s (%s)" agg column data-type)
             :measure (cond-> {:agg agg, :expr column}
                        (= agg "percentile") (assoc :agg_params {:percentile 0.9}))
             :expect  (if ok?
                        {:aggregation (expected-clause agg column base-type)}
                        {:unsupported :any})}
      (and (not ok?) (not= agg "sum_boolean"))
      (assoc :pending "resolve never checks the column type against the aggregation, so the card imports and then fails when run"))))

(deftest ^:parallel aggregation-x-column-type-test
  (check-cases aggregation-matrix-cases))

;;; ---------------------------------------------- 2. warehouse type strings (Postgres) ----------------------------------------------

(defn- type-case
  "A `count` over a column whose declared `data_type` is `data-type`; count accepts any column, so only the base
  type is under test."
  ([data-type expected]
   (type-case data-type expected nil))
  ([data-type expected pending]
   (cond-> {:id      (str "data_type " (pr-str data-type))
            :columns {"x" data-type}
            :measure {:agg "count", :expr "x"}
            :expect  (if (keyword? expected)
                       {:aggregation [:count-where {} [:not-null {} (fld "x" expected)]]}
                       expected)}
     pending (assoc :pending pending))))

(def ^:private postgres-type-cases
  (concat
   (map #(apply type-case %)
        [["float" :type/Float] ["FLOAT" :type/Float] ["Float" :type/Float] ["  float  " :type/Float]
         ["float4" :type/Float] ["float8" :type/Float] ["real" :type/Float] ["double precision" :type/Float]
         ["DOUBLE PRECISION" :type/Float]
         ["integer" :type/Integer] ["INTEGER" :type/Integer] ["int" :type/Integer] ["int2" :type/Integer]
         ["int4" :type/Integer] ["int8" :type/BigInteger] ["bigint" :type/BigInteger] ["smallint" :type/Integer]
         ["serial" :type/Integer] ["bigserial" :type/BigInteger] ["smallserial" :type/Integer]
         ["numeric" :type/Decimal] ["numeric(10,2)" :type/Decimal] ["numeric(10, 2)" :type/Decimal]
         ["NUMERIC(38,0)" :type/Decimal] ["numeric (10,2)" :type/Decimal] ["decimal" :type/Decimal]
         ["decimal(5)" :type/Decimal] ["money" :type/Decimal]
         ["boolean" :type/Boolean] ["bool" :type/Boolean] ["BOOLEAN" :type/Boolean]
         ["text" :type/Text] ["varchar" :type/Text] ["varchar(255)" :type/Text] ["VARCHAR(255)" :type/Text]
         ["varchar(max)" :type/Text] ["character varying" :type/Text] ["character varying(255)" :type/Text]
         ["char" :type/Text] ["char(1)" :type/Text] ["character(10)" :type/Text] ["bpchar" :type/Text]
         ["citext" :type/Text]
         ["uuid" :type/UUID] ["json" :type/JSON] ["jsonb" :type/JSON] ["inet" :type/IPAddress]
         ["bytea" :type/*] ["interval" :type/*] ["tsvector" :type/*] ["geometry" :type/*]
         ["date" :type/Date] ["time" :type/Time] ["timetz" :type/TimeWithLocalTZ]
         ["time without time zone" :type/Time] ["timestamp" :type/DateTime] ["timestamp(3)" :type/DateTime]
         ["timestamp without time zone" :type/DateTime] ["timestamp with time zone" :type/DateTimeWithLocalTZ]
         ["timestamptz" :type/DateTimeWithLocalTZ] ["TIMESTAMP WITH TIME ZONE" :type/DateTimeWithLocalTZ]])
   ;; types Postgres knows but the normalizer mangles
   [(type-case "double  precision" :type/Float "internal whitespace in the type name is not collapsed")
    (type-case "timestamp(6) with time zone" :type/DateTimeWithLocalTZ
               "a precision in the middle of the type name is not stripped, only a trailing one")
    (type-case "timestamp(6) without time zone" :type/DateTime
               "a precision in the middle of the type name is not stripped, only a trailing one")
    (type-case "time(3) without time zone" :type/Time
               "a precision in the middle of the type name is not stripped, only a trailing one")
    (type-case "integer[]" :type/* "array types are not recognised")
    (type-case "numeric(10,2)[]" :type/* "array types are not recognised")]
   ;; types nobody knows: reported, not guessed
   (for [data-type ["geography" "geography(Point,4326)" "my_enum" "USER-DEFINED" "" "   "]]
     (type-case data-type {:unsupported #"no base type known"}))))

(def ^:private base-type-override-cases
  [{:id      "a :base-types override applies to an unknown type with a precision suffix"
    :config  {:base-types {"geography" :type/Text}}
    :columns {"x" "GEOGRAPHY(POINT,4326)"}
    :measure {:agg "count", :expr "x"}
    :expect  {:aggregation [:count-where {} [:not-null {} (fld "x" :type/Text)]]}}
   {:id      "a :base-types override wins over the driver's own mapping"
    :config  {:base-types {"float" :type/Decimal}}
    :measure {:agg "sum", :expr "sales"}
    :expect  {:aggregation [:sum {} (fld "sales" :type/Decimal)]}}
   {:id      "an override keyed by the full un-normalized name is a workaround for mid-name precisions"
    :config  {:base-types {"timestamp(6) with time zone" :type/DateTimeWithLocalTZ}}
    :columns {"x" "timestamp(6) with time zone"}
    :measure {:agg "max", :expr "x"}
    :expect  {:aggregation [:max {} (fld "x" :type/DateTimeWithLocalTZ)]}}
   {:id      "an upper-case override key should still match"
    :config  {:base-types {"GEOGRAPHY" :type/Text}}
    :columns {"x" "geography"}
    :measure {:agg "count", :expr "x"}
    :expect  {:aggregation [:count-where {} [:not-null {} (fld "x" :type/Text)]]}
    :pending "override keys are compared verbatim against the lower-cased type name"}])

(deftest ^:parallel postgres-type-string-test
  (check-cases postgres-type-cases)
  (check-cases base-type-override-cases))

;;; ------------------------------------------------ 3. other drivers' type strings ------------------------------------------------

(def ^:private upper-case-map-pending
  "this driver's type map is keyed by upper-case names but normalize-type-name lower-cases the warehouse type, so no type ever resolves")

(def ^:private mysql-type-cases
  (for [[data-type expected] [["int" :type/Integer] ["INT" :type/Integer] ["integer" :type/Integer]
                              ["bigint" :type/BigInteger] ["tinyint(1)" :type/Integer] ["smallint" :type/Integer]
                              ["mediumint" :type/Integer] ["decimal(10,2)" :type/Decimal] ["double" :type/Float]
                              ["float" :type/Float] ["varchar(255)" :type/Text] ["text" :type/Text]
                              ["longtext" :type/Text] ["datetime" :type/DateTime]
                              ["timestamp" :type/DateTimeWithLocalTZ] ["date" :type/Date] ["json" :type/JSON]
                              ["int unsigned" :type/Integer] ["bigint(20) unsigned" :type/BigInteger]
                              ["year" :type/Integer] ["enum('a','b')" :type/MySQLEnum]]]
    (assoc (type-case data-type expected upper-case-map-pending)
           :id     (str "mysql data_type " (pr-str data-type))
           :config {:driver :mysql})))

(def ^:private h2-type-cases
  (for [[data-type expected] [["INTEGER" :type/Integer] ["integer" :type/Integer] ["VARCHAR" :type/Text]
                              ["DOUBLE PRECISION" :type/Float] ["BOOLEAN" :type/Boolean]
                              ["TIMESTAMP WITH TIME ZONE" :type/DateTimeWithLocalTZ] ["DECIMAL(10,2)" :type/Decimal]]]
    (assoc (type-case data-type expected upper-case-map-pending)
           :id     (str "h2 data_type " (pr-str data-type))
           :config {:driver :h2})))

(def ^:private driver-config-cases
  [{:id      "an unknown driver fails the run instead of producing cards"
    :config  {:driver :not-a-real-driver}
    :measure {:agg "sum", :expr "sales"}
    :expect  {:thrown :any}}])

(deftest ^:parallel other-driver-type-string-test
  (check-cases mysql-type-cases)
  (check-cases h2-type-cases)
  (check-cases driver-config-cases))

;;; ------------------------------------------------------- 4. expr forms -------------------------------------------------------

(def ^:private expr-cases
  [{:id "nil expr means the measure name is the column"
    :measure {:name "sales", :expr nil} :input-measure {:name "sales"}
    :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "nil expr with a measure name that is not a column"
    :measure {:name "revenue", :expr nil} :input-measure {:name "revenue"}
    :expect {:unsupported #"column \"revenue\" not found"}}
   {:id "upper-case expr matches the column case-insensitively"
    :measure {:expr "SALES"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "mixed-case expr" :measure {:expr "Sales"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "an exact-case match wins over a case-insensitive one"
    :columns {"SALES" "numeric"} :measure {:expr "SALES"}
    :expect {:aggregation [:sum {} (fld "SALES" :type/Decimal)]}}
   {:id "a double-quoted identifier is still just the column"
    :measure {:expr "\"sales\""} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}
    :pending "a quoted identifier is classified as SQL"}
   {:id "a double-quoted mixed-case identifier keeps its case"
    :columns {"Sales" "float"} :measure {:expr "\"Sales\""}
    :expect {:aggregation [:sum {} (fld "Sales" :type/Float)]}
    :pending "a quoted identifier is classified as SQL"}
   {:id "a table-qualified column is still just the column"
    :measure {:expr "fact_sales.sales"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}
    :pending "a qualified identifier is classified as SQL"}
   {:id "leading whitespace around a column name"
    :measure {:expr " sales"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}
    :pending "expr is not trimmed before classification"}
   {:id "a trailing newline, which a YAML block scalar (expr: |) always adds"
    :measure {:expr "sales\n"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}
    :pending "expr is not trimmed before classification"}
   {:id "a non-ASCII column name"
    :columns {"größe" "numeric"} :measure {:expr "größe"}
    :expect {:aggregation [:sum {} (fld "größe" :type/Decimal)]}
    :pending "identifier-re only accepts ASCII letters"}
   {:id "a column name starting with a digit (legal when quoted in the warehouse)"
    :columns {"2024_sales" "numeric"} :measure {:expr "2024_sales"}
    :expect {:aggregation [:sum {} (fld "2024_sales" :type/Decimal)]}
    :pending "identifier-re rejects a leading digit"}
   {:id "a column name starting with an underscore"
    :columns {"_sales" "numeric"} :measure {:expr "_sales"}
    :expect {:aggregation [:sum {} (fld "_sales" :type/Decimal)]}}
   {:id "a column named with a SQL reserved word (order)"
    :columns {"order" "float"} :measure {:expr "order"}
    :expect {:aggregation [:sum {} (fld "order" :type/Float)]}}
   {:id "a column named with a SQL reserved word (select)"
    :columns {"select" "integer"} :measure {:expr "select"}
    :expect {:aggregation [:sum {} (fld "select" :type/Integer)]}}
   {:id "arithmetic on a column" :measure {:expr "sales + 0"} :expect {:unsupported unsupported-sql}}
   {:id "a function call" :measure {:expr "coalesce(sales, 0)"} :expect {:unsupported unsupported-sql}}
   {:id "a cast" :measure {:expr "sales::numeric"} :expect {:unsupported unsupported-sql}}
   {:id "a CASE expression"
    :measure {:expr "case when is_returned then sales else 0 end"} :expect {:unsupported unsupported-sql}}
   {:id "a product of two columns" :measure {:expr "sales * quantity"} :expect {:unsupported unsupported-sql}}
   {:id "a trailing SQL comment" :measure {:expr "sales -- revenue"} :expect {:unsupported unsupported-sql}}
   {:id "Jinja in expr" :measure {:expr "{{ var('amount_col') }}"} :expect {:unsupported unsupported-sql}}
   {:id "an aggregate inside expr" :measure {:agg "count", :expr "count(*)"} :expect {:unsupported unsupported-sql}}
   {:id "DISTINCT inside expr with agg count"
    :measure {:agg "count", :expr "distinct customer_key"} :expect {:unsupported unsupported-sql}}
   {:id "count of * is a row count"
    :measure {:agg "count", :expr "*"} :expect {:aggregation [:count {}]}
    :pending "* is classified as SQL"}
   {:id "sum of the literal 1 is a row count" :measure {:expr "1"} :expect {:aggregation [:count {}]}}
   {:id "count of the literal 1 is a row count" :measure {:agg "count", :expr "1"} :expect {:aggregation [:count {}]}}
   {:id "count_distinct of the literal 1"
    :measure {:agg "count_distinct", :expr "1"} :expect {:unsupported #"count_distinct over the literal 1"}}
   {:id "average of the literal 1" :measure {:agg "average", :expr "1"} :expect {:unsupported #"over the literal 1"}}
   {:id "max of the literal 1" :measure {:agg "max", :expr "1"} :expect {:unsupported #"over the literal 1"}}
   {:id "sum of the literal 0" :measure {:expr "0"} :expect {:unsupported #"sum over the literal 0"}}
   {:id "sum of the literal 2" :measure {:expr "2"} :expect {:unsupported #"sum over the literal 2"}}
   {:id "sum of the literal 01" :measure {:expr "01"} :expect {:unsupported #"literal 01"}}
   {:id "sum of the literal 1.0" :measure {:expr "1.0"} :expect {:unsupported unsupported-sql}}
   {:id "the bare word true is not a column" :measure {:expr "true"} :expect {:unsupported #"column \"true\" not found"}}
   {:id "the bare word null is not a column" :measure {:expr "null"} :expect {:unsupported #"column \"null\" not found"}}
   {:id "an empty expr" :measure {:expr ""} :expect {:unsupported :any}}
   {:id "expr naming a categorical dimension's column"
    :measure {:agg "count_distinct", :expr "status"} :expect {:aggregation [:distinct {} (fld "status" :type/Text)]}}
   {:id "expr naming an entity, not a column"
    :measure {:agg "count_distinct", :expr "customer"} :expect {:unsupported #"column \"customer\" not found"}}
   {:id "agg_time_dimension pointing at a missing dimension does not block conversion"
    :measure {:agg_time_dimension "nope"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}])

(deftest ^:parallel expr-test
  (check-cases expr-cases))

;;; ------------------------------------------- 5. counts, percentiles, sum_boolean -------------------------------------------

(def ^:private count-cases
  [{:id "count of a nullable column skips nulls"
    :measure {:agg "count", :expr "sales"} :expect {:aggregation [:count-where {} [:not-null {} (fld "sales" :type/Float)]]}}
   {:id "count of the primary-key column"
    :measure {:agg "count", :expr "fact_sales_key"}
    :expect {:aggregation [:count-where {} [:not-null {} (fld "fact_sales_key" :type/Integer)]]}}
   {:id "count_distinct of a foreign key"
    :measure {:agg "count_distinct", :expr "customer_key"} :expect {:aggregation [:distinct {} (fld "customer_key" :type/Text)]}}])

(defn- percentile-case
  ([agg-params expected]
   (percentile-case agg-params expected nil))
  ([agg-params expected pending]
   (cond-> {:id      (str "percentile with agg_params " (pr-str agg-params))
            :measure {:agg "percentile", :expr "sales", :agg_params agg-params}
            :expect  (if (number? expected)
                       {:aggregation [:percentile {} (fld "sales" :type/Float) expected]}
                       expected)}
     pending (assoc :pending pending))))

(def ^:private percentile-cases
  (concat
   (map #(apply percentile-case %)
        [[{:percentile 0.95} 0.95] [{:percentile 0.5} 0.5] [{:percentile 0.99} 0.99] [{:percentile 0.25} 0.25]
         [{:percentile 95} 0.95] [{:percentile 95.0} 0.95] [{:percentile 50} 0.5] [{:percentile 99} 0.99]
         [{:percentile 75} 0.75] [{:percentile 100} 1.0] [{:percentile 0} 0.0] [{:percentile 0.0} 0.0]
         [{:percentile 0.9, :use_discrete_percentile false} 0.9]
         [{:percentile 0.9, :use_approximate_percentile true} 0.9]
         [nil {:unsupported #"without a percentile value"}]
         [{} {:unsupported #"without a percentile value"}]
         [{:percentile nil} {:unsupported #"without a percentile value"}]])
   [(percentile-case {:percentile 1} {:unsupported :any}
                     "1 means p100 as a legacy fraction but p1 in the 1.12 percent form; the converter silently picks p100")
    (percentile-case {:percentile 150} {:unsupported :any} "out-of-range percentiles become a fraction above 1")
    (percentile-case {:percentile -0.5} {:unsupported :any} "negative percentiles pass straight through")
    (percentile-case {:percentile 0.9, :use_discrete_percentile true} {:unsupported :any}
                     "Metabase's percentile is continuous, so a discrete percentile silently changes the number")]
   [{:id "agg_params on a non-percentile aggregation are ignored"
     :measure {:agg "sum", :expr "sales", :agg_params {:percentile 0.9}}
     :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
    {:id "median is its own aggregation, not p50"
     :measure {:agg "median", :expr "sales"} :expect {:aggregation [:median {} (fld "sales" :type/Float)]}}]))

(def ^:private sum-boolean-cases
  [{:id "sum_boolean over a SQL predicate"
    :measure {:agg "sum_boolean", :expr "status = 'returned'"} :expect {:unsupported unsupported-sql}}
   {:id "sum_boolean over the literal 1"
    :measure {:agg "sum_boolean", :expr "1"} :expect {:unsupported #"sum_boolean over the literal 1"}}
   {:id "sum_boolean with fill_nulls_with"
    :measure {:agg "sum_boolean", :expr "is_returned"} :input-measure {:fill_nulls_with 0}
    :expect {:aggregation [:coalesce {} [:count-where {} [:= {} (fld "is_returned" :type/Boolean) true]] 0]}}])

(deftest ^:parallel count-percentile-sum-boolean-test
  (check-cases count-cases)
  (check-cases percentile-cases)
  (check-cases sum-boolean-cases))

;;; ---------------------------------------------- 6. fill_nulls_with, join_to_timespine ----------------------------------------------

(def ^:private sum-sales [:sum {} (fld "sales" :type/Float)])

(def ^:private fill-and-timespine-cases
  [{:id "fill_nulls_with on the metric" :type-params {:fill_nulls_with 0} :expect {:aggregation [:coalesce {} sum-sales 0]}}
   {:id "fill_nulls_with on the input measure" :input-measure {:fill_nulls_with 0} :expect {:aggregation [:coalesce {} sum-sales 0]}}
   {:id "the metric's fill_nulls_with wins over the input measure's"
    :type-params {:fill_nulls_with 1} :input-measure {:fill_nulls_with 0} :expect {:aggregation [:coalesce {} sum-sales 1]}}
   {:id "a negative fill_nulls_with" :type-params {:fill_nulls_with -1} :expect {:aggregation [:coalesce {} sum-sales -1]}}
   {:id "fill_nulls_with on a count"
    :measure {:agg "count", :expr "sales"} :type-params {:fill_nulls_with 0}
    :expect {:aggregation [:coalesce {} [:count-where {} [:not-null {} (fld "sales" :type/Float)]] 0]}}
   {:id "fill_nulls_with on a row count" :measure {:expr "1"} :type-params {:fill_nulls_with 0}
    :expect {:aggregation [:coalesce {} [:count {}] 0]}}
   {:id "fill_nulls_with 0 on a text aggregation"
    :measure {:agg "max", :expr "customer_key"} :type-params {:fill_nulls_with 0}
    :expect {:unsupported :any}
    :pending "COALESCE(max(text), 0) fails in the warehouse; the type of fill_nulls_with is never checked"}
   {:id "join_to_timespine on the metric"
    :type-params {:join_to_timespine true} :expect {:unsupported :any}
    :pending "join_to_timespine is parsed and then dropped, so empty periods silently disappear"}
   {:id "join_to_timespine on the input measure"
    :input-measure {:join_to_timespine true} :expect {:unsupported :any}
    :pending "join_to_timespine is parsed and then dropped, so empty periods silently disappear"}
   {:id "join_to_timespine with fill_nulls_with"
    :type-params {:join_to_timespine true, :fill_nulls_with 0} :expect {:unsupported :any}
    :pending "join_to_timespine is parsed and then dropped, so empty periods silently disappear"}])

(deftest ^:parallel fill-and-timespine-test
  (check-cases fill-and-timespine-cases))

;;; ------------------------------------------------------------ 7. filters ------------------------------------------------------------

(def ^:private filter-templates
  "Filter templates that exercise the MetricFlow filter grammar. All are unsupported until QRES-3; they are listed so
  QRES-3 starts with a corpus."
  ["{{ Dimension('order__status') }} = 'Shipped'"
   "{{ Dimension('order__status') }} != 'Cancelled'"
   "{{ Dimension('order__status') }} <> 'Cancelled'"
   "{{ Dimension('order__status') }} IN ('Shipped', 'Delivered')"
   "{{ Dimension('order__status') }} NOT IN ('Cancelled')"
   "{{ Dimension('order__status') }} IS NULL"
   "{{ Dimension('order__status') }} IS NOT NULL"
   "{{ Dimension('customer__name') }} LIKE '%Inc%'"
   "{{ Dimension('customer__name') }} ILIKE 'acme%'"
   "lower({{ Dimension('customer__name') }}) = 'acme'"
   "{{ Dimension('order__is_food_order') }}"
   "{{ Dimension('order__is_food_order') }} = true"
   "NOT {{ Dimension('order__is_food_order') }}"
   "{{ Dimension('order__amount') }} > 100"
   "{{ Dimension('order__amount') }} BETWEEN 10 AND 100"
   "{{ Dimension('order__amount') }} >= 0.5"
   "{{ Dimension('order__amount') }} = -1"
   "{{ TimeDimension('metric_time', 'day') }} >= '2024-01-01'"
   "{{ TimeDimension('order__ordered_at', 'month') }} = '2024-03-01'"
   "{{ TimeDimension('metric_time', 'week') }} < current_date"
   "{{ TimeDimension('metric_time', 'day') }} BETWEEN '2024-01-01' AND '2024-12-31'"
   "{{ TimeDimension('metric_time', 'fiscal_quarter') }} = '2024-Q1'"
   "{{ Entity('customer') }} IS NOT NULL"
   "{{ Entity('customer') }} = 42"
   "{{ Metric('order_total', group_by=['customer']) }} > 1000"
   "{{ Metric('order_count', group_by=['customer']) }} >= 5"
   "{{ Dimension('customer__region__country') }} = 'US'"
   "{{ Dimension('order__status') }} = 'O''Reilly'"
   "{{ Dimension(\"order__status\") }} = 'Shipped'"
   "{{Dimension('order__status')}}='Shipped'"
   "{{ Dimension('order__status') }} = 'Shipped' OR {{ Dimension('order__status') }} = 'Delivered'"
   "({{ Dimension('order__status') }} = 'Shipped' AND {{ Dimension('order__amount') }} > 0) OR {{ Entity('customer') }} IS NULL"
   "{{ Dimension('order__status') }} = '{{ not jinja }}'"
   "{{ Dimension('order__status') }} = '😀'"
   "{{ Dimension('order__status') }} = ''"
   "1 = 1"
   "{{ Dimension('order__status') }} = 'Shipped' -- comment"
   "{{ Dimension('order__status') }} = 'Shipped'; DROP TABLE fact_sales"
   "{{ Dimension('order__status') }} = 'Shipped'\n"
   "   "])

(def ^:private filter-cases
  (concat
   (for [template filter-templates]
     {:id     (str "metric filter " (pr-str template))
      :metric {:filter {:where_filters [{:where_sql_template template}]}}
      :expect {:unsupported unsupported-filter}})
   [{:id "a filter on the input measure only"
     :input-measure {:filter {:where_filters [{:where_sql_template "{{ Dimension('order__status') }} = 'Shipped'"}]}}
     :expect {:unsupported unsupported-filter}}
    {:id "filters on both the metric and its input measure"
     :metric {:filter {:where_filters [{:where_sql_template "{{ Entity('customer') }} IS NOT NULL"}]}}
     :input-measure {:filter {:where_filters [{:where_sql_template "{{ Dimension('order__status') }} = 'Shipped'"}]}}
     :expect {:unsupported unsupported-filter}}
    {:id "two where_filters ANDed on one metric"
     :metric {:filter {:where_filters [{:where_sql_template "{{ Dimension('order__status') }} = 'Shipped'"}
                                       {:where_sql_template "{{ Dimension('order__amount') }} > 0"}]}}
     :expect {:unsupported unsupported-filter}}
    {:id "an empty where_filters list is no filter" :metric {:filter {:where_filters []}} :expect {:aggregation sum-sales}}
    {:id "a null filter is no filter" :metric {:filter nil} :expect {:aggregation sum-sales}}]))

(deftest ^:parallel filter-test
  (check-cases filter-cases))

;;; ------------------------------------------- 8. non-additive dimensions and metric types -------------------------------------------

(def ^:private non-additive-cases
  [{:id "non_additive_dimension, window_choice max"
    :measure {:non_additive_dimension {:name "date_day", :window_choice "max"}} :expect {:unsupported #"non-additive"}}
   {:id "non_additive_dimension, window_choice min"
    :measure {:non_additive_dimension {:name "date_day", :window_choice "min"}} :expect {:unsupported #"non-additive"}}
   {:id "non_additive_dimension with window_groupings"
    :measure {:non_additive_dimension {:name "date_day", :window_choice "max", :window_groupings ["customer"]}}
    :expect {:unsupported #"non-additive"}}
   {:id "non_additive_dimension naming a dimension that does not exist"
    :measure {:non_additive_dimension {:name "nope", :window_choice "max"}} :expect {:unsupported #"non-additive"}}
   {:id "an invalid window_choice fails the whole manifest"
    :measure {:non_additive_dimension {:name "date_day", :window_choice "first"}} :expect {:thrown #"Invalid dbt manifest"}}])

(defn- metric-input [metric-name & {:as overrides}]
  (merge {:name metric-name, :filter nil, :alias nil} overrides))

(defn- other-type-case [id metric-type type-params]
  {:id          id
   :metric      {:type metric-type}
   :type-params (merge {:measure nil, :input_measures []} type-params)
   :expect      {:unsupported (re-pattern (str "metric type " metric-type " is not supported yet"))}})

(def ^:private metric-type-cases
  [(other-type-case "ratio" "ratio" {:numerator (metric-input "a"), :denominator (metric-input "b")})
   (other-type-case "ratio of a metric to itself" "ratio" {:numerator (metric-input "a"), :denominator (metric-input "a")})
   (other-type-case "ratio with a filtered numerator" "ratio"
                    {:numerator   (metric-input "a" :filter {:where_filters [{:where_sql_template "{{ Dimension('order__status') }} = 'Shipped'"}]})
                     :denominator (metric-input "a")})
   (other-type-case "ratio with aliases" "ratio" {:numerator (metric-input "a" :alias "x"), :denominator (metric-input "b" :alias "y")})
   (other-type-case "derived from one input" "derived" {:expr "a * 100", :metrics [(metric-input "a")]})
   (other-type-case "derived difference" "derived" {:expr "a - b", :metrics [(metric-input "a") (metric-input "b")]})
   (other-type-case "derived with a guarded division" "derived" {:expr "a / nullif(b, 0)", :metrics [(metric-input "a") (metric-input "b")]})
   (other-type-case "derived period over period" "derived"
                    {:expr    "current - previous"
                     :metrics [(metric-input "a" :alias "current")
                               (metric-input "a" :alias "previous" :offset_window {:count 7, :granularity "day"})]})
   (other-type-case "derived with offset_to_grain" "derived"
                    {:expr "a - mtd", :metrics [(metric-input "a") (metric-input "a" :alias "mtd" :offset_to_grain "month")]})
   (other-type-case "derived from a derived metric" "derived" {:expr "d * 2", :metrics [(metric-input "d")]})
   (other-type-case "cumulative over a 7 day window" "cumulative" {:measure (input-measure {}), :window {:count 7, :granularity "day"}})
   (other-type-case "cumulative month to date" "cumulative" {:measure (input-measure {}), :grain_to_date "month"})
   (other-type-case "cumulative all time" "cumulative" {:measure (input-measure {})})
   (other-type-case "cumulative, period_agg first" "cumulative"
                    {:measure (input-measure {}), :cumulative_type_params {:window nil, :grain_to_date "month", :period_agg "first"}})
   (other-type-case "cumulative, period_agg last" "cumulative"
                    {:measure (input-measure {}), :cumulative_type_params {:window {:count 30, :granularity "day"}, :grain_to_date nil, :period_agg "last"}})
   (other-type-case "cumulative, period_agg average" "cumulative"
                    {:measure (input-measure {}), :cumulative_type_params {:window nil, :grain_to_date nil, :period_agg "average"}})
   (other-type-case "conversion rate" "conversion"
                    {:conversion_type_params {:base_measure (input-measure {}), :conversion_measure (input-measure {:name "paid"})
                                              :entity "customer", :calculation "conversion_rate", :window nil, :constant_properties nil}})
   (other-type-case "conversion count" "conversion"
                    {:conversion_type_params {:base_measure (input-measure {}), :conversion_measure (input-measure {:name "paid"})
                                              :entity "customer", :calculation "conversions", :window {:count 7, :granularity "day"}}})
   (other-type-case "conversion with constant properties" "conversion"
                    {:conversion_type_params {:base_measure (input-measure {}), :conversion_measure (input-measure {:name "paid"})
                                              :entity "customer", :calculation "conversion_rate"
                                              :constant_properties [{:base_property "plan", :conversion_property "plan"}]}})])

(deftest ^:parallel non-additive-and-metric-type-test
  (check-cases non-additive-cases)
  (check-cases metric-type-cases))

;;; ------------------------------------------------- 9. 1.12 inline-spec simple metrics -------------------------------------------------

(defn- inline-case [id params expect & {:as more}]
  (merge {:id          (str "inline spec: " id)
          :type-params {:measure nil, :input_measures [], :metric_aggregation_params (merge {:semantic_model "fact_sales"} params)}
          :expect      expect}
         more))

(def ^:private inline-cases
  [(inline-case "sum" {:agg "sum", :expr "sales"} {:aggregation sum-sales})
   (inline-case "count_distinct" {:agg "count_distinct", :expr "customer_key"}
                {:aggregation [:distinct {} (fld "customer_key" :type/Text)]})
   (inline-case "no expr defaults to the metric name" {:agg "sum"} {:aggregation sum-sales}
                :metric {:name "sales", :unique_id "metric.p.sales"})
   (inline-case "no expr and no column of the metric's name" {:agg "sum"} {:unsupported #"column \"m\" not found"})
   (inline-case "percentile" {:agg "percentile", :expr "sales", :agg_params {:percentile 0.9}}
                {:aggregation [:percentile {} (fld "sales" :type/Float) 0.9]})
   (inline-case "row count" {:agg "count", :expr "1"} {:aggregation [:count {}]})
   (inline-case "no agg" {} {:unsupported #"neither a measure nor metric_aggregation_params"})
   (inline-case "non-additive" {:agg "sum", :expr "sales", :non_additive_dimension {:name "date_day", :window_choice "max"}}
                {:unsupported #"non-additive"})
   (inline-case "agg_time_dimension override is accepted" {:agg "sum", :expr "sales", :agg_time_dimension "nope"}
                {:aggregation sum-sales})
   (inline-case "fill_nulls_with on the metric" {:agg "sum", :expr "sales"} {:aggregation [:coalesce {} sum-sales 0]}
                :type-params {:measure nil, :input_measures [], :fill_nulls_with 0
                              :metric_aggregation_params {:semantic_model "fact_sales", :agg "sum", :expr "sales"}})
   {:id          "inline spec: a measure and inline params both present, the measure wins"
    :type-params {:metric_aggregation_params {:semantic_model "fact_sales", :agg "max", :expr "sales"}}
    :expect      {:aggregation sum-sales}}])

(deftest ^:parallel inline-spec-test
  (check-cases inline-cases))

;;; ------------------------------------------------- 10. relations, nodes and columns -------------------------------------------------

(defn- edit-relation [k v]
  (fn [m] (assoc-in m [:semantic_models sm-id :node_relation k] v)))

(defn- re-home-model
  "Move the model node to `node-id` with `resource-type`, and point the semantic model at it."
  [node-id resource-type]
  (fn [m]
    (let [node (assoc (get-in m [:nodes model-id]) :unique_id node-id :resource_type resource-type)]
      (-> m
          (update :nodes #(-> % (dissoc model-id) (assoc node-id node)))
          (assoc-in [:semantic_models sm-id :depends_on :nodes] [node-id])))))

(def ^:private column-types-pending
  "most dbt projects declare no data_type (the flexanalytics staging models declare none); the manifest schema's own docstring says base types should then come from Metabase's synced metadata")

(def ^:private relation-cases
  [{:id "a relation with no database (Spark, some Databricks setups) cannot be mapped"
    :edit (edit-relation :database nil) :expect {:unsupported #"no Metabase database configured"}}
   {:id "database names are matched exactly against the config"
    :edit (edit-relation :database "DBT_BI") :expect {:unsupported #"no Metabase database configured for warehouse database \"DBT_BI\""}}
   {:id "an upper-case schema is used verbatim"
    :edit (edit-relation :schema_name "PUBLIC")
    :expect {:aggregation [:sum {} (fld "PUBLIC" "fact_sales" "sales" :type/Float)], :source-table [db "PUBLIC" "fact_sales"]}}
   {:id "an alias that differs from the model name is the table"
    :edit (edit-relation :alias "fct_sales_v2")
    :expect {:aggregation [:sum {} (fld "public" "fct_sales_v2" "sales" :type/Float)], :source-table [db "public" "fct_sales_v2"]}}
   {:id "a schema containing a dot is one name"
    :edit (edit-relation :schema_name "analytics.v2")
    :expect {:aggregation [:sum {} (fld "analytics.v2" "fact_sales" "sales" :type/Float)], :source-table [db "analytics.v2" "fact_sales"]}}
   {:id "a semantic model built on a seed"
    :edit (re-home-model "seed.p.fact_sales" "seed") :expect {:aggregation sum-sales}
    :pending "parse-columns only looks for model. nodes, so a seed's columns are never found"}
   {:id "a semantic model built on a snapshot"
    :edit (re-home-model "snapshot.p.fact_sales" "snapshot") :expect {:aggregation sum-sales}
    :pending "parse-columns only looks for model. nodes, so a snapshot's columns are never found"}
   {:id "depends_on lists another model first"
    :edit (fn [m]
            (-> m
                (assoc-in [:nodes "model.p.other"] (assoc (model-node {}) :unique_id "model.p.other" :name "other" :alias "other"))
                (assoc-in [:semantic_models sm-id :depends_on :nodes] ["model.p.other" model-id])))
    :expect {:aggregation sum-sales}
    :pending "the first model. dependency is taken instead of the node matching node_relation"}
   {:id "the model node is missing from the manifest"
    :edit (fn [m] (update m :nodes dissoc model-id)) :expect {:unsupported #"column \"sales\" not found"}}
   {:id "a column with no declared data_type" :columns {"sales" nil} :expect {:converted :any} :pending column-types-pending}
   {:id "a column the project never documented" :columns {"sales" ::remove} :expect {:converted :any} :pending column-types-pending}
   {:id "a model with no documented columns at all"
    :edit (fn [m] (assoc-in m [:nodes model-id :columns] {})) :expect {:converted :any} :pending column-types-pending}
   {:id "a metric whose depends_on names no semantic model"
    :metric {:depends_on {:macros [], :nodes []}} :expect {:unsupported #"semantic model nil not found"}}
   {:id "a metric whose semantic model is missing"
    :metric {:depends_on {:macros [], :nodes ["semantic_model.p.nope"]}} :expect {:unsupported #"semantic model \"semantic_model.p.nope\" not found"}}
   {:id "a metric whose measure is missing"
    :input-measure {:name "nope"} :expect {:unsupported #"measure \"nope\" not found on semantic model \"fact_sales\""}}
   {:id "the metrics map key is not the unique_id"
    :edit (fn [m] (update m :metrics (fn [ms] {"metric.p.weird_key" (val (first ms))}))) :expect {:aggregation sum-sales}}
   {:id "a semantic model with no default agg_time_dimension"
    :edit (fn [m] (assoc-in m [:semantic_models sm-id :defaults] nil)) :expect {:aggregation sum-sales}}])

(deftest ^:parallel relation-test
  (check-cases relation-cases))

;;; ------------------------------------------------------- 11. manifest-level -------------------------------------------------------

(defn- schema-version [v]
  (fn [m] (assoc-in m [:metadata :dbt_schema_version] (format "https://schemas.getdbt.com/dbt/manifest/%s.json" v))))

(defn- add-measure [measure]
  (fn [m] (update-in m [:semantic_models sm-id :measures] conj (merge (base-measure) measure))))

(defn- add-metric [metric]
  (fn [m] (assoc-in m [:metrics (:unique_id metric)] (merge (get-in m [:metrics "metric.p.m"]) metric))))

(def ^:private one-bad-enum-pending
  "decode-manifest validates the whole manifest up front, so one unknown enum value anywhere fails every metric instead of reporting just the one")

(def ^:private manifest-cases
  [{:id "manifest v13 is rejected" :edit (schema-version "v13") :expect {:thrown #"Invalid dbt manifest"}}
   {:id "manifest v9 is rejected" :edit (schema-version "v9") :expect {:thrown #"Invalid dbt manifest"}}
   {:id "manifest v10 is accepted" :edit (schema-version "v10") :expect {:aggregation sum-sales}}
   {:id "manifest v11 is accepted" :edit (schema-version "v11") :expect {:aggregation sum-sales}}
   {:id "unknown top-level keys and fields pass through"
    :edit (fn [m] (-> m (assoc :saved_queries {} :unit_tests {}) (assoc-in [:metrics "metric.p.m" :brand_new_field] {:x 1})))
    :expect {:aggregation sum-sales}}
   {:id "a pre-release dbt version string" :edit (fn [m] (assoc-in m [:metadata :dbt_version] "1.13.0-b2")) :expect {:aggregation sum-sales}}
   {:id "a custom time_granularity on the metric" :metric {:time_granularity "fiscal_quarter"} :expect {:aggregation sum-sales}}
   {:id "another measure with an aggregation the schema does not know"
    :edit (add-measure {:name "weird", :agg "approx_count_distinct"}) :expect {:aggregation sum-sales} :pending one-bad-enum-pending}
   {:id "another metric with a type the schema does not know"
    :edit (add-metric {:unique_id "metric.p.funnel", :name "funnel", :type "funnel"}) :expect {:aggregation sum-sales}
    :pending one-bad-enum-pending}
   {:id "a dimension with a custom granularity from the time spine (dbt 1.9+)"
    :edit (fn [m] (update-in m [:semantic_models sm-id :dimensions]
                             conj {:name "fiscal_day", :type "time", :description nil, :label nil, :is_partition false
                                   :type_params {:time_granularity "fiscal_quarter", :validity_params nil}, :expr "date_day"}))
    :expect {:aggregation sum-sales}
    :pending "custom granularities are valid dbt but not in ::time-granularity, which fails the whole manifest"}
   {:id "an entity type the schema does not know"
    :edit (fn [m] (update-in m [:semantic_models sm-id :entities] conj
                             {:name "k", :type "composite", :description nil, :label nil, :role nil, :expr nil}))
    :expect {:aggregation sum-sales}
    :pending one-bad-enum-pending}])

(deftest ^:parallel manifest-test
  (check-cases manifest-cases))

;;; ----------------------------------------------------- 12. names, files and YAML -----------------------------------------------------

(defn- metrics-manifest
  "A manifest whose metrics all sum `sales` and differ only in `label` (and description). Metric names are m0, m1, …"
  ([labels]
   (metrics-manifest labels (repeat nil)))
  ([labels descriptions]
   (let [base (get-in (build-manifest {}) [:metrics "metric.p.m"])]
     (build-manifest
      {:edit (fn [m]
               (assoc m :metrics (into (array-map)
                                       (map-indexed (fn [i [label description]]
                                                      (let [id (str "metric.p.m" i)]
                                                        [id (assoc base :name (str "m" i), :unique_id id
                                                                   :label label, :description description)]))
                                                    (map vector labels descriptions)))))}))))

(defn- resolve-manifest-map [manifest]
  (->> manifest round-trip dbt-manifest/decode-manifest parse/parse-manifest (resolve/resolve-manifest default-config)))

(defn- card-files [manifest]
  (rest (emit/files default-config (resolve-manifest-map manifest))))

(def ^:private card-dir "collections/main/dbt_metrics/")

(def ^:private adversarial-labels
  ["Sales" "sales" "SALES" "Sales!" "Sales?" "Sales 2" "sales_2" "sales_2" "../../etc/passwd" "..\\..\\windows\\system32"
   "a/b" "a/b/c" "." ".." "..." "📈" "📉" "📈📉" "Umsatz pro Größe" "日本語の売上" "Ventes €" (apply str (repeat 300 "x"))
   (apply str (repeat 120 "é")) (apply str (repeat 80 "日")) "con" "nul" "CON" "aux.yaml" "x.yaml" "  leading space"
   "trailing space  " "tab\tname" "new\nline" "#hash" "-dash" ":colon" "*star" "\"quoted\"" "'single'" "null" "true"])

(deftest ^:parallel adversarial-label-paths-test
  (let [files (card-files (metrics-manifest adversarial-labels))
        paths (map :path files)
        root  (Paths/get "/out" (make-array String 0))]
    (is (= (count adversarial-labels) (count files)) "every metric gets a file")
    (testing "file paths are unique, even on a case-insensitive file system"
      (is (= (count paths) (count (distinct (map u/lower-case-en paths))))))
    (doseq [path paths
            :let [file-name (subs path (count card-dir))]]
      (testing (pr-str path)
        (is (str/starts-with? path card-dir))
        (is (not (str/includes? file-name "/")) "a label cannot add a directory level")
        (is (str/ends-with? file-name ".yaml"))
        (is (<= (count (.getBytes ^String file-name "UTF-8")) 255) "fits a file name on ext4 and APFS")
        (is (.startsWith (.normalize ^Path (.resolve ^Path root ^String path)) root) "stays inside the export directory")))))

(deftest ^:parallel empty-label-test
  (testing "PENDING: an empty label should fall back to the metric name instead of breaking the run"
    (let [ok? (try
                (= ["m0"] (map #(-> % :entity :name) (card-files (metrics-manifest [""]))))
                (catch Throwable _ false))]
      (is (not ok?) "the empty label now works: turn this into a positive assertion"))))

(deftest ^:parallel nil-label-falls-back-to-name-test
  (is (= ["m0"] (map #(-> % :entity :name) (card-files (metrics-manifest [nil]))))))

(def ^:private yaml-hostile-strings
  ["key: value" "- not a list" "# not a comment" "'single'" "\"double\"" "multi\nline\n\nparagraphs" "trailing newline\n"
   "tab\there" "unicode ✓ ünï 日本" "---" "..." "null" "true" "false" "123" "1e3" "0x1F" "~" "{curly}" "[square]"
   "&anchor" "*alias" "!tag" "%percent" "@at" "`backtick`" "| pipe" "> greater" "| Metric | Definition |\n|---|---|"
   "   leading spaces" "trailing spaces   " "\\backslash" "emoji 📈" "a: b: c" "? question" ", comma" "=equals"])

(defn- temp-dir []
  (str (Files/createTempDirectory "dbt-import-adversarial" (make-array FileAttribute 0))))

(deftest yaml-round-trip-test
  (let [manifest (metrics-manifest yaml-hostile-strings yaml-hostile-strings)
        files    (emit/files default-config (resolve-manifest-map manifest))
        out-dir  (temp-dir)]
    (emit/write! out-dir files)
    (doseq [{:keys [path metric]} (rest files)
            :let [{card-name :name, :keys [description]} (yaml/parse-string (slurp (io/file out-dir path)))]]
      (testing (pr-str (-> metric :metric :label))
        (is (= (-> metric :metric :label) card-name) "the label survives YAML as the card name")
        (is (= (-> metric :metric :description) description) "the description survives YAML")))))

(deftest determinism-test
  (let [labels    ["Sales" "Quantity" "Price" "Target" "Sales"]
        forward   (metrics-manifest labels)
        backward  (update forward :metrics #(into (array-map) (reverse %)))
        run       (fn [manifest]
                    (let [files (emit/files default-config (resolve-manifest-map manifest))
                          dir   (temp-dir)]
                      (emit/write! dir files)
                      (into (sorted-map) (for [{:keys [path]} files] [path (slurp (io/file dir path))]))))
        first-run (run forward)]
    (testing "re-running produces byte-identical files"
      (is (= first-run (run forward))))
    (testing "the order metrics appear in the manifest does not change the output"
      (is (= first-run (run backward))))))

(deftest ^:parallel entity-id-test
  (let [ids (map #(resolve/entity-id (str "dbt-import/metric/metric.p.m" %)) (range 5000))]
    (is (every? #(re-matches #"^[A-Za-z0-9_-]{21}$" %) ids))
    (is (= 5000 (count (set ids))) "no collisions across 5,000 metrics"))
  (testing "the same metric name in two projects gets two entity ids"
    (is (not= (resolve/entity-id "dbt-import/metric/metric.a.sales")
              (resolve/entity-id "dbt-import/metric/metric.b.sales")))))

(deftest ^:parallel empty-manifest-test
  (let [resolved (resolve-manifest-map (assoc (build-manifest {}) :metrics {}))]
    (is (= [] (:metrics resolved)))
    (is (= [] (:unsupported resolved)))
    (is (= 1 (count (emit/files default-config resolved))) "only the collection")))

;;; -------------------------------------------------- what pending cases do today --------------------------------------------------

(def ^:private no-base-type {:unsupported #"no base type known"})
(def ^:private column-not-found {:unsupported #"column \"sales\" not found"})
(def ^:private invalid-manifest {:thrown #"Invalid dbt manifest"})

(def ^:private current-behaviour
  "Pending reason → what the converter does today for every case carrying it. Delayed so it can reference the reason
  strings defined above."
  (delay
    {"resolve never checks the column type against the aggregation, so the card imports and then fails when run"           {:converted :any}
     upper-case-map-pending                                                                                                  no-base-type
     "override keys are compared verbatim against the lower-cased type name"                                                 no-base-type
     "internal whitespace in the type name is not collapsed"                                                                 no-base-type
     "a precision in the middle of the type name is not stripped, only a trailing one"                                       no-base-type
     "array types are not recognised"                                                                                        no-base-type
     column-types-pending                                                                                                    {:unsupported #"no base type known|column \"sales\" not found"}
     "parse-columns only looks for model. nodes, so a seed's columns are never found"                                        column-not-found
     "parse-columns only looks for model. nodes, so a snapshot's columns are never found"                                    column-not-found
     "the first model. dependency is taken instead of the node matching node_relation"                                       column-not-found
     "a quoted identifier is classified as SQL"                                                                              {:unsupported unsupported-sql}
     "a qualified identifier is classified as SQL"                                                                           {:unsupported unsupported-sql}
     "expr is not trimmed before classification"                                                                             {:unsupported unsupported-sql}
     "identifier-re only accepts ASCII letters"                                                                              {:unsupported unsupported-sql}
     "identifier-re rejects a leading digit"                                                                                 {:unsupported unsupported-sql}
     "* is classified as SQL"                                                                                                {:unsupported unsupported-sql}
     one-bad-enum-pending                                                                                                    invalid-manifest
     "custom granularities are valid dbt but not in ::time-granularity, which fails the whole manifest"                      invalid-manifest
     "1 means p100 as a legacy fraction but p1 in the 1.12 percent form; the converter silently picks p100"                  {:aggregation [:percentile {} (fld "sales" :type/Float) 1.0]}
     "out-of-range percentiles become a fraction above 1"                                                                    {:aggregation [:percentile {} (fld "sales" :type/Float) 1.5]}
     "negative percentiles pass straight through"                                                                            {:aggregation [:percentile {} (fld "sales" :type/Float) -0.5]}
     "Metabase's percentile is continuous, so a discrete percentile silently changes the number"                             {:aggregation [:percentile {} (fld "sales" :type/Float) 0.9]}
     "COALESCE(max(text), 0) fails in the warehouse; the type of fill_nulls_with is never checked"                           {:aggregation [:coalesce {} [:max {} (fld "customer_key" :type/Text)] 0]}
     "join_to_timespine is parsed and then dropped, so empty periods silently disappear"                                     {:converted :any}}))

;;; ------------------------------------------------------------ summary ------------------------------------------------------------

(def ^:private all-cases
  (concat aggregation-matrix-cases postgres-type-cases base-type-override-cases mysql-type-cases h2-type-cases
          driver-config-cases expr-cases count-cases percentile-cases sum-boolean-cases fill-and-timespine-cases
          filter-cases non-additive-cases metric-type-cases inline-cases relation-cases manifest-cases))

(deftest ^:parallel case-ids-are-unique-test
  (let [ids (map :id all-cases)]
    (is (= (count ids) (count (set ids))) (str "duplicate ids: " (pr-str (keep (fn [[id n]] (when (> n 1) id)) (frequencies ids)))))))

(deftest pending-summary-test
  (let [pending (filter :pending all-cases)]
    (println (format "dbt-import adversarial: %d cases, %d pending" (count all-cases) (count pending)))
    (doseq [[reason cases] (group-by :pending pending)]
      (println (format "  %3d  %s" (count cases) reason)))
    (is (pos? (count all-cases)))))
