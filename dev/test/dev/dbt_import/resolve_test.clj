(ns dev.dbt-import.resolve-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.metadata :as metadata]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.schemas.dbt-manifest :as dbt-manifest]
   [dev.dbt-import.schemas.resolved :as resolved]
   [dev.dbt-import.test-util :as tu :refer [fld]]
   [metabase.util.log.capture :as log.capture]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (clojure.lang ExceptionInfo)))

(deftest ^:parallel entity-id-test
  (is (mr/validate ms/NanoIdString (resolve/entity-id "x")))
  (testing "deterministic"
    (is (= (resolve/entity-id "dbt-import/metric/a")
           (resolve/entity-id "dbt-import/metric/a"))))
  (is (not= (resolve/entity-id "a") (resolve/entity-id "b")))
  (testing "no collisions across 5,000 metrics"
    (let [ids (map #(resolve/entity-id (str "dbt-import/metric/metric.p.m" %)) (range 5000))]
      (is (every? #(mr/validate ms/NanoIdString %) ids))
      (is (= 5000 (count (set ids))))))
  (testing "the same metric name in two projects gets two entity ids"
    (is (not= (resolve/entity-id "dbt-import/metric/metric.a.sales")
              (resolve/entity-id "dbt-import/metric/metric.b.sales")))))

(deftest ^:parallel resolve-manifest-test
  (let [resolved (tu/flexanalytics-resolved)]
    (is (mr/validate ::resolved/manifest resolved))
    (is (= "dbt metrics" (-> resolved :collection :name)))
    (testing (str "every metric resolves, a ratio or derived one after the metrics it refers to, except the ones the"
                  " parse stage reported, which are carried over")
      (is (= ["cumulative_sales" "customer_count" "order_count" "price" "product_count" "quantity" "row_count" "sales"
              "sales_to_target" "target"
              "cancelled_order_share" "sales_minus_target" "sales_pct_of_target" "sales_to_target_ratio_2"]
             (map (comp :name :ir) (:metrics resolved))))
      (is (= ["customer_reorder_rate" "sales_mtd" "sales_trailing_7d" "sales_vs_prior_week"]
             (map :name (:unsupported resolved)))))
    (let [stage (fn [metric-name]
                  (-> (emit/dataset-query (tu/resolved-metric-named resolved metric-name)) :stages first))]
      (testing "sales is a sum over its column, typed from the project"
        (is (= {:lib/type     :mbql.stage/mbql
                :source-table ["Sales DB" "public" "fact_sales"]
                :aggregation  [[:sum {} (fld "sales" :type/Float)]]}
               (stage "sales"))))
      (testing "customer_count counts its key column, typed as text"
        (is (= [[:distinct {} (fld "customer_key" :type/Text)]] (:aggregation (stage "customer_count")))))
      (testing "row_count, a sum of the literal 1, is a row count"
        (is (= [[:count {}]] (:aggregation (stage "row_count")))))
      (testing "sales_to_target, a SQL expr, is an average over an expression"
        (is (= [[:avg {} [:/ {} (fld "sales" :type/Float) (fld "target" :type/Float)]]]
               (:aggregation (stage "sales_to_target"))))))
    (testing "entity ids are stable across runs"
      (is (= (map :entity-id (:metrics resolved))
             (map :entity-id (:metrics (tu/flexanalytics-resolved))))))))

(deftest ^:parallel resolve-error-test
  (testing "an exception while resolving one metric is logged and reported, and the other metrics are still converted"
    ;; the parse stage reports a percentile without a value, so one in the IR is a bug, not a reported case: resolving
    ;; it fails on `(double nil)`
    (let [bad-metric (fn [manifest]
                       (assoc (get-in manifest [:metrics "metric.p.m"]) :name "bad", :unique_id "metric.p.bad"))
          ir         (-> (tu/build-manifest {:edit #(assoc-in % [:metrics "metric.p.bad"] (bad-metric %))})
                         tu/round-trip
                         dbt-manifest/decode-manifest
                         parse/parse-manifest
                         (update :metrics (fn [metrics]
                                            (mapv #(cond-> %
                                                     (= "bad" (:name %)) (assoc :agg        :percentile
                                                                                :agg-params {:percentile nil}))
                                                  metrics))))]
      (log.capture/with-log-messages-for-level [messages [dev.dbt-import.resolve :error]]
        (let [resolved (resolve/resolve-manifest tu/default-config ir)]
          (is (= ["m"] (map (comp :name :ir) (:metrics resolved))))
          (is (= ["bad"] (map :name (:unsupported resolved))))
          (is (re-find #"^error resolving metric \(java\.lang\.NullPointerException\)"
                       (-> resolved :unsupported first :reason)))
          (testing "the log carries the exception, with its stack"
            (is (= [{:level :error, :message "Error resolving metric \"bad\""}]
                   (map #(select-keys % [:level :message]) (messages))))
            (is (instance? NullPointerException (-> (messages) first :e)))))))))

(deftest ^:parallel resolve-metric-test
  (let [ir              (tu/flexanalytics-ir)
        semantic-models (:semantic-models ir)
        providers       (metadata/providers tu/default-config ir)
        sales           (tu/metric-named (:metrics ir) "sales")
        reason          (fn [config semantic-models metric]
                          (:reason (resolve/resolve-metric config (metadata/providers config ir)
                                                           semantic-models metric)))]
    (testing "a column the project does not document resolves with an unknown type; the import checks it exists"
      (is (= [[:sum {} (fld "nope" nil)]]
             (-> (resolve/resolve-metric tu/default-config providers semantic-models (assoc sales :expr "nope"))
                 emit/dataset-query :stages first :aggregation))))
    (is (re-find #"no Metabase database configured for warehouse database \"dbt_bi\""
                 (reason (assoc tu/default-config :databases {}) semantic-models sales)))
    (is (re-find #"no base type known for column \"sales\" of type \"geography\""
                 (reason tu/default-config
                         (assoc-in semantic-models ["fact_sales" :columns "sales" :data-type] "geography")
                         sales)))
    (is (re-find #"average over the literal 1"
                 (reason tu/default-config semantic-models (assoc sales :agg :average :expr "1"))))
    (is (re-find #"sum_boolean over the non-boolean column"
                 (reason tu/default-config semantic-models (assoc sales :agg :sum_boolean))))))

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
  (doseq [agg                                ["sum" "average" "median" "percentile" "min" "max" "count" "count_distinct"
                                              "sum_boolean"]
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
  [data-type & {:as config-overrides}]
  (tu/aggregation {:columns {"x" data-type}, :measure {:agg "count", :expr "x"}, :config config-overrides}))

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
    "bytea"                          :type/Binary
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
  (testing "types the driver does not map are reported, not guessed"
    (are [data-type] (re-find #"no base type known for column \"x\" of type .*: the postgres driver has no mapping"
                              (count-of-column-typed-reason data-type))
      "geography" "geography(Point,4326)" "my_enum" "USER-DEFINED"))
  (testing "a blank data_type is no data_type"
    (are [data-type] (= [:count-where {} [:not-null {} (fld "x" nil)]] (count-of-column-typed data-type))
      "" "   ")))

(deftest ^:parallel upper-case-type-map-test
  (testing "MySQL keys its type map by upper-case names"
    (are [data-type base-type] (= [:count-where {} [:not-null {} (fld "x" base-type)]]
                                  (count-of-column-typed data-type :driver :mysql))
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
    (are [data-type base-type] (= [:count-where {} [:not-null {} (fld "x" base-type)]]
                                  (count-of-column-typed data-type :driver :h2))
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
      (is (= [:sum {} (fld "sales" nil)]
             (tu/aggregation {:edit (fn [m] (assoc-in m [:nodes tu/model-id :columns] {}))}))))
    (testing "the model node is missing from the manifest"
      (is (= [:sum {} (fld "sales" nil)] (tu/aggregation {:edit (fn [m] (update m :nodes dissoc tu/model-id))}))))
    (testing "sum_boolean over a column of unknown type is trusted"
      (is (= [:count-where {} [:= {} (fld "x" nil) true]]
             (tu/aggregation {:measure {:agg "sum_boolean", :expr "x"}, :columns {"x" nil}}))))))

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
    (is (= tu/sum-sales (tu/aggregation {:measure {:name "sales", :expr nil}, :input-measure {:name "sales"}})))
    (testing "documented or not"
      (is (= [:sum {} (fld "revenue" nil)]
             (tu/aggregation {:measure {:name "revenue", :expr nil}, :input-measure {:name "revenue"}})))))
  (testing "spellings of a bare column name"
    (are [expr] (= tu/sum-sales (aggregation-of-expr expr))
      "SALES" "Sales" "\"sales\"" "`sales`" "fact_sales.sales" "\"fact_sales\".\"sales\"" " sales" "sales\n"))
  (testing "an exact-case match wins over a case-insensitive one"
    (is (= [:sum {} (fld "SALES" :type/Decimal)] (aggregation-of-expr "SALES" :columns {"SALES" "numeric"}))))
  (testing "a double-quoted mixed-case identifier keeps its case"
    (is (= [:sum {} (fld "Sales" :type/Float)] (aggregation-of-expr "\"Sales\"" :columns {"Sales" "float"}))))
  (testing "column names that are not plain ASCII words"
    (are [expr data-type base-type] (= [:sum {} (fld expr base-type)]
                                       (aggregation-of-expr expr :columns {expr data-type}))
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
    (is (= tu/sum-sales (tu/aggregation {:measure {:agg_time_dimension "nope"}})))))

(deftest ^:parallel expr-sql-test
  (let [sales       (fld "sales" :type/Float)
        quantity    (fld "quantity" :type/Integer)
        is-returned (fld "is_returned" :type/Boolean)
        status      (fld "status" :type/Text)]
    (testing "arithmetic over columns and literals"
      (are [expr clause] (= [:sum {} clause] (aggregation-of-expr expr))
        "sales + 0"              [:+ {} sales 0]
        "sales * quantity"       [:* {} sales quantity]
        "sales / quantity"       [:/ {} sales quantity]
        "(sales - quantity) * 2" [:* {} [:- {} sales quantity] 2]
        "sales * -1"             [:* {} sales -1]
        "sales * 1.5"            [:* {} sales 1.5]))
    (testing "dividing by NULLIF(x, 0) is plain division: Metabase's / already returns NULL for a zero divisor"
      (are [expr clause] (= [:sum {} clause] (aggregation-of-expr expr))
        "sales / nullif(quantity, 0)"     [:/ {} sales quantity]
        "sales / NULLIF(quantity, 0.0)"   [:/ {} sales quantity]
        "sales / nullif(quantity + 1, 0)" [:/ {} sales [:+ {} quantity 1]])
      (testing "but NULLIF anywhere else, or against another value, is the CASE it stands for (see expr-function-test)"
        (is (= [:sum {} [:/ {} sales [:case {} [[[:= {} quantity "0"] nil]] quantity]]]
               (aggregation-of-expr "sales / nullif(quantity, '0')")))
        (is (= [:sum {} [:/ {} [:case {} [[[:= {} sales 0] nil]] sales] quantity]]
               (aggregation-of-expr "nullif(sales, 0) / quantity")))))
    (testing "CASE WHEN"
      (are [expr clause] (= [:sum {} clause] (aggregation-of-expr expr))
        "case when is_returned then sales else 0 end"          [:case {} [[[:= {} is-returned true] sales]] 0]
        "case when status = 'Cancelled' then 1 else 0 end"     [:case {} [[[:= {} status "Cancelled"] 1]] 0]
        "case when status = 'a' then 1 when status = 'b' then 2 end"
        [:case {} [[[:= {} status "a"] 1] [[:= {} status "b"] 2]]]
        "CASE WHEN quantity > 1 AND NOT is_returned THEN sales END"
        [:case {} [[[:and {} [:> {} quantity 1] [:not {} [:= {} is-returned true]]] sales]]]))
    (testing "a column with a trailing comment is just the column"
      (is (= tu/sum-sales (aggregation-of-expr "sales -- revenue"))))
    (testing "sum_boolean over a condition counts the rows where it holds"
      (is (= [:count-where {} [:= {} status "returned"]]
             (aggregation-of-expr "status = 'returned'" :agg "sum_boolean"))))
    (testing "over an expression, count skips nulls and average averages"
      (is (= [:count-where {} [:not-null {} [:+ {} sales 0]]] (aggregation-of-expr "sales + 0" :agg "count")))
      (is (= [:avg {} [:/ {} sales quantity]] (aggregation-of-expr "sales / quantity" :agg "average"))))
    (testing "a simple CASE is the searched CASE with = conditions"
      (are [expr clause] (= [:sum {} clause] (aggregation-of-expr expr))
        "case status when 'shipped' then 1 else 0 end"
        [:case {} [[[:= {} status "shipped"] 1]] 0]
        "case quantity when 1 then sales when 2 then sales * 2 end"
        [:case {} [[[:= {} quantity 1] sales] [[:= {} quantity 2] [:* {} sales 2]]]]))
    (testing "SQL the converter cannot express is reported, naming the construct"
      (are [expr reason] (re-find reason (expr-reason expr))
        "greatest(sales, 0)"           #"the function greatest"
        "ln(sales)"                    #"the function ln"
        "sales::boolean"               #"a cast to BOOLEAN"
        "cast(sales as interval)"      #"a cast to INTERVAL"
        "{{ var('amount_col') }}"      #"could not parse"
        "1.0"                          #"sum over the literal 1.0"
        ""                             #"could not parse"
        "  \n"                         #"could not parse"))
    (testing "an aggregate or DISTINCT inside expr"
      (are [expr reason] (re-find reason (expr-reason expr :agg "count"))
        "count(*)"              #"the function count"
        "distinct customer_key" #"could not parse"))))

(deftest ^:parallel expr-function-test
  (let [sales      (fld "sales" :type/Float)
        quantity   (fld "quantity" :type/Integer)
        status     (fld "status" :type/Text)
        code       (fld "code" :type/Text)
        created-at (fld "created_at" :type/DateTime)]
    (testing "functions with a Metabase expression function of the same meaning"
      (are [expr clause] (= [:sum {} clause] (aggregation-of-expr expr))
        "coalesce(sales, 0) * quantity"      [:* {} [:coalesce {} sales 0] quantity]
        "coalesce(sales, quantity, 0)"       [:coalesce {} sales quantity 0]
        "coalesce(sales)"                    sales
        "abs(sales)"                         [:abs {} sales]
        "floor(sales)"                       [:floor {} sales]
        "ceil(sales)"                        [:ceil {} sales]
        "ceiling(sales)"                     [:ceil {} sales]
        "sqrt(sales)"                        [:sqrt {} sales]
        "exp(sales)"                         [:exp {} sales]
        "power(sales, 2)"                    [:power {} sales 2]
        "sales ^ 2"                          [:power {} sales 2]
        "round(sales)"                       [:round {} sales]
        "round(sales, 0)"                    [:round {} sales]
        "length(status)"                     [:length {} status]
        "char_length(status)"                [:length {} status]
        "extract(year from created_at)"      [:get-year {} created-at]
        "extract(quarter from created_at)"   [:get-quarter {} created-at]
        "date_part('month', created_at)"     [:get-month {} created-at]
        "extract(day from created_at)"       [:get-day {} created-at]
        "extract(hour from created_at)"      [:get-hour {} created-at]
        "extract(minute from created_at)"    [:get-minute {} created-at]
        "extract(second from created_at)"    [:get-second {} created-at]))
    (testing "log is base 10 in both SQL and Metabase; ln is not log"
      (is (= [:sum {} [:log {} sales]] (aggregation-of-expr "log(sales)")))
      (is (= [:sum {} [:log {} sales]] (aggregation-of-expr "log(10, sales)")))
      (is (re-find #"log to a base other than 10" (expr-reason "log(2, sales)")))
      (is (re-find #"the function ln" (expr-reason "ln(sales)"))))
    (testing "round to n decimals is round(x * 10^n) / 10^n"
      (is (= [:sum {} [:/ {} [:round {} [:* {} sales 100]] 100]] (aggregation-of-expr "round(sales, 2)")))
      (are [expr] (re-find #"round to .* decimals is not supported" (expr-reason expr))
        "round(sales, -1)"
        "round(sales, quantity)"))
    (testing "NULLIF anywhere but as a zero divisor is CASE WHEN x = y THEN NULL ELSE x END"
      (is (= [:sum {} [:case {} [[[:= {} sales 0] nil]] sales]] (aggregation-of-expr "nullif(sales, 0)")))
      (is (= [:sum {} [:/ {} sales [:case {} [[[:= {} quantity 1] nil]] quantity]]]
             (aggregation-of-expr "sales / nullif(quantity, 1)"))))
    (testing "string functions, counted distinct"
      (are [expr clause] (= [:distinct {} clause] (aggregation-of-expr expr :agg "count_distinct"))
        "lower(status)"                     [:lower {} status]
        "upper(status)"                     [:upper {} status]
        "trim(status)"                      [:trim {} status]
        "trim(both ' ' from status)"        [:trim {} status]
        "ltrim(status)"                     [:ltrim {} status]
        "rtrim(status)"                     [:rtrim {} status]
        "replace(status, 'a', 'b')"         [:replace {} status "a" "b"]
        "substring(status, 2, 3)"           [:substring {} status 2 3]
        "substring(status from 2 for 3)"    [:substring {} status 2 3]
        "substr(status, 2)"                 [:substring {} status 2]
        "concat(status, '-', code)"         [:concat {} status "-" code]
        "status || '-' || code"             [:concat {} status "-" code]
        "upper(trim(status))"               [:upper {} [:trim {} status]])
      (is (re-find #"TRIM of characters other than spaces"
                   (expr-reason "trim('x' from status)" :agg "count_distinct"))))
    (testing "date_trunc over a column is the column bucketed by that unit"
      (are [expr unit] (= [:distinct {} (assoc-in created-at [1 :temporal-unit] unit)]
                          (aggregation-of-expr expr :agg "count_distinct"))
        "date_trunc('minute', created_at)"  :minute
        "date_trunc('hour', created_at)"    :hour
        "date_trunc('day', created_at)"     :day
        "date_trunc('week', created_at)"    :week
        "date_trunc('month', created_at)"   :month
        "date_trunc('quarter', created_at)" :quarter
        "date_trunc('year', created_at)"    :year)
      (testing (str "but there is nothing to bucket when the argument is an expression, and no bucket for a unit"
                    " Metabase lacks")
        (is (re-find #"date_trunc over an expression"
                     (expr-reason "date_trunc('month', created_at + 1)" :agg "count_distinct")))
        (is (re-find #"truncating a date to DECADE"
                     (expr-reason "date_trunc('decade', created_at)" :agg "count_distinct")))))
    (testing "the current time and date"
      (is (= [:sum {} [:case {} [[[:< {} created-at [:now {}]] sales]]]]
             (aggregation-of-expr "case when created_at < now() then sales end")))
      (is (= [:sum {} [:case {} [[[:< {} created-at [:today {}]] sales]]]]
             (aggregation-of-expr "case when created_at < current_date then sales end"))))
    (testing "date parts Metabase has no function for"
      (is (re-find #"extracting DOW" (expr-reason "extract(dow from created_at)"))))))

(deftest ^:parallel expr-cast-test
  (let [sales   (fld "sales" :type/Float)
        amount  (fld "amount" :type/Decimal)
        status  (fld "status" :type/Text)
        date    (fld "date_day" :type/Date)
        created (fld "created_at" :type/DateTime)]
    (testing "casts to the types Metabase has a conversion for, in either spelling"
      (are [expr clause] (= [:sum {} clause] (aggregation-of-expr expr))
        "cast(amount as decimal) / 100"     [:/ {} [:float {} amount] 100]
        "cast(amount as numeric(10, 2))"    [:float {} amount]
        "amount::float"                     [:float {} amount]
        "cast(amount as double precision)"  [:float {} amount]
        "cast(sales as int)"                [:integer {} sales]
        "cast(sales as integer)"            [:integer {} sales]
        "sales::bigint"                     [:integer {} sales]
        "cast(sales as smallint)"           [:integer {} sales]
        "cast(status as integer)"           [:integer {} status]))
    (are [expr clause] (= [:distinct {} clause] (aggregation-of-expr expr :agg "count_distinct"))
      "cast(sales as text)"            [:text {} sales]
      "sales::varchar"                 [:text {} sales]
      "cast(sales as varchar(10))"     [:text {} sales]
      "cast(sales as char(3))"         [:text {} sales]
      "cast(created_at as date)"       [:date {} created]
      "cast(status as date)"           [:date {} status]
      "cast(status as timestamp)"      [:datetime {} status]
      "cast(date_day as timestamp)"    [:datetime {} date]
      "status::timestamptz"            [:datetime {} status])
    (testing "a cast to a type Metabase cannot convert to"
      (are [expr reason] (re-find reason (expr-reason expr))
        "cast(status as boolean)" #"a cast to BOOLEAN"
        "cast(status as uuid)"    #"a cast to UUID"
        "cast(status as json)"    #"a cast to JSON"))))

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
      "sum"            "NULL" #"literal NULL"))
  (testing "a comparison against NULL inside an expression is never true in SQL, so it is reported, not made IS NULL"
    (is (re-find #"sales = NULL \(EQ\) compares against NULL"
                 (expr-reason "CASE WHEN sales = NULL THEN 1 ELSE 0 END")))))

(deftest ^:parallel integer-division-test
  (let [quantity (fld "quantity" :type/Integer)
        sales    (fld "sales" :type/Float)]
    (testing (str "on a warehouse that truncates an integer quotient (Postgres), an integer divided by an integer is"
                  " reported: Metabase divides as floats, so the number would differ")
      (are [expr] (re-find #"divides an integer by an integer, which the warehouse truncates" (expr-reason expr))
        "quantity / 2"
        "quantity / small_qty"
        "big_amount / 100"
        "(quantity + 1) / 2"
        "quantity / nullif(small_qty, 0)"
        "100 / quantity"
        "sales + quantity / 2")
      (testing "naming the division"
        (is (re-find #"^expr \"quantity / 2\": quantity / 2 divides an integer by an integer"
                     (expr-reason "quantity / 2")))))
    (testing "a float or decimal on either side divides the same way everywhere"
      (are [expr clause] (= [:sum {} clause] (aggregation-of-expr expr))
        "quantity / 2.0"              [:/ {} quantity 2.0]
        "sales / quantity"            [:/ {} sales quantity]
        "quantity / sales"            [:/ {} quantity sales]
        "amount / 100"                [:/ {} (fld "amount" :type/Decimal) 100]
        "cast(quantity as float) / 2" [:/ {} [:float {} quantity] 2]
        "quantity * 1.0 / 2"          [:/ {} [:* {} quantity 1.0] 2]))
    (testing "a column the project does not type is not known to be an integer"
      (is (= [:sum {} [:/ {} (fld "x" nil) 2]] (aggregation-of-expr "x / 2" :columns {"x" nil}))))
    (testing "a warehouse that divides integers as decimals (MySQL, Snowflake, BigQuery, Oracle) is left alone"
      (is (= [:sum {} [:/ {} quantity 2]]
             (tu/aggregation {:config {:driver :mysql}, :measure {:expr "quantity / 2"}}))))
    (testing "in a filter too"
      (let [template "{{ Dimension('fact_sales_key__amount') }} > {{ Entity('fact_sales_key') }} / 2"]
        (is (re-find #"divides an integer by an integer"
                     (tu/unsupported {:metric {:filter (tu/where-filters template)}})))))))

(deftest ^:parallel count-test
  (is (= [:count-where {} [:not-null {} (fld "sales" :type/Float)]] (aggregation-of-expr "sales" :agg "count"))
      "COUNT(col) skips nulls")
  (is (= [:count-where {} [:not-null {} (fld "fact_sales_key" :type/Integer)]]
         (aggregation-of-expr "fact_sales_key" :agg "count")))
  (is (= [:distinct {} (fld "customer_key" :type/Text)] (aggregation-of-expr "customer_key" :agg "count_distinct"))))

(defn- percentile-of-sales
  "Tweaks for a `percentile` of `sales` with `agg-params`."
  [agg-params]
  {:measure {:agg "percentile", :expr "sales", :agg_params agg-params}})

(deftest ^:parallel percentile-test
  (testing "dbt takes the percentile as a fraction between 0 and 1, so 1 is p100; Lib takes the same"
    (are [agg-params fraction] (= [:percentile {} (fld "sales" :type/Float) fraction]
                                  (tu/aggregation (percentile-of-sales agg-params)))
      {:percentile 0.95}                                  0.95
      {:percentile 0.5}                                   0.5
      {:percentile 0.99}                                  0.99
      {:percentile 0.25}                                  0.25
      {:percentile 1}                                     1.0
      {:percentile 1.0}                                   1.0
      {:percentile 0}                                     0.0
      {:percentile 0.0}                                   0.0
      {:percentile 0.9, :use_discrete_percentile false}   0.9
      {:percentile 0.9, :use_approximate_percentile true} 0.9))
  (testing "no percentile value"
    (are [agg-params] (re-find #"without a percentile value" (tu/unsupported (percentile-of-sales agg-params)))
      nil {} {:percentile nil}))
  (testing "out of range: a value above 1 is not read as a percentage, since 1.5 could not be one and 95 would have to"
    (are [agg-params reason] (re-find reason (tu/unsupported (percentile-of-sales agg-params)))
      {:percentile 1.01} #"percentile 1.01 is out of range: dbt takes a fraction between 0 and 1"
      {:percentile 1.5}  #"percentile 1.5 is out of range"
      {:percentile 95}   #"percentile 95 is out of range"
      {:percentile 95.0} #"percentile 95.0 is out of range"
      {:percentile 100}  #"percentile 100 is out of range"
      {:percentile 150}  #"percentile 150 is out of range"
      {:percentile -0.5} #"percentile -0.5 is out of range"))
  (testing "Metabase percentiles are continuous"
    (is (re-find #"discrete percentile"
                 (tu/unsupported (percentile-of-sales {:percentile 0.9, :use_discrete_percentile true})))))
  (testing "agg_params on a non-percentile aggregation are ignored"
    (is (= tu/sum-sales (tu/aggregation {:measure {:agg "sum", :expr "sales", :agg_params {:percentile 0.9}}}))))
  (testing "median is its own aggregation, not p50"
    (is (= [:median {} (fld "sales" :type/Float)] (aggregation-of-expr "sales" :agg "median")))))

(deftest ^:parallel sum-boolean-test
  (is (= [:count-where {} [:= {} (fld "status" :type/Text) "returned"]]
         (aggregation-of-expr "status = 'returned'" :agg "sum_boolean")))
  (is (re-find #"sum_boolean over the literal 1" (expr-reason "1" :agg "sum_boolean")))
  (testing "with fill_nulls_with"
    (is (= [:coalesce {} [:count-where {} [:= {} (fld "is_returned" :type/Boolean) true]] 0]
           (tu/aggregation {:measure       {:agg "sum_boolean", :expr "is_returned"}
                            :input-measure {:fill_nulls_with 0}})))))

(defn- filter-of
  "The one MBQL filter clause a metric filter `template` converts to; the `{:unsupported reason}` map when it does not."
  [template]
  (let [filters (tu/filters {:metric {:filter (tu/where-filters template)}})]
    (if (vector? filters)
      (first filters)
      filters)))

(defn- filter-reason
  "The reason a metric filter `template` is reported."
  [template]
  (tu/unsupported {:metric {:filter (tu/where-filters template)}}))

(defn- at
  "`column` bucketed by temporal `unit`."
  [column base-type unit]
  (assoc-in (fld column base-type) [1 :temporal-unit] unit))

(def ^:private status (fld "status" :type/Text))
(def ^:private amount (fld "amount" :type/Decimal))
(def ^:private is-returned (fld "is_returned" :type/Boolean))
(def ^:private customer-key (fld "customer_key" :type/Text))

(deftest ^:parallel filter-comparison-test
  (testing "a dimension reached through the model's own primary entity is one of its columns"
    (are [template clause] (= clause (filter-of template))
      "{{ Dimension('fact_sales_key__status') }} = 'Shipped'"                 [:= {} status "Shipped"]
      "{{ Dimension('fact_sales_key__status') }} != 'Cancelled'"              [:!= {} status "Cancelled"]
      "{{ Dimension('fact_sales_key__status') }} <> 'Cancelled'"              [:!= {} status "Cancelled"]
      "{{ Dimension('fact_sales_key__status') }} IN ('Shipped', 'Delivered')" [:in {} status "Shipped" "Delivered"]
      "{{ Dimension('fact_sales_key__status') }} NOT IN ('Cancelled')"        [:not-in {} status "Cancelled"]
      "{{ Dimension('fact_sales_key__status') }} IS NULL"                     [:is-null {} status]
      "{{ Dimension('fact_sales_key__status') }} IS NOT NULL"                 [:not-null {} status]
      "{{ Dimension('fact_sales_key__amount') }} > 100"                       [:> {} amount 100]
      "{{ Dimension('fact_sales_key__amount') }} >= 0.5"                      [:>= {} amount 0.5]
      "{{ Dimension('fact_sales_key__amount') }} < 100"                       [:< {} amount 100]
      "{{ Dimension('fact_sales_key__amount') }} <= 100"                      [:<= {} amount 100]
      "{{ Dimension('fact_sales_key__amount') }} = -1"                        [:= {} amount -1]
      "{{ Dimension('fact_sales_key__amount') }} BETWEEN 10 AND 100"          [:between {} amount 10 100]
      "{{ Dimension('fact_sales_key__amount') }} NOT BETWEEN 10 AND 100"      [:not {} [:between {} amount 10 100]]))
  (testing "string literals"
    (are [template clause] (= clause (filter-of template))
      "{{ Dimension('fact_sales_key__status') }} = 'O''Reilly'"       [:= {} status "O'Reilly"]
      "{{ Dimension('fact_sales_key__status') }} = '😀'"              [:= {} status "😀"]
      "{{ Dimension('fact_sales_key__status') }} = ''"                [:= {} status ""]
      "{{ Dimension('fact_sales_key__status') }} = '{{ not jinja }}'" [:= {} status "{{ not jinja }}"]))
  (testing "LIKE with a simple pattern"
    (are [template clause] (= clause (filter-of template))
      "{{ Dimension('fact_sales_key__status') }} LIKE '%Inc%'"     [:contains {} status "Inc"]
      "{{ Dimension('fact_sales_key__status') }} LIKE 'acme%'"     [:starts-with {} status "acme"]
      "{{ Dimension('fact_sales_key__status') }} LIKE '%acme'"     [:ends-with {} status "acme"]
      "{{ Dimension('fact_sales_key__status') }} LIKE 'acme'"      [:= {} status "acme"]
      "{{ Dimension('fact_sales_key__status') }} ILIKE 'acme%'"    [:starts-with {:case-sensitive false} status "acme"]
      "{{ Dimension('fact_sales_key__status') }} NOT LIKE '%Inc%'" [:not {} [:contains {} status "Inc"]])))

(deftest ^:parallel filter-boolean-logic-test
  (are [template clause] (= clause (filter-of template))
    "{{ Dimension('fact_sales_key__is_returned') }}"          [:= {} is-returned true]
    "{{ Dimension('fact_sales_key__is_returned') }} = true"   [:= {} is-returned true]
    "{{ Dimension('fact_sales_key__is_returned') }} = false"  [:= {} is-returned false]
    "NOT {{ Dimension('fact_sales_key__is_returned') }}"      [:not {} [:= {} is-returned true]]
    "{{ Dimension('fact_sales_key__status') }} = 'Shipped' OR {{ Dimension('fact_sales_key__status') }} = 'Delivered'"
    [:or {} [:= {} status "Shipped"] [:= {} status "Delivered"]]
    (str "({{ Dimension('fact_sales_key__status') }} = 'Shipped' AND {{ Dimension('fact_sales_key__amount') }} > 0)"
         " OR {{ Entity('customer') }} IS NULL")
    [:or {} [:and {} [:= {} status "Shipped"] [:> {} amount 0]] [:is-null {} customer-key]]
    ;; a chain of the same operator is one clause
    (str "{{ Dimension('fact_sales_key__status') }} = 'a' AND {{ Dimension('fact_sales_key__status') }} = 'b'"
         " AND {{ Dimension('fact_sales_key__amount') }} > 0")
    [:and {} [:= {} status "a"] [:= {} status "b"] [:> {} amount 0]]))

(deftest ^:parallel bare-column-condition-test
  (testing "a bare reference in a boolean position has to be a boolean column; the warehouse would reject anything else"
    (are [template] (re-find #"is not a boolean column, so it cannot stand alone as a condition"
                             (filter-reason template))
      "{{ Dimension('fact_sales_key__status') }}"
      "{{ Dimension('fact_sales_key__amount') }} AND {{ Dimension('fact_sales_key__is_returned') }}"
      "NOT {{ Entity('customer') }}"
      ;; a SQL dimension that is 1 or 0 is an integer, not a boolean
      "{{ Dimension('fact_sales_key__is_big_sale') }}"
      "{{ Dimension('order__order_status_dim') }}"))
  (testing "a column the project does not type is trusted to be one"
    (is (= [[:= {} (fld "flag" nil) true]]
           (tu/filters {:columns {"flag" nil}
                        :edit    (tu/edit-semantic-model
                                  #(update % :dimensions conj (tu/dimension "flag" "categorical")))
                        :metric  {:filter (tu/where-filters "{{ Dimension('fact_sales_key__flag') }}")}}))))
  (testing "the same check applies to a CASE condition in an expr"
    (is (re-find #"status is not a boolean column" (expr-reason "case when status then sales else 0 end")))
    (is (= [:sum {} [:case {} [[[:= {} is-returned true] (fld "sales" :type/Float)]] 0]]
           (aggregation-of-expr "case when is_returned then sales else 0 end")))))

(deftest ^:parallel filter-time-dimension-test
  (testing "TimeDimension buckets the column by the granularity; metric_time is the measure's agg_time_dimension"
    (are [template clause] (= clause (filter-of template))
      "{{ TimeDimension('metric_time', 'day') }} >= '2024-01-01'"
      [:>= {} (at "date_day" :type/Date :day) "2024-01-01"]
      "{{ TimeDimension('metric_time', 'day') }} BETWEEN '2024-01-01' AND '2024-12-31'"
      [:between {} (at "date_day" :type/Date :day) "2024-01-01" "2024-12-31"]
      "{{ TimeDimension('fact_sales_key__created_at', 'month') }} = '2024-03-01'"
      [:= {} (at "created_at" :type/DateTime :month) "2024-03-01"]
      "{{ TimeDimension('fact_sales_key__created_at', 'year') }} = '2024-01-01'"
      [:= {} (at "created_at" :type/DateTime :year) "2024-01-01"]
      ;; a grain finer than a day needs a column with a time of day: a timestamp has one, a date (below) does not
      "{{ TimeDimension('fact_sales_key__created_at', 'hour') }} >= '2024-01-01 09:00:00'"
      [:>= {} (at "created_at" :type/DateTime :hour) "2024-01-01 09:00:00"]
      "{{ TimeDimension('fact_sales_key__created_at', 'minute') }} >= '2024-01-01 09:30:00'"
      [:>= {} (at "created_at" :type/DateTime :minute) "2024-01-01 09:30:00"]
      ;; without a granularity, the dimension's own
      "{{ TimeDimension('metric_time') }} >= '2024-01-01'"
      [:>= {} (at "date_day" :type/Date :day) "2024-01-01"]
      ;; Dimension on a time dimension does not bucket
      "{{ Dimension('fact_sales_key__date_day') }} >= '2024-01-01'"
      [:>= {} (fld "date_day" :type/Date) "2024-01-01"]
      ;; a fiscal quarter is read as a calendar quarter until custom calendars are supported
      "{{ TimeDimension('metric_time', 'fiscal_quarter') }} = '2024-Q1'"
      [:= {} (at "date_day" :type/Date :quarter) "2024-Q1"]))
  (testing "metric_time follows the measure's agg_time_dimension"
    (is (= [[:>= {} (at "created_at" :type/DateTime :day) "2024-01-01"]]
           (tu/filters {:measure {:agg_time_dimension "created_at"}
                        :metric  {:filter (tu/where-filters
                                           "{{ TimeDimension('metric_time', 'day') }} >= '2024-01-01'")}})))
    (is (re-find #"metric_time: the measure has no agg_time_dimension"
                 (tu/unsupported {:edit   (fn [m] (assoc-in m [:semantic_models tu/sm-id :defaults] nil))
                                  :metric {:filter (tu/where-filters
                                                    "{{ TimeDimension('metric_time', 'day') }} >= '2024-01-01'")}}))))
  (testing "what cannot be bucketed"
    (are [template reason] (re-find reason (filter-reason template))
      "{{ TimeDimension('metric_time', 'nanosecond') }} = '2024-01-01'"
      #"granularity \"nanosecond\" has no Metabase temporal unit"

      "{{ TimeDimension('metric_time', 'hour') }} = '2024-01-01'"
      #"granularity \"hour\" has no Metabase temporal unit"

      "{{ TimeDimension('fact_sales_key__status', 'day') }} = '2024-01-01'"
      #"\"status\" is not a time dimension"

      "{{ TimeDimension('fact_sales_key__next_day', 'day') }} = '2024-01-01'"
      #"cannot bucket the SQL expression \"date_day \+ 1\""

      "{{ TimeDimension('metric_time', 'week') }} < random()"
      #"the function rand")))

(def ^:private order-date-by-month
  "`dim_order.order_date`, reached from `fact_sales` through the `order` entity's column, bucketed by month."
  (assoc-in (tu/joined-fld "order_key" "dim_order" "order_date" :type/Date) [1 :temporal-unit] :month))

(deftest ^:parallel grain-method-test
  (testing ".grain('<granularity>') chained onto a Dimension means what TimeDimension's second argument does"
    (are [template clause] (= clause (filter-of template))
      "{{ Dimension('metric_time').grain('month') }} >= '2024-01-01'"
      [:>= {} (at "date_day" :type/Date :month) "2024-01-01"]
      "{{ Dimension('fact_sales_key__created_at').grain(\"year\") }} = '2024-01-01'"
      [:= {} (at "created_at" :type/DateTime :year) "2024-01-01"]
      "{{ Dimension('fact_sales_key__created_at') . grain( 'day' ) }} = '2024-01-01'"
      [:= {} (at "created_at" :type/DateTime :day) "2024-01-01"]
      "{{ TimeDimension('metric_time').grain('month') }} >= '2024-01-01'"
      [:>= {} (at "date_day" :type/Date :month) "2024-01-01"]
      ;; chained onto the positional grain, the method wins
      "{{ TimeDimension('metric_time', 'day').grain('month') }} >= '2024-01-01'"
      [:>= {} (at "date_day" :type/Date :month) "2024-01-01"]
      ;; through a foreign entity too
      "{{ Dimension('order__order_date').grain('month') }} = '2024-03-01'"
      [:= {} order-date-by-month "2024-03-01"]))
  (testing "the grain is checked as a TimeDimension's is"
    (are [template reason] (re-find reason (filter-reason template))
      "{{ Dimension('fact_sales_key__status').grain('month') }} = 'x'"
      #"\"status\" is not a time dimension"

      "{{ Dimension('metric_time').grain('hour') }} = '2024-01-01'"
      #"granularity \"hour\" has no Metabase temporal unit"

      "{{ Entity('customer').grain('month') }} IS NOT NULL"
      #"Entity\(\"customer\"\) has the grain \"month\", but an entity is a key"))
  (testing "any other method chained onto a reference is reported, naming it"
    (are [template reason] (re-find reason (filter-reason template))
      "{{ Dimension('metric_time').date_part('month') }} = 3"
      #"\"metric_time\" has the method call \.date_part\('month'\), which is not supported: only \.grain"
      "{{ Dimension('metric_time').grain('month').date_part('year') }} = 2024"
      #"has the method call \.date_part\('year'\)"
      "{{ Dimension('fact_sales_key__status').descending(True) }} = 'x'"
      #"has the method call \.descending\(True\)"
      "{{ Entity('customer').date_part('year') }} IS NOT NULL"
      #"has the method call \.date_part\('year'\)")))

(defn- untyped-time-filter
  "The filter clauses for `template` when `fact_sales` documents neither `date_day` nor a type for `created_at`."
  [template]
  (tu/filters {:columns {"date_day" ::tu/remove, "created_at" nil}
               :metric  {:filter (tu/where-filters template)}}))

(deftest ^:parallel untyped-time-dimension-test
  (testing (str "a TimeDimension over a column the project does not type is bucketed as written: dbt says it is a time"
                " dimension, and the instance checks the column when the import binds it")
    (are [template clause] (= [clause] (untyped-time-filter template))
      "{{ TimeDimension('metric_time', 'month') }} >= '2024-01-01'"
      [:>= {} (at "date_day" nil :month) "2024-01-01"]
      "{{ TimeDimension('metric_time') }} >= '2024-01-01'"
      [:>= {} (at "date_day" nil :day) "2024-01-01"]
      "{{ TimeDimension('fact_sales_key__created_at', 'hour') }} >= '2024-01-01 09:00:00'"
      [:>= {} (at "created_at" nil :hour) "2024-01-01 09:00:00"]
      "{{ Dimension('fact_sales_key__created_at').grain('week') }} >= '2024-01-01'"
      [:>= {} (at "created_at" nil :week) "2024-01-01"]
      ;; Dimension on it still does not bucket
      "{{ Dimension('metric_time') }} >= '2024-01-01'"
      [:>= {} (fld "date_day" nil) "2024-01-01"]))
  (testing "a grain Metabase has no unit for is still reported"
    (let [template "{{ TimeDimension('metric_time', 'nanosecond') }} = '2024-01-01'"]
      (is (re-find #"granularity \"nanosecond\" has no Metabase temporal unit"
                   (tu/unsupported {:columns {"date_day" ::tu/remove}
                                    :metric  {:filter (tu/where-filters template)}})))))
  (testing "a column of known type still takes only the units Lib allows it"
    (is (re-find #"granularity \"hour\" has no Metabase temporal unit for \"date_day\""
                 (filter-reason "{{ TimeDimension('metric_time', 'hour') }} = '2024-01-01'")))))

(deftest ^:parallel week-grain-warning-test
  (testing (str "a week grain is read as a Metabase week, with a warning: dbt weeks start on Monday, Metabase's on the"
                " instance's start-of-week setting")
    (log.capture/with-log-messages-for-level [messages [dev.dbt-import.resolve :warn]]
      (is (= [:>= {} (at "date_day" :type/Date :week) "2024-01-01"]
             (filter-of "{{ TimeDimension('metric_time', 'week') }} >= '2024-01-01'")))
      (is (= [:warn] (map :level (messages))))
      (is (re-find #"week granularity of date_day is read as a Metabase week.*dbt weeks start on Monday"
                   (:message (first (messages))))))))

(deftest ^:parallel virtual-primary-entity-test
  (testing (str "a semantic model with no entity of type primary names one in primary_entity; the model's own"
                " dimensions are reached through that name")
    (let [virtual (tu/edit-semantic-model #(-> %
                                               (assoc :primary_entity "sale")
                                               (update :entities (partial remove (comp #{"fact_sales_key"} :name)))
                                               (update :entities vec)))]
      (is (= [[:= {} status "Shipped"]]
             (tu/filters {:edit   virtual
                          :metric {:filter (tu/where-filters "{{ Dimension('sale__status') }} = 'Shipped'")}})))
      (is (= [[:>= {} (at "date_day" :type/Date :month) "2024-01-01"]]
             (tu/filters {:edit   virtual
                          :metric {:filter (tu/where-filters
                                            "{{ TimeDimension('sale__date_day', 'month') }} >= '2024-01-01'")}})))
      (testing "the old primary entity's name is no longer a prefix"
        (is (re-find #"entity \"fact_sales_key\" is not on semantic model \"fact_sales\""
                     (tu/unsupported {:edit   virtual
                                      :metric {:filter (tu/where-filters
                                                        "{{ Dimension('fact_sales_key__status') }} = 'Shipped'")}}))))
      (testing "the curated dimensions are the same as with a declared primary entity"
        (is (= (tu/dimension-set {}) (tu/dimension-set {:edit virtual})))))))

(deftest ^:parallel filter-entity-test
  (are [template clause] (= clause (filter-of template))
    "{{ Entity('customer') }} IS NOT NULL"        [:not-null {} customer-key]
    "{{ Entity('customer') }} = 42"               [:= {} customer-key 42]
    "{{ Entity('fact_sales_key') }} IS NOT NULL"  [:not-null {} (fld "fact_sales_key" :type/Integer)])
  (is (re-find #"entity \"nope\" is not on semantic model \"fact_sales\""
               (filter-reason "{{ Entity('nope') }} IS NULL"))))

(deftest ^:parallel filter-dimension-with-sql-expr-test
  (testing "a dimension whose expr is SQL is converted inline"
    (is (= [:= {} [:case {} [[[:> {} (fld "sales" :type/Float) 100] 1]] 0] 1]
           (filter-of "{{ Dimension('fact_sales_key__is_big_sale') }} = 1")))))

(def ^:private order-status
  "`dim_order.status`, reached from `fact_sales` through the `order` entity's column."
  (tu/joined-fld "order_key" "dim_order" "status" :type/Text))

(deftest ^:parallel filter-cross-model-test
  (testing (str "a dimension reached through a foreign entity is on the semantic model that entity is primary for,"
                " joined implicitly through the entity's column")
    (are [template clause] (= clause (filter-of template))
      "{{ Dimension('order__order_status_dim') }} = 'Shipped'"
      [:= {} order-status "Shipped"]
      "{{ Dimension('product__product_category_dim') }} IN ('Planes', 'Trains')"
      [:in {} (tu/joined-fld "product_key" "dim_product" "product_category" :type/Text) "Planes" "Trains"]
      "{{ TimeDimension('order__order_date', 'month') }} = '2024-03-01'"
      [:= {} order-date-by-month "2024-03-01"]
      ;; a SQL dimension on the joined model is converted inline, its columns reached the same way
      "{{ Dimension('order__is_cancelled_order') }} = 1"
      [:= {} [:case {} [[[:= {} order-status "Cancelled"] 1]] 0] 1]))
  (testing "references no join can satisfy"
    (are [template reason] (re-find reason (filter-reason template))
      "{{ Dimension('customer__name') }} LIKE '%Inc%'"      #"no semantic model has entity \"customer\""
      "{{ Dimension('customer__region__country') }} = 'US'" #"more than one entity"
      "{{ Dimension('order__nope') }} = 'Shipped'"          #"dimension \"nope\" is not on semantic model \"dim_order\""
      "{{ Dimension('nope__status') }} = 'Shipped'"         #"entity \"nope\" is not on semantic model \"fact_sales\""
      "{{ Dimension('fact_sales_key__nope') }} = 'Shipped'" #"dimension \"nope\" is not on semantic model \"fact_sales"
      "{{ Dimension('nope') }} = 'Shipped'"                 #"dimension \"nope\" is not on semantic model"))
  (testing "a filter on another metric is a HAVING, which a metric has no place for"
    (are [template] (re-find #"a condition on another metric's value is a HAVING" (filter-reason template))
      "{{ Metric('order_total', group_by=['customer']) }} > 1000"
      "{{ Metric('order_count', group_by=['customer']) }} >= 5")))

(deftest ^:parallel filter-like-pattern-test
  (let [len [:length {} status]]
    (testing "x%y is starts-with and ends-with, long enough that the two ends cannot overlap"
      (are [template clause] (= clause (filter-of template))
        "{{ Dimension('fact_sales_key__status') }} LIKE 'ORD-%-2024'"
        [:and {} [:starts-with {} status "ORD-"] [:ends-with {} status "-2024"] [:>= {} len 9]]
        "{{ Dimension('fact_sales_key__status') }} LIKE 'a%%b'"
        [:and {} [:starts-with {} status "a"] [:ends-with {} status "b"] [:>= {} len 2]]
        "{{ Dimension('fact_sales_key__status') }} ILIKE 'ord-%-2024'"
        [:and {}
         [:starts-with {:case-sensitive false} status "ord-"]
         [:ends-with {:case-sensitive false} status "-2024"]
         [:>= {} len 9]]
        "{{ Dimension('fact_sales_key__status') }} NOT LIKE 'a%b'"
        [:not {} [:and {} [:starts-with {} status "a"] [:ends-with {} status "b"] [:>= {} len 2]]]))
    (testing "a run of _ next to one literal is the literal at that end and the exact length"
      (are [template clause] (= clause (filter-of template))
        "{{ Dimension('fact_sales_key__status') }} LIKE 'order_'"
        [:and {} [:starts-with {} status "order"] [:= {} len 6]]

        "{{ Dimension('fact_sales_key__status') }} LIKE 'ORD-__'"
        [:and {} [:starts-with {} status "ORD-"] [:= {} len 6]]

        "{{ Dimension('fact_sales_key__status') }} LIKE '__-2024'"
        [:and {} [:ends-with {} status "-2024"] [:= {} len 7]]

        "{{ Dimension('fact_sales_key__status') }} LIKE '___'"
        [:= {} len 3]

        "{{ Dimension('fact_sales_key__status') }} ILIKE 'ord_'"
        [:and {} [:starts-with {:case-sensitive false} status "ord"] [:= {} len 4]]))
    (testing "a pattern with no wildcard is =, over lower for ILIKE; % alone is any non-null value"
      (are [template clause] (= clause (filter-of template))
        "{{ Dimension('fact_sales_key__status') }} LIKE 'acme'"  [:= {} status "acme"]
        "{{ Dimension('fact_sales_key__status') }} ILIKE 'Acme'" [:= {} [:lower {} status] "acme"]
        "{{ Dimension('fact_sales_key__status') }} LIKE ''"      [:= {} status ""]
        "{{ Dimension('fact_sales_key__status') }} LIKE '%'"     [:not-null {} status]))
    (testing (str "patterns Lib's string filters cannot express exactly are the equivalent regex, anchored; ILIKE"
                  " lower-cases both sides")
      (are [template regex] (= [:not-null {} [:regex-match-first {} status regex]] (filter-of template))
        "{{ Dimension('fact_sales_key__status') }} LIKE 'a_c%'"     "(^a.c.*$)"
        "{{ Dimension('fact_sales_key__status') }} LIKE 'a%b%c'"    "(^a.*b.*c$)"
        "{{ Dimension('fact_sales_key__status') }} LIKE '%a%b'"     "(^.*a.*b$)"
        "{{ Dimension('fact_sales_key__status') }} LIKE 'a_b_'"     "(^a.b.$)"
        "{{ Dimension('fact_sales_key__status') }} LIKE 'a_b'"      "(^a.b$)"
        "{{ Dimension('fact_sales_key__status') }} LIKE 'a.b_(c)%'" "(^a\\.b.\\(c\\).*$)")
      (is (= [:not-null {} [:regex-match-first {} [:lower {} status] "(^a.c.*$)"]]
             (filter-of "{{ Dimension('fact_sales_key__status') }} ILIKE 'A_C%'")))
      (is (= [:not {} [:not-null {} [:regex-match-first {} status "(^a.b$)"]]]
             (filter-of "{{ Dimension('fact_sales_key__status') }} NOT LIKE 'a_b'"))))
    (testing "ESCAPE makes the next character literal, whatever the pattern then maps to"
      (are [template clause] (= clause (filter-of template))
        "{{ Dimension('fact_sales_key__status') }} LIKE '100!%' ESCAPE '!'"
        [:= {} status "100%"]

        "{{ Dimension('fact_sales_key__status') }} LIKE 'a!_b%' ESCAPE '!'"
        [:starts-with {} status "a_b"]

        "{{ Dimension('fact_sales_key__status') }} ILIKE '%a!%b%' ESCAPE '!'"
        [:contains {:case-sensitive false} status "a%b"]

        "{{ Dimension('fact_sales_key__status') }} NOT LIKE 'a!%b' ESCAPE '!'"
        [:not {} [:= {} status "a%b"]]

        "{{ Dimension('fact_sales_key__status') }} LIKE 'a!%b_c' ESCAPE '!'"
        [:not-null {} [:regex-match-first {} status "(^a%b.c$)"]]

        "{{ Dimension('fact_sales_key__status') }} LIKE 'a\\%b' ESCAPE '\\'"
        [:= {} status "a%b"])
      (are [template reason] (re-find reason (filter-reason template))
        "{{ Dimension('fact_sales_key__status') }} LIKE 'a!' ESCAPE '!'"
        #"ends with its escape character"

        "{{ Dimension('fact_sales_key__status') }} LIKE 'a%' ESCAPE '!!'"
        #"ESCAPE .* only a one-character string literal"))
    (testing "the pattern has to be a literal"
      (is (re-find #"LIKE with a pattern that is not a string literal"
                   (filter-reason "{{ Dimension('fact_sales_key__status') }} LIKE upper('a%')"))))))

(deftest ^:parallel filter-regex-test
  (testing (str "a regex match is the first match being not null, the regex wrapped in a group of its own; ~* is"
                " case-insensitive")
    (are [template clause] (= clause (filter-of template))
      "{{ Dimension('fact_sales_key__status') }} ~ '^ORD-(a|b)'"
      [:not-null {} [:regex-match-first {} status "(^ORD-(a|b))"]]

      "{{ Dimension('fact_sales_key__status') }} ~* '^ord-'"
      [:not-null {} [:regex-match-first {} status "(?i)(^ord-)"]]

      "{{ Dimension('fact_sales_key__status') }} !~ '^ORD-'"
      [:not {} [:not-null {} [:regex-match-first {} status "(^ORD-)"]]]

      "{{ Dimension('fact_sales_key__status') }} !~* '^ord-'"
      [:not {} [:not-null {} [:regex-match-first {} status "(?i)(^ord-)"]]]

      "regexp_like({{ Dimension('fact_sales_key__status') }}, '^a')"
      [:not-null {} [:regex-match-first {} status "(^a)"]]))
  (testing "SIMILAR TO is the POSIX form of its SQL regex: % and _ are .* and ., . is literal, backslash escapes"
    (are [template regex] (= [:not-null {} [:regex-match-first {} status regex]] (filter-of template))
      "{{ Dimension('fact_sales_key__status') }} SIMILAR TO 'ORD-%(a|b)_'"        "(^ORD-.*(a|b).$)"
      "{{ Dimension('fact_sales_key__status') }} SIMILAR TO 'a.b[.%]'"            "(^a\\.b[.%]$)"
      "{{ Dimension('fact_sales_key__status') }} SIMILAR TO 'a\\%b'"              "(^a%b$)"
      "{{ Dimension('fact_sales_key__status') }} SIMILAR TO 'a!%b' ESCAPE '!'"    "(^a%b$)"
      "{{ Dimension('fact_sales_key__status') }} SIMILAR TO '(a|b){2,}'"          "(^(a|b){2,}$)")
    (is (= [:not {} [:not-null {} [:regex-match-first {} status "(^a.*$)"]]]
           (filter-of "{{ Dimension('fact_sales_key__status') }} NOT SIMILAR TO 'a%'"))))
  (testing "the regex has to be a literal"
    (is (re-find #"~ with a pattern that is not a string literal"
                 (filter-reason (str "{{ Dimension('fact_sales_key__status') }} ~"
                                     " {{ Dimension('fact_sales_key__amount') }}"))))))

(deftest ^:parallel filter-is-boolean-test
  (testing "IS TRUE and IS FALSE are =; the negations hold for null too, so they are != OR IS NULL"
    (are [template clause] (= clause (filter-of template))
      "{{ Dimension('fact_sales_key__is_returned') }} IS TRUE"
      [:= {} is-returned true]
      "{{ Dimension('fact_sales_key__is_returned') }} IS FALSE"
      [:= {} is-returned false]
      "{{ Dimension('fact_sales_key__is_returned') }} IS NOT TRUE"
      [:or {} [:!= {} is-returned true] [:is-null {} is-returned]]
      "{{ Dimension('fact_sales_key__is_returned') }} IS NOT FALSE"
      [:or {} [:!= {} is-returned false] [:is-null {} is-returned]]
      "NOT ({{ Dimension('fact_sales_key__is_returned') }} IS TRUE)"
      [:or {} [:!= {} is-returned true] [:is-null {} is-returned]]
      "NOT ({{ Dimension('fact_sales_key__is_returned') }} IS NULL)"
      [:not-null {} is-returned])))

(deftest ^:parallel filter-function-test
  (let [created-at (fld "created_at" :type/DateTime)]
    (are [template clause] (= clause (filter-of template))
      "lower({{ Dimension('fact_sales_key__status') }}) = 'shipped'"
      [:= {} [:lower {} status] "shipped"]
      "upper(trim({{ Dimension('fact_sales_key__status') }})) IN ('A', 'B')"
      [:in {} [:upper {} [:trim {} status]] "A" "B"]
      "coalesce({{ Dimension('fact_sales_key__amount') }}, 0) > 100"
      [:> {} [:coalesce {} amount 0] 100]
      "round({{ Dimension('fact_sales_key__amount') }}) = 100"
      [:= {} [:round {} amount] 100]
      "cast({{ Dimension('fact_sales_key__amount') }} as integer) = 100"
      [:= {} [:integer {} amount] 100]
      "{{ Dimension('fact_sales_key__status') }}::text = 'x'"
      [:= {} [:text {} status] "x"]
      "extract(year from {{ Dimension('fact_sales_key__created_at') }}) = 2024"
      [:= {} [:get-year {} created-at] 2024]
      "date_trunc('month', {{ Dimension('fact_sales_key__created_at') }}) = '2024-03-01'"
      [:= {} (assoc-in created-at [1 :temporal-unit] :month) "2024-03-01"]
      "{{ Dimension('fact_sales_key__created_at') }} < current_date"
      [:< {} created-at [:today {}]]
      "case {{ Dimension('fact_sales_key__status') }} when 'a' then 1 else 0 end = 1"
      [:= {} [:case {} [[[:= {} status "a"] 1]] 0] 1])))

(deftest ^:parallel filter-null-safe-comparison-test
  (let [code (fld "customer_key" :type/Text)]
    (testing (str "against a literal, IS [NOT] DISTINCT FROM is the = or != Lib has: = is false in a filter for a null"
                  " column, and != on a column includes the nulls")
      (are [template clause] (= clause (filter-of template))
        "{{ Dimension('fact_sales_key__status') }} IS NOT DISTINCT FROM 'x'" [:= {} status "x"]
        "{{ Dimension('fact_sales_key__status') }} IS DISTINCT FROM 'x'"     [:!= {} status "x"]
        "'x' IS DISTINCT FROM {{ Dimension('fact_sales_key__status') }}"     [:!= {} status "x"]
        "{{ Dimension('fact_sales_key__status') }} IS DISTINCT FROM NULL"    [:not-null {} status]
        "{{ Dimension('fact_sales_key__status') }} IS NOT DISTINCT FROM NULL" [:is-null {} status]))
    (testing "!= on an expression does not include the nulls, so the null case is spelled out"
      (is (= [:or {} [:!= {} [:lower {} status] "x"] [:is-null {} [:lower {} status]]]
             (filter-of "lower({{ Dimension('fact_sales_key__status') }}) IS DISTINCT FROM 'x'"))))
    (testing (str "between two columns (here a dimension and an entity key) every branch is two-valued, so two nulls"
                  " are the same and a null against a value is different")
      (is (= [:or {}
              [:and {} [:not-null {} status] [:not-null {} code] [:= {} status code]]
              [:and {} [:is-null {} status] [:is-null {} code]]]
             (filter-of "{{ Dimension('fact_sales_key__status') }} IS NOT DISTINCT FROM {{ Entity('customer') }}")))
      (is (= [:or {}
              [:and {} [:not-null {} status] [:not-null {} code] [:!= {} status code]]
              [:and {} [:is-null {} status] [:not-null {} code]]
              [:and {} [:not-null {} status] [:is-null {} code]]]
             (filter-of "{{ Dimension('fact_sales_key__status') }} IS DISTINCT FROM {{ Entity('customer') }}"))))
    (testing "two literals compare nothing"
      (is (re-find #"compares two literals"
                   (filter-reason "{{ Dimension('fact_sales_key__status') }} = 'x' AND 1 IS DISTINCT FROM 2"))))))

(deftest ^:parallel filter-null-comparison-test
  (testing "a comparison against the literal NULL is null, so never true, in SQL; Lib would read the nil as IS NULL"
    (are [template] (re-find #"compares against NULL, which is never true in SQL" (filter-reason template))
      "{{ Dimension('fact_sales_key__status') }} = NULL"
      "{{ Dimension('fact_sales_key__status') }} != NULL"
      "{{ Dimension('fact_sales_key__status') }} <> NULL"
      "NULL = {{ Dimension('fact_sales_key__status') }}"
      "{{ Dimension('fact_sales_key__amount') }} > (NULL)"
      "{{ Dimension('fact_sales_key__amount') }} <= NULL"
      "NOT ({{ Dimension('fact_sales_key__status') }} = NULL)"
      "{{ Dimension('fact_sales_key__status') }} IN ('Shipped', NULL)"
      "{{ Dimension('fact_sales_key__status') }} NOT IN (NULL)"
      "{{ Dimension('fact_sales_key__amount') }} BETWEEN NULL AND 100"
      "{{ Dimension('fact_sales_key__amount') }} BETWEEN 0 AND NULL"
      "{{ Dimension('fact_sales_key__status') }} = 'Shipped' OR {{ Dimension('fact_sales_key__amount') }} = NULL"
      "CASE WHEN {{ Dimension('fact_sales_key__status') }} = NULL THEN 1 ELSE 0 END = 1"))
  (testing "NULL as a value, rather than compared against, is fine"
    (is (= [:= {} [:case {} [[[:= {} status "x"] nil]] status] "y"]
           (filter-of "nullif({{ Dimension('fact_sales_key__status') }}, 'x') = 'y'")))))

(deftest ^:parallel filter-reference-arguments-test
  (testing "entity_path picks a join path the converter cannot follow, so it is reported rather than dropped"
    (are [template] (re-find #"has the argument entity_path=\['order'\]" (filter-reason template))
      "{{ Dimension('fact_sales_key__status', entity_path=['order']) }} = 'Shipped'"
      "{{ Dimension('fact_sales_key__status' , entity_path=['order'] ) }} = 'Shipped'"
      "{{ TimeDimension('metric_time', 'day', entity_path=['order']) }} >= '2024-01-01'"
      "{{ Entity('customer', entity_path=['order']) }} IS NOT NULL"))
  (testing "whitespace around the name is not an argument"
    (is (= [:= {} status "Shipped"] (filter-of "{{ Dimension( 'fact_sales_key__status' ) }} = 'Shipped'")))))

(deftest ^:parallel filter-unsupported-sql-test
  (are [template reason] (re-find reason (filter-reason template))
    "regexp_replace({{ Dimension('fact_sales_key__status') }}, 'a', 'b') = 'acme'"   #"the function regexp_replace"
    "{{ Dimension('fact_sales_key__status') }} IN (SELECT status FROM x)"          #"IN over"
    "1 = 1"                                                                        #"references no dimension or entity"
    "{{ Dimension('fact_sales_key__status') }} = 'Shipped'; DROP TABLE fact_sales" #"could not parse"
    "   "                                                                          #"references no dimension or entity"
    "status = 'Shipped'"                                                           #"references no dimension or entity")
  (testing "Jinja the renderer does not read is reported as such, before the filter is said to reference nothing"
    (are [template] (re-find #"could not parse .*: it still contains Jinja" (filter-reason template))
      "{{ var('x') }} = 1"
      "{{ Dimension('fact_sales_key__status') }} = {{ var('status') }}"
      "{{ Dimension(get_dimension_name()) }} = 'Shipped'")))

(deftest ^:parallel filter-syntax-test
  (testing "spellings of the same filter"
    (are [template] (= [:= {} status "Shipped"] (filter-of template))
      "{{ Dimension(\"fact_sales_key__status\") }} = 'Shipped'"
      "{{Dimension('fact_sales_key__status')}}='Shipped'"
      "{{ Dimension('fact_sales_key__status') }} = 'Shipped' -- comment"
      "{{ Dimension('fact_sales_key__status') }} = 'Shipped'\n"))
  (testing "the reason for an unsupported filter quotes the template"
    (is (re-find #"^filter \"\{\{ Dimension\('order__status'\) \}\} = 'Shipped'\": "
                 (filter-reason "{{ Dimension('order__status') }} = 'Shipped'")))))

(deftest ^:parallel filter-placement-test
  (let [shipped "{{ Dimension('fact_sales_key__status') }} = 'Shipped'"
        has-customer "{{ Entity('customer') }} IS NOT NULL"]
    (testing "a filter on the input measure"
      (is (= [[:= {} status "Shipped"]] (tu/filters {:input-measure {:filter (tu/where-filters shipped)}}))))
    (testing "the metric's filters come before its input measure's"
      (is (= [[:not-null {} customer-key] [:= {} status "Shipped"]]
             (tu/filters {:metric        {:filter (tu/where-filters has-customer)}
                          :input-measure {:filter (tu/where-filters shipped)}}))))
    (testing "each where_filter is its own clause"
      (is (= [[:= {} status "Shipped"] [:> {} amount 0]]
             (tu/filters {:metric {:filter (tu/where-filters shipped
                                                             "{{ Dimension('fact_sales_key__amount') }} > 0")}}))))
    (testing "an empty where_filters list or a null filter is no filter"
      (is (= [] (tu/filters {:metric {:filter (tu/where-filters)}})))
      (is (= [] (tu/filters {:metric {:filter nil}}))))
    (testing "filters leave the aggregation alone"
      (is (= tu/sum-sales (tu/aggregation {:metric {:filter (tu/where-filters shipped)}}))))))

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
                          (tu/convert {:measure {:non_additive_dimension {:name          "date_day"
                                                                          :window_choice "first"}}})))))

(defn- edit-relation [k v]
  (fn [m] (assoc-in m [:semantic_models tu/sm-id :node_relation k] v)))

(defn- query-of
  "The query parts of what [[tu/convert]] builds from `tweaks`."
  [tweaks]
  (select-keys (tu/convert tweaks) [:aggregation :filters :source-table]))

(deftest ^:parallel relation-test
  (testing "a relation with no database (Spark, some Databricks setups) cannot be mapped"
    (is (re-find #"no Metabase database configured" (tu/unsupported {:edit (edit-relation :database nil)}))))
  (testing "database names are matched exactly against the config"
    (is (re-find #"no Metabase database configured for warehouse database \"DBT_BI\""
                 (tu/unsupported {:edit (edit-relation :database "DBT_BI")}))))
  (testing "an upper-case schema is used verbatim"
    (is (= {:aggregation  [:sum {} (fld "PUBLIC" "fact_sales" "sales" :type/Float)]
            :filters      []
            :source-table [tu/db "PUBLIC" "fact_sales"]}
           (query-of {:edit (edit-relation :schema_name "PUBLIC")}))))
  (testing "an alias that differs from the model name is the table"
    (is (= {:aggregation  [:sum {} (fld "public" "fct_sales_v2" "sales" :type/Float)]
            :filters      []
            :source-table [tu/db "public" "fct_sales_v2"]}
           (query-of {:edit (fn [m]
                              (-> m
                                  ((edit-relation :alias "fct_sales_v2"))
                                  (assoc-in [:nodes tu/model-id :alias] "fct_sales_v2")))}))))
  (testing "a schema containing a dot is one name"
    (is (= {:aggregation  [:sum {} (fld "analytics.v2" "fact_sales" "sales" :type/Float)]
            :filters      []
            :source-table [tu/db "analytics.v2" "fact_sales"]}
           (query-of {:edit (edit-relation :schema_name "analytics.v2")})))))
