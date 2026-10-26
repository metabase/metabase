(ns dev.dbt-import.resolve-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.schemas.resolved :as resolved]
   [dev.dbt-import.test-util :as tu :refer [fld]]
   [metabase.util.malli.registry :as mr]))

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
  "Every aggregation over every column it makes sense for: numeric aggregations over numeric columns, min and max
  over orderable ones, counts over anything, and sum_boolean over booleans only. The converter does not refuse a
  numeric aggregation over a non-numeric column (the lib schema accepts it and dbt itself would fail on it), so only
  the sum_boolean refusal is asserted here. min/max over uuid and bytea are skipped: whether they work depends on the
  warehouse version."
  (for [agg                                ["sum" "average" "median" "percentile" "min" "max" "count" "count_distinct" "sum_boolean"]
        [column data-type base-type kind] tu/pg-columns
        :when (not (and (#{"min" "max"} agg) (#{:uuid :binary} kind)))
        :let [ok? (case agg
                    ("sum" "average" "median" "percentile") (= kind :numeric)
                    ("min" "max")                           (contains? #{:numeric :text :temporal} kind)
                    ("count" "count_distinct")              true
                    "sum_boolean"                           (= kind :boolean))]
        :when (or ok? (= agg "sum_boolean"))]
    {:id      (format "%s over %s (%s)" agg column data-type)
     :measure (cond-> {:agg agg, :expr column}
                (= agg "percentile") (assoc :agg_params {:percentile 0.9}))
     :expect  (if ok?
                {:aggregation (expected-clause agg column base-type)}
                {:unsupported #"sum_boolean over the non-boolean column"})}))

(deftest ^:parallel aggregation-x-column-type-test
  (tu/check-cases aggregation-matrix-cases))

(defn- type-case
  "A `count` over a column whose declared `data_type` is `data-type`; count accepts any column, so only the base type
  is under test."
  [data-type expected]
  {:id      (str "data_type " (pr-str data-type))
   :columns {"x" data-type}
   :measure {:agg "count", :expr "x"}
   :expect  (if (keyword? expected)
              {:aggregation [:count-where {} [:not-null {} (fld "x" expected)]]}
              expected)})

(def ^:private postgres-type-cases
  (concat
   (map #(apply type-case %)
        [["float" :type/Float] ["FLOAT" :type/Float] ["Float" :type/Float] ["  float  " :type/Float]
         ["float4" :type/Float] ["float8" :type/Float] ["real" :type/Float] ["double precision" :type/Float]
         ["DOUBLE PRECISION" :type/Float] ["double  precision" :type/Float]
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
         ["time without time zone" :type/Time] ["time(3) without time zone" :type/Time]
         ["timestamp" :type/DateTime] ["timestamp(3)" :type/DateTime]
         ["timestamp without time zone" :type/DateTime] ["timestamp(6) without time zone" :type/DateTime]
         ["timestamp with time zone" :type/DateTimeWithLocalTZ] ["timestamp(6) with time zone" :type/DateTimeWithLocalTZ]
         ["timestamptz" :type/DateTimeWithLocalTZ] ["TIMESTAMP WITH TIME ZONE" :type/DateTimeWithLocalTZ]
         ;; arrays are arrays; Metabase does not type them further
         ["integer[]" :type/*] ["numeric(10,2)[]" :type/*]])
   ;; types nobody knows: reported, not guessed
   (for [data-type ["geography" "geography(Point,4326)" "my_enum" "USER-DEFINED"]]
     (type-case data-type {:unsupported #"no base type known"}))
   ;; a blank data_type is no data_type
   (for [data-type ["" "   "]]
     (type-case data-type {:aggregation [:count-where {} [:not-null {} (fld "x" nil)]]}))))

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
   {:id      "an upper-case override key still matches"
    :config  {:base-types {"GEOGRAPHY" :type/Text}}
    :columns {"x" "geography"}
    :measure {:agg "count", :expr "x"}
    :expect  {:aggregation [:count-where {} [:not-null {} (fld "x" :type/Text)]]}}])

(def ^:private mysql-type-cases
  (for [[data-type expected] [["int" :type/Integer] ["INT" :type/Integer] ["integer" :type/Integer]
                              ["bigint" :type/BigInteger] ["tinyint(1)" :type/Integer] ["smallint" :type/Integer]
                              ["mediumint" :type/Integer] ["decimal(10,2)" :type/Decimal] ["double" :type/Float]
                              ["float" :type/Float] ["varchar(255)" :type/Text] ["text" :type/Text]
                              ["longtext" :type/Text] ["datetime" :type/DateTime]
                              ["timestamp" :type/DateTimeWithLocalTZ] ["date" :type/Date] ["json" :type/JSON]
                              ["int unsigned" :type/Integer] ["bigint(20) unsigned" :type/BigInteger]
                              ["year" :type/Integer] ["enum('a','b')" :type/MySQLEnum]]]
    (assoc (type-case data-type expected)
           :id     (str "mysql data_type " (pr-str data-type))
           :config {:driver :mysql})))

(def ^:private h2-type-cases
  (for [[data-type expected] [["INTEGER" :type/Integer] ["integer" :type/Integer] ["VARCHAR" :type/Text]
                              ["DOUBLE PRECISION" :type/Float] ["BOOLEAN" :type/Boolean]
                              ["TIMESTAMP WITH TIME ZONE" :type/DateTimeWithLocalTZ] ["DECIMAL(10,2)" :type/Decimal]]]
    (assoc (type-case data-type expected)
           :id     (str "h2 data_type " (pr-str data-type))
           :config {:driver :h2})))

(deftest ^:parallel type-string-test
  (tu/check-cases postgres-type-cases)
  (tu/check-cases base-type-override-cases)
  (testing "drivers whose type maps are keyed by upper-case names"
    (tu/check-cases mysql-type-cases)
    (tu/check-cases h2-type-cases))
  (testing "an unknown driver fails the run instead of producing cards"
    (tu/check-cases [{:id      "unknown driver"
                      :config  {:driver :not-a-real-driver}
                      :measure {:agg "sum", :expr "sales"}
                      :expect  {:thrown :any}}])))

(def ^:private column-type-cases
  "The manifest's `columns` are documentation: a project may declare no `data_type`, document only some columns, or
  none at all. The converter then emits the field without a base type and the instance supplies it on import."
  [{:id "a column with no declared data_type" :columns {"sales" nil} :expect {:aggregation [:sum {} (fld "sales" nil)]}}
   {:id "a column the project never documented" :columns {"sales" ::tu/remove} :expect {:aggregation [:sum {} (fld "sales" nil)]}}
   {:id "a model with no documented columns at all"
    :edit (fn [m] (assoc-in m [:nodes tu/model-id :columns] {})) :expect {:aggregation [:sum {} (fld "sales" nil)]}}
   {:id "the model node is missing from the manifest"
    :edit (fn [m] (update m :nodes dissoc tu/model-id)) :expect {:aggregation [:sum {} (fld "sales" nil)]}}
   {:id "sum_boolean over a column of unknown type is trusted"
    :measure {:agg "sum_boolean", :expr "x"} :columns {"x" nil}
    :expect {:aggregation [:count-where {} [:= {} (fld "x" nil) true]]}}])

(deftest ^:parallel column-type-test
  (tu/check-cases column-type-cases))

(def ^:private unsupported-sql #"SQL expression, not supported yet")

(def ^:private expr-cases
  [{:id "nil expr means the measure name is the column"
    :measure {:name "sales", :expr nil} :input-measure {:name "sales"}
    :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "nil expr with a measure name that is not a documented column"
    :measure {:name "revenue", :expr nil} :input-measure {:name "revenue"}
    :expect {:aggregation [:sum {} (fld "revenue" nil)]}}
   {:id "upper-case expr matches the column case-insensitively"
    :measure {:expr "SALES"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "mixed-case expr" :measure {:expr "Sales"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "an exact-case match wins over a case-insensitive one"
    :columns {"SALES" "numeric"} :measure {:expr "SALES"}
    :expect {:aggregation [:sum {} (fld "SALES" :type/Decimal)]}}
   {:id "a double-quoted identifier is still just the column"
    :measure {:expr "\"sales\""} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "a double-quoted mixed-case identifier keeps its case"
    :columns {"Sales" "float"} :measure {:expr "\"Sales\""}
    :expect {:aggregation [:sum {} (fld "Sales" :type/Float)]}}
   {:id "a backtick-quoted identifier is still just the column"
    :measure {:expr "`sales`"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "a table-qualified column is still just the column"
    :measure {:expr "fact_sales.sales"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "a quoted, table-qualified column"
    :measure {:expr "\"fact_sales\".\"sales\""} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "leading whitespace around a column name"
    :measure {:expr " sales"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "a trailing newline, which a YAML block scalar (expr: |) always adds"
    :measure {:expr "sales\n"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}
   {:id "a non-ASCII column name"
    :columns {"größe" "numeric"} :measure {:expr "größe"}
    :expect {:aggregation [:sum {} (fld "größe" :type/Decimal)]}}
   {:id "a column name starting with a digit (legal when quoted in the warehouse)"
    :columns {"2024_sales" "numeric"} :measure {:expr "2024_sales"}
    :expect {:aggregation [:sum {} (fld "2024_sales" :type/Decimal)]}}
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
   {:id "count of * is a row count" :measure {:agg "count", :expr "*"} :expect {:aggregation [:count {}]}}
   {:id "sum of * is not a thing" :measure {:agg "sum", :expr "*"} :expect {:unsupported #"sum over \*"}}
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
   {:id "the bare word true is a literal, not a column" :measure {:expr "true"} :expect {:unsupported #"literal true"}}
   {:id "the bare word NULL is a literal, not a column" :measure {:expr "NULL"} :expect {:unsupported #"literal NULL"}}
   {:id "an empty expr" :measure {:expr ""} :expect {:unsupported :any}}
   {:id "a whitespace-only expr" :measure {:expr "  \n"} :expect {:unsupported :any}}
   {:id "expr naming a categorical dimension's column"
    :measure {:agg "count_distinct", :expr "status"} :expect {:aggregation [:distinct {} (fld "status" :type/Text)]}}
   {:id "expr naming an entity rather than a column is trusted as a column"
    :measure {:agg "count_distinct", :expr "customer"} :expect {:aggregation [:distinct {} (fld "customer" nil)]}}
   {:id "agg_time_dimension pointing at a missing dimension does not block conversion"
    :measure {:agg_time_dimension "nope"} :expect {:aggregation [:sum {} (fld "sales" :type/Float)]}}])

(deftest ^:parallel expr-test
  (tu/check-cases expr-cases))

(def ^:private count-cases
  [{:id "count of a nullable column skips nulls"
    :measure {:agg "count", :expr "sales"} :expect {:aggregation [:count-where {} [:not-null {} (fld "sales" :type/Float)]]}}
   {:id "count of the primary-key column"
    :measure {:agg "count", :expr "fact_sales_key"}
    :expect {:aggregation [:count-where {} [:not-null {} (fld "fact_sales_key" :type/Integer)]]}}
   {:id "count_distinct of a foreign key"
    :measure {:agg "count_distinct", :expr "customer_key"} :expect {:aggregation [:distinct {} (fld "customer_key" :type/Text)]}}])

(defn- percentile-case [agg-params expected]
  {:id      (str "percentile with agg_params " (pr-str agg-params))
   :measure {:agg "percentile", :expr "sales", :agg_params agg-params}
   :expect  (if (number? expected)
              {:aggregation [:percentile {} (fld "sales" :type/Float) expected]}
              expected)})

(def ^:private percentile-cases
  (concat
   (map #(apply percentile-case %)
        [[{:percentile 0.95} 0.95] [{:percentile 0.5} 0.5] [{:percentile 0.99} 0.99] [{:percentile 0.25} 0.25]
         ;; dbt documents the percentile as a fraction, so 1 is p100; a value above 1 is read as a percentage
         [{:percentile 1} 1.0] [{:percentile 0} 0.0] [{:percentile 0.0} 0.0]
         [{:percentile 95} 0.95] [{:percentile 95.0} 0.95] [{:percentile 50} 0.5] [{:percentile 99} 0.99]
         [{:percentile 75} 0.75] [{:percentile 100} 1.0]
         [{:percentile 0.9, :use_discrete_percentile false} 0.9]
         [{:percentile 0.9, :use_approximate_percentile true} 0.9]
         [nil {:unsupported #"without a percentile value"}]
         [{} {:unsupported #"without a percentile value"}]
         [{:percentile nil} {:unsupported #"without a percentile value"}]
         [{:percentile 150} {:unsupported #"percentile 150 is out of range"}]
         [{:percentile -0.5} {:unsupported #"percentile -0.5 is out of range"}]
         [{:percentile 0.9, :use_discrete_percentile true} {:unsupported #"discrete percentile"}]])
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

(def ^:private unknown-aggregation-cases
  [{:id "an aggregation dbt knows but Metabase does not is reported for that metric only"
    :measure {:agg "approx_count_distinct"} :expect {:unsupported #"aggregation approx_count_distinct has no Metabase equivalent"}}])

(deftest ^:parallel count-percentile-sum-boolean-test
  (tu/check-cases count-cases)
  (tu/check-cases percentile-cases)
  (tu/check-cases sum-boolean-cases)
  (tu/check-cases unknown-aggregation-cases))

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

(def ^:private sum-sales [:sum {} (fld "sales" :type/Float)])

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
  (tu/check-cases filter-cases))

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

(deftest ^:parallel non-additive-test
  (tu/check-cases non-additive-cases))

(defn- edit-relation [k v]
  (fn [m] (assoc-in m [:semantic_models tu/sm-id :node_relation k] v)))

(def ^:private relation-cases
  [{:id "a relation with no database (Spark, some Databricks setups) cannot be mapped"
    :edit (edit-relation :database nil) :expect {:unsupported #"no Metabase database configured"}}
   {:id "database names are matched exactly against the config"
    :edit (edit-relation :database "DBT_BI") :expect {:unsupported #"no Metabase database configured for warehouse database \"DBT_BI\""}}
   {:id "an upper-case schema is used verbatim"
    :edit (edit-relation :schema_name "PUBLIC")
    :expect {:aggregation [:sum {} (fld "PUBLIC" "fact_sales" "sales" :type/Float)], :source-table [tu/db "PUBLIC" "fact_sales"]}}
   {:id "an alias that differs from the model name is the table"
    :edit (fn [m]
            (-> m
                ((edit-relation :alias "fct_sales_v2"))
                (assoc-in [:nodes tu/model-id :alias] "fct_sales_v2")))
    :expect {:aggregation [:sum {} (fld "public" "fct_sales_v2" "sales" :type/Float)], :source-table [tu/db "public" "fct_sales_v2"]}}
   {:id "a schema containing a dot is one name"
    :edit (edit-relation :schema_name "analytics.v2")
    :expect {:aggregation [:sum {} (fld "analytics.v2" "fact_sales" "sales" :type/Float)], :source-table [tu/db "analytics.v2" "fact_sales"]}}])

(deftest ^:parallel relation-test
  (tu/check-cases relation-cases))
