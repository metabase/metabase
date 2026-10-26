(ns dev.dbt-import.resolve-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [are deftest is testing]]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.schemas.resolved :as resolved]
   [dev.dbt-import.test-util :as tu :refer [fld]]
   [metabase.util.malli.registry :as mr])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(def ^:private config tu/default-config)

(defn- flexanalytics-ir []
  (parse/parse-manifest-file (.getPath ^java.net.URL (io/resource "dbt_import/flexanalytics_manifest.json"))))

(defn- ir-metric-named [ir metric-name]
  (first (filter (comp #{metric-name} :name) (:metrics ir))))

(defn- resolved-metric-named [resolved metric-name]
  (first (filter (comp #{metric-name} :name :metric) (:metrics resolved))))

(deftest ^:parallel entity-id-test
  (is (mr/validate ::resolved/entity-id (resolve/entity-id "x")))
  (testing "deterministic"
    (is (= (resolve/entity-id "dbt-import/metric/a")
           (resolve/entity-id "dbt-import/metric/a"))))
  (is (not= (resolve/entity-id "a") (resolve/entity-id "b")))
  (testing "no collisions across 5,000 metrics"
    (let [ids (map #(resolve/entity-id (str "dbt-import/metric/metric.p.m" %)) (range 5000))]
      (is (every? #(re-matches #"^[A-Za-z0-9_-]{21}$" %) ids))
      (is (= 5000 (count (set ids))))))
  (testing "the same metric name in two projects gets two entity ids"
    (is (not= (resolve/entity-id "dbt-import/metric/metric.a.sales")
              (resolve/entity-id "dbt-import/metric/metric.b.sales")))))

(deftest ^:parallel base-type-test
  (testing "types come from the driver's sync mapping"
    (is (= :type/Float (resolve/base-type :postgres nil "float")))
    (is (= :type/Integer (resolve/base-type :postgres nil "integer")))
    (is (= :type/DateTimeWithLocalTZ (resolve/base-type :postgres nil "timestamp with time zone"))))
  (testing "length suffixes and case are stripped first"
    (is (= :type/Text (resolve/base-type :postgres nil "VARCHAR(255)")))
    (is (= :type/Decimal (resolve/base-type :postgres nil "numeric(10, 2)"))))
  (testing "a precision in the middle of the name and doubled spaces are normalized too"
    (is (= :type/DateTimeWithLocalTZ (resolve/base-type :postgres nil "timestamp(6) with time zone")))
    (is (= :type/Float (resolve/base-type :postgres nil "double  precision"))))
  (testing "array types are known to be arrays, which Metabase does not type further"
    (is (= :type/* (resolve/base-type :postgres nil "integer[]"))))
  (testing "drivers whose type maps are keyed by upper-case names"
    (is (= :type/Integer (resolve/base-type :mysql nil "int")))
    (is (= :type/Integer (resolve/base-type :h2 nil "integer"))))
  (is (nil? (resolve/base-type :postgres nil "geography")))
  (is (nil? (resolve/base-type :postgres nil nil)))
  (testing "config overrides win, whatever their case"
    (is (= :type/Text (resolve/base-type :postgres {"geography" :type/Text} "geography")))
    (is (= :type/Text (resolve/base-type :postgres {"GEOGRAPHY" :type/Text} "geography(Point,4326)")))))

(deftest ^:parallel resolve-manifest-test
  (let [resolved (resolve/resolve-manifest config (flexanalytics-ir))]
    (is (mr/validate ::resolved/manifest resolved))
    (is (= "dbt metrics" (-> resolved :collection :name)))
    (testing "the 8 bare-column metrics resolve"
      (is (= ["customer_count" "order_count" "price" "product_count" "quantity" "row_count" "sales" "target"]
             (map (comp :name :metric) (:metrics resolved)))))
    (testing "sales resolves to a portable field ref with a base type"
      (is (= {:database     "Sales DB"
              :source-table ["Sales DB" "public" "fact_sales"]
              :field        {:ref ["Sales DB" "public" "fact_sales" "sales"], :base-type :type/Float}}
             (select-keys (resolved-metric-named resolved "sales") [:database :source-table :field]))))
    (testing "customer_count resolves its key column as text"
      (is (= {:ref ["Sales DB" "public" "fact_sales" "customer_key"], :base-type :type/Text}
             (:field (resolved-metric-named resolved "customer_count")))))
    (testing "row_count, a sum of the literal 1, resolves with no field"
      (is (nil? (:field (resolved-metric-named resolved "row_count")))))
    (testing "sales_to_target is reported, not dropped"
      (is (= [{:name      "sales_to_target"
               :unique-id "metric.dbt_business_intelligence.sales_to_target"
               :reason    "expr \"sales / target\" is a SQL expression, not supported yet (QRES-3)"}]
             (:unsupported resolved))))
    (testing "entity ids are stable across runs"
      (is (= (map :entity-id (:metrics resolved))
             (map :entity-id (:metrics (resolve/resolve-manifest config (flexanalytics-ir)))))))))

(deftest ^:parallel resolve-metric-test
  (let [ir              (flexanalytics-ir)
        semantic-models (:semantic-models ir)
        sales           (ir-metric-named ir "sales")
        reason          (fn [config semantic-models metric]
                          (:reason (resolve/resolve-metric config semantic-models metric)))]
    (testing "a column the project does not document resolves without a base type; the import checks it exists"
      (is (= {:ref ["Sales DB" "public" "fact_sales" "nope"], :base-type nil}
             (:field (resolve/resolve-metric config semantic-models (assoc sales :expr "nope"))))))
    (is (re-find #"no Metabase database configured for warehouse database \"dbt_bi\""
                 (reason (assoc config :databases {}) semantic-models sales)))
    (is (re-find #"filters are not supported yet \(QRES-3\)"
                 (reason config semantic-models (assoc sales :filters ["{{ Dimension('x') }} = 1"]))))
    (is (re-find #"no base type known for column \"sales\" of type \"geography\""
                 (reason config (assoc-in semantic-models ["fact_sales" :columns "sales" :data-type] "geography") sales)))
    (is (re-find #"average over the literal 1"
                 (reason config semantic-models (assoc sales :agg :average :expr "1"))))
    (is (re-find #"sum_boolean over the non-boolean column"
                 (reason config semantic-models (assoc sales :agg :sum_boolean))))
    (is (re-find #"percentile aggregation without a percentile value"
                 (reason config semantic-models (assoc sales :agg :percentile))))))

(def ^:private sum-sales [:sum {} (fld "sales" :type/Float)])

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

(deftest ^:parallel aggregation-x-column-type-test
  ;; Every aggregation over every column it makes sense for: numeric aggregations over numeric columns, min and max
  ;; over orderable ones, counts over anything, and sum_boolean over booleans only. The converter does not refuse a
  ;; numeric aggregation over a non-numeric column (the lib schema accepts it and dbt itself would fail on it), so
  ;; only the sum_boolean refusal is asserted. min/max over uuid and bytea are skipped: whether they work depends on
  ;; the warehouse version.
  (doseq [agg                                ["sum" "average" "median" "percentile" "min" "max" "count" "count_distinct" "sum_boolean"]
          [column data-type base-type kind] tu/pg-columns
          :when (not (and (#{"min" "max"} agg) (#{:uuid :binary} kind)))
          :let [ok?    (case agg
                         ("sum" "average" "median" "percentile") (= kind :numeric)
                         ("min" "max")                           (contains? #{:numeric :text :temporal} kind)
                         ("count" "count_distinct")              true
                         "sum_boolean"                           (= kind :boolean))
                tweaks {:measure (cond-> {:agg agg, :expr column}
                                   (= agg "percentile") (assoc :agg_params {:percentile 0.9}))}]]
    (testing (format "%s over %s (%s)" agg column data-type)
      (cond
        ok?
        (is (= (expected-clause agg column base-type) (tu/aggregation tweaks)))

        (= agg "sum_boolean")
        (is (re-find #"sum_boolean over the non-boolean column" (tu/unsupported tweaks)))))))

(defn- count-of-column-typed
  "The aggregation a `count` over a column declared as `data-type` converts to, with `config` merged over the default.
  `count` accepts any column, so only the base type is under test."
  [data-type & {:as config}]
  (tu/aggregation {:columns {"x" data-type}, :measure {:agg "count", :expr "x"}, :config config}))

(defn- count-of-column-typed-reason
  "The reason a `count` over a column declared as `data-type` is reported."
  [data-type]
  (tu/unsupported {:columns {"x" data-type}, :measure {:agg "count", :expr "x"}}))

(deftest ^:parallel postgres-type-string-test
  (are [data-type base-type] (= [:count-where {} [:not-null {} (fld "x" base-type)]] (count-of-column-typed data-type))
    "float"                          :type/Float
    "FLOAT"                          :type/Float
    "Float"                          :type/Float
    "  float  "                      :type/Float
    "float4"                         :type/Float
    "float8"                         :type/Float
    "real"                           :type/Float
    "double precision"               :type/Float
    "DOUBLE PRECISION"               :type/Float
    "double  precision"              :type/Float
    "integer"                        :type/Integer
    "INTEGER"                        :type/Integer
    "int"                            :type/Integer
    "int2"                           :type/Integer
    "int4"                           :type/Integer
    "int8"                           :type/BigInteger
    "bigint"                         :type/BigInteger
    "smallint"                       :type/Integer
    "serial"                         :type/Integer
    "bigserial"                      :type/BigInteger
    "smallserial"                    :type/Integer
    "numeric"                        :type/Decimal
    "numeric(10,2)"                  :type/Decimal
    "numeric(10, 2)"                 :type/Decimal
    "NUMERIC(38,0)"                  :type/Decimal
    "numeric (10,2)"                 :type/Decimal
    "decimal"                        :type/Decimal
    "decimal(5)"                     :type/Decimal
    "money"                          :type/Decimal
    "boolean"                        :type/Boolean
    "bool"                           :type/Boolean
    "BOOLEAN"                        :type/Boolean
    "text"                           :type/Text
    "varchar"                        :type/Text
    "varchar(255)"                   :type/Text
    "VARCHAR(255)"                   :type/Text
    "varchar(max)"                   :type/Text
    "character varying"              :type/Text
    "character varying(255)"         :type/Text
    "char"                           :type/Text
    "char(1)"                        :type/Text
    "character(10)"                  :type/Text
    "bpchar"                         :type/Text
    "citext"                         :type/Text
    "uuid"                           :type/UUID
    "json"                           :type/JSON
    "jsonb"                          :type/JSON
    "inet"                           :type/IPAddress
    "bytea"                          :type/*
    "interval"                       :type/*
    "tsvector"                       :type/*
    "geometry"                       :type/*
    "date"                           :type/Date
    "time"                           :type/Time
    "timetz"                         :type/TimeWithLocalTZ
    "time without time zone"         :type/Time
    "time(3) without time zone"      :type/Time
    "timestamp"                      :type/DateTime
    "timestamp(3)"                   :type/DateTime
    "timestamp without time zone"    :type/DateTime
    "timestamp(6) without time zone" :type/DateTime
    "timestamp with time zone"       :type/DateTimeWithLocalTZ
    "timestamp(6) with time zone"    :type/DateTimeWithLocalTZ
    "timestamptz"                    :type/DateTimeWithLocalTZ
    "TIMESTAMP WITH TIME ZONE"       :type/DateTimeWithLocalTZ)
  (testing "arrays are arrays; Metabase does not type them further"
    (are [data-type] (= [:count-where {} [:not-null {} (fld "x" :type/*)]] (count-of-column-typed data-type))
      "integer[]" "numeric(10,2)[]"))
  (testing "types nobody knows are reported, not guessed"
    (are [data-type] (re-find #"no base type known" (count-of-column-typed-reason data-type))
      "geography" "geography(Point,4326)" "my_enum" "USER-DEFINED"))
  (testing "a blank data_type is no data_type"
    (are [data-type] (= [:count-where {} [:not-null {} (fld "x" nil)]] (count-of-column-typed data-type))
      "" "   ")))

(deftest ^:parallel base-type-override-test
  (testing "a :base-types override applies to an unknown type, whatever its case or precision suffix"
    (is (= [:count-where {} [:not-null {} (fld "x" :type/Text)]]
           (count-of-column-typed "GEOGRAPHY(POINT,4326)" :base-types {"geography" :type/Text})))
    (is (= [:count-where {} [:not-null {} (fld "x" :type/Text)]]
           (count-of-column-typed "geography" :base-types {"GEOGRAPHY" :type/Text}))))
  (testing "an override wins over the driver's own mapping"
    (is (= [:sum {} (fld "sales" :type/Decimal)]
           (tu/aggregation {:config {:base-types {"float" :type/Decimal}}, :measure {:agg "sum", :expr "sales"}})))))

(deftest ^:parallel upper-case-type-map-test
  (testing "MySQL keys its type map by upper-case names"
    (are [data-type base-type] (= [:count-where {} [:not-null {} (fld "x" base-type)]] (count-of-column-typed data-type :driver :mysql))
      "int"                 :type/Integer
      "INT"                 :type/Integer
      "integer"             :type/Integer
      "bigint"              :type/BigInteger
      "tinyint(1)"          :type/Integer
      "smallint"            :type/Integer
      "mediumint"           :type/Integer
      "decimal(10,2)"       :type/Decimal
      "double"              :type/Float
      "float"               :type/Float
      "varchar(255)"        :type/Text
      "text"                :type/Text
      "longtext"            :type/Text
      "datetime"            :type/DateTime
      "timestamp"           :type/DateTimeWithLocalTZ
      "date"                :type/Date
      "json"                :type/JSON
      "int unsigned"        :type/Integer
      "bigint(20) unsigned" :type/BigInteger
      "year"                :type/Integer
      "enum('a','b')"       :type/MySQLEnum))
  (testing "so does H2"
    (are [data-type base-type] (= [:count-where {} [:not-null {} (fld "x" base-type)]] (count-of-column-typed data-type :driver :h2))
      "INTEGER"                  :type/Integer
      "integer"                  :type/Integer
      "VARCHAR"                  :type/Text
      "DOUBLE PRECISION"         :type/Float
      "BOOLEAN"                  :type/Boolean
      "TIMESTAMP WITH TIME ZONE" :type/DateTimeWithLocalTZ
      "DECIMAL(10,2)"            :type/Decimal))
  (testing "an unknown driver fails the run instead of producing cards"
    (is (thrown? Exception (tu/convert {:config {:driver :not-a-real-driver}})))))

(deftest ^:parallel column-type-test
  (testing "the manifest's columns are documentation: a column without a type resolves without a base type"
    (testing "no declared data_type"
      (is (= [:sum {} (fld "sales" nil)] (tu/aggregation {:columns {"sales" nil}}))))
    (testing "a column the project never documented"
      (is (= [:sum {} (fld "sales" nil)] (tu/aggregation {:columns {"sales" ::tu/remove}}))))
    (testing "a model with no documented columns at all"
      (is (= [:sum {} (fld "sales" nil)] (tu/aggregation {:edit (fn [m] (assoc-in m [:nodes tu/model-id :columns] {}))}))))
    (testing "the model node is missing from the manifest"
      (is (= [:sum {} (fld "sales" nil)] (tu/aggregation {:edit (fn [m] (update m :nodes dissoc tu/model-id))}))))
    (testing "sum_boolean over a column of unknown type is trusted"
      (is (= [:count-where {} [:= {} (fld "x" nil) true]]
             (tu/aggregation {:measure {:agg "sum_boolean", :expr "x"}, :columns {"x" nil}}))))))

(def ^:private unsupported-sql #"SQL expression, not supported yet")

(defn- aggregation-of-expr
  "The aggregation a measure with `expr` converts to: a `sum` unless `agg` says otherwise, over the default columns plus
  `columns`."
  [expr & {:keys [agg columns]}]
  (tu/aggregation {:measure (cond-> {:expr expr} agg (assoc :agg agg)), :columns columns}))

(defn- expr-reason
  "The reason a measure with `expr` (a `sum` unless `agg` says otherwise) is reported."
  [expr & {:keys [agg]}]
  (tu/unsupported {:measure (cond-> {:expr expr} agg (assoc :agg agg))}))

(deftest ^:parallel expr-column-test
  (testing "nil expr means the measure name is the column"
    (is (= sum-sales (tu/aggregation {:measure {:name "sales", :expr nil}, :input-measure {:name "sales"}})))
    (testing "documented or not"
      (is (= [:sum {} (fld "revenue" nil)]
             (tu/aggregation {:measure {:name "revenue", :expr nil}, :input-measure {:name "revenue"}})))))
  (testing "spellings of a bare column name"
    (are [expr] (= sum-sales (aggregation-of-expr expr))
      "SALES" "Sales" "\"sales\"" "`sales`" "fact_sales.sales" "\"fact_sales\".\"sales\"" " sales" "sales\n"))
  (testing "an exact-case match wins over a case-insensitive one"
    (is (= [:sum {} (fld "SALES" :type/Decimal)] (aggregation-of-expr "SALES" :columns {"SALES" "numeric"}))))
  (testing "a double-quoted mixed-case identifier keeps its case"
    (is (= [:sum {} (fld "Sales" :type/Float)] (aggregation-of-expr "\"Sales\"" :columns {"Sales" "float"}))))
  (testing "column names that are not plain ASCII words"
    (are [expr data-type base-type] (= [:sum {} (fld expr base-type)] (aggregation-of-expr expr :columns {expr data-type}))
      "größe"      "numeric" :type/Decimal
      "2024_sales" "numeric" :type/Decimal
      "_sales"     "numeric" :type/Decimal
      "order"      "float"   :type/Float
      "select"     "integer" :type/Integer))
  (testing "expr naming a categorical dimension's column"
    (is (= [:distinct {} (fld "status" :type/Text)] (aggregation-of-expr "status" :agg "count_distinct"))))
  (testing "expr naming an entity rather than a column is trusted as a column"
    (is (= [:distinct {} (fld "customer" nil)] (aggregation-of-expr "customer" :agg "count_distinct"))))
  (testing "agg_time_dimension pointing at a missing dimension does not block conversion"
    (is (= sum-sales (tu/aggregation {:measure {:agg_time_dimension "nope"}})))))

(deftest ^:parallel expr-sql-test
  (testing "anything that is not a bare column or a literal is SQL, not supported yet (QRES-3)"
    (are [expr] (re-find unsupported-sql (expr-reason expr))
      "sales + 0"
      "coalesce(sales, 0)"
      "sales::numeric"
      "case when is_returned then sales else 0 end"
      "sales * quantity"
      "sales -- revenue"
      "{{ var('amount_col') }}"
      "1.0"
      ""
      "  \n"))
  (testing "an aggregate or DISTINCT inside expr"
    (are [expr] (re-find unsupported-sql (expr-reason expr :agg "count"))
      "count(*)" "distinct customer_key")))

(deftest ^:parallel expr-literal-test
  (testing "sum or count of the literal 1 is a row count"
    (are [agg] (= [:count {}] (aggregation-of-expr "1" :agg agg))
      "sum" "count"))
  (testing "count of * is a row count, but * means nothing to other aggregations"
    (is (= [:count {}] (aggregation-of-expr "*" :agg "count")))
    (is (re-find #"sum over \*" (expr-reason "*" :agg "sum"))))
  (testing "other literals have no Metabase equivalent"
    (are [agg expr reason] (re-find reason (expr-reason expr :agg agg))
      "count_distinct" "1"    #"count_distinct over the literal 1"
      "average"        "1"    #"average over the literal 1"
      "max"            "1"    #"max over the literal 1"
      "sum"            "0"    #"sum over the literal 0"
      "sum"            "2"    #"sum over the literal 2"
      "sum"            "01"   #"literal 01"
      "sum"            "true" #"literal true"
      "sum"            "NULL" #"literal NULL")))

(deftest ^:parallel count-test
  (is (= [:count-where {} [:not-null {} (fld "sales" :type/Float)]] (aggregation-of-expr "sales" :agg "count"))
      "COUNT(col) skips nulls")
  (is (= [:count-where {} [:not-null {} (fld "fact_sales_key" :type/Integer)]] (aggregation-of-expr "fact_sales_key" :agg "count")))
  (is (= [:distinct {} (fld "customer_key" :type/Text)] (aggregation-of-expr "customer_key" :agg "count_distinct"))))

(defn- percentile-of-sales
  "Tweaks for a `percentile` of `sales` with `agg-params`."
  [agg-params]
  {:measure {:agg "percentile", :expr "sales", :agg_params agg-params}})

(deftest ^:parallel percentile-test
  (testing "dbt documents the percentile as a fraction, so 1 is p100; a value above 1 is read as a percentage"
    (are [agg-params fraction] (= [:percentile {} (fld "sales" :type/Float) fraction]
                                  (tu/aggregation (percentile-of-sales agg-params)))
      {:percentile 0.95}                                  0.95
      {:percentile 0.5}                                   0.5
      {:percentile 0.99}                                  0.99
      {:percentile 0.25}                                  0.25
      {:percentile 1}                                     1.0
      {:percentile 0}                                     0.0
      {:percentile 0.0}                                   0.0
      {:percentile 95}                                    0.95
      {:percentile 95.0}                                  0.95
      {:percentile 50}                                    0.5
      {:percentile 99}                                    0.99
      {:percentile 75}                                    0.75
      {:percentile 100}                                   1.0
      {:percentile 0.9, :use_discrete_percentile false}   0.9
      {:percentile 0.9, :use_approximate_percentile true} 0.9))
  (testing "no percentile value"
    (are [agg-params] (re-find #"without a percentile value" (tu/unsupported (percentile-of-sales agg-params)))
      nil {} {:percentile nil}))
  (testing "out of range"
    (are [agg-params reason] (re-find reason (tu/unsupported (percentile-of-sales agg-params)))
      {:percentile 150}  #"percentile 150 is out of range"
      {:percentile -0.5} #"percentile -0.5 is out of range"))
  (testing "Metabase percentiles are continuous"
    (is (re-find #"discrete percentile"
                 (tu/unsupported (percentile-of-sales {:percentile 0.9, :use_discrete_percentile true})))))
  (testing "agg_params on a non-percentile aggregation are ignored"
    (is (= sum-sales (tu/aggregation {:measure {:agg "sum", :expr "sales", :agg_params {:percentile 0.9}}}))))
  (testing "median is its own aggregation, not p50"
    (is (= [:median {} (fld "sales" :type/Float)] (aggregation-of-expr "sales" :agg "median")))))

(deftest ^:parallel sum-boolean-test
  (is (re-find unsupported-sql (expr-reason "status = 'returned'" :agg "sum_boolean")))
  (is (re-find #"sum_boolean over the literal 1" (expr-reason "1" :agg "sum_boolean")))
  (testing "with fill_nulls_with"
    (is (= [:coalesce {} [:count-where {} [:= {} (fld "is_returned" :type/Boolean) true]] 0]
           (tu/aggregation {:measure {:agg "sum_boolean", :expr "is_returned"}, :input-measure {:fill_nulls_with 0}})))))

(def ^:private filter-templates
  "Filter templates that exercise the MetricFlow filter grammar. All are unsupported until QRES-3, which replaces this
  list with per-template expectations; it is kept so QRES-3 starts with a corpus."
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

(def ^:private unsupported-filter #"filters are not supported yet")

(defn- where-filters
  "A `filter` holding one where clause per `template`."
  [& templates]
  {:where_filters (mapv (fn [template] {:where_sql_template template}) templates)})

(deftest ^:parallel filter-test
  (testing "every filter is unsupported until QRES-3"
    (doseq [template filter-templates]
      (testing (pr-str template)
        (is (re-find unsupported-filter (tu/unsupported {:metric {:filter (where-filters template)}}))))))
  (testing "a filter on the input measure only"
    (is (re-find unsupported-filter
                 (tu/unsupported {:input-measure {:filter (where-filters "{{ Dimension('order__status') }} = 'Shipped'")}}))))
  (testing "filters on both the metric and its input measure"
    (is (re-find unsupported-filter
                 (tu/unsupported {:metric        {:filter (where-filters "{{ Entity('customer') }} IS NOT NULL")}
                                  :input-measure {:filter (where-filters "{{ Dimension('order__status') }} = 'Shipped'")}}))))
  (testing "two where_filters ANDed on one metric"
    (is (re-find unsupported-filter
                 (tu/unsupported {:metric {:filter (where-filters "{{ Dimension('order__status') }} = 'Shipped'"
                                                                  "{{ Dimension('order__amount') }} > 0")}}))))
  (testing "an empty where_filters list or a null filter is no filter"
    (is (= sum-sales (tu/aggregation {:metric {:filter (where-filters)}})))
    (is (= sum-sales (tu/aggregation {:metric {:filter nil}})))))

(deftest ^:parallel non-additive-test
  (testing "semi-additive measures have no Metabase equivalent"
    (are [non-additive-dimension] (re-find #"non-additive"
                                           (tu/unsupported {:measure {:non_additive_dimension non-additive-dimension}}))
      {:name "date_day", :window_choice "max"}
      {:name "date_day", :window_choice "min"}
      {:name "date_day", :window_choice "max", :window_groupings ["customer"]}
      {:name "nope", :window_choice "max"}
      ;; dbt documents min and max, but its manifest schema allows any aggregation here
      {:name "date_day", :window_choice "sum"}))
  (testing "a window_choice that is not an aggregation at all fails the whole manifest"
    (is (thrown-with-msg? ExceptionInfo #"Invalid dbt manifest"
                          (tu/convert {:measure {:non_additive_dimension {:name "date_day", :window_choice "first"}}})))))

(defn- edit-relation [k v]
  (fn [m] (assoc-in m [:semantic_models tu/sm-id :node_relation k] v)))

(deftest ^:parallel relation-test
  (testing "a relation with no database (Spark, some Databricks setups) cannot be mapped"
    (is (re-find #"no Metabase database configured" (tu/unsupported {:edit (edit-relation :database nil)}))))
  (testing "database names are matched exactly against the config"
    (is (re-find #"no Metabase database configured for warehouse database \"DBT_BI\""
                 (tu/unsupported {:edit (edit-relation :database "DBT_BI")}))))
  (testing "an upper-case schema is used verbatim"
    (is (= {:aggregation  [:sum {} (fld "PUBLIC" "fact_sales" "sales" :type/Float)]
            :source-table [tu/db "PUBLIC" "fact_sales"]}
           (tu/convert {:edit (edit-relation :schema_name "PUBLIC")}))))
  (testing "an alias that differs from the model name is the table"
    (is (= {:aggregation  [:sum {} (fld "public" "fct_sales_v2" "sales" :type/Float)]
            :source-table [tu/db "public" "fct_sales_v2"]}
           (tu/convert {:edit (fn [m]
                                (-> m
                                    ((edit-relation :alias "fct_sales_v2"))
                                    (assoc-in [:nodes tu/model-id :alias] "fct_sales_v2")))}))))
  (testing "a schema containing a dot is one name"
    (is (= {:aggregation  [:sum {} (fld "analytics.v2" "fact_sales" "sales" :type/Float)]
            :source-table [tu/db "analytics.v2" "fact_sales"]}
           (tu/convert {:edit (edit-relation :schema_name "analytics.v2")})))))
