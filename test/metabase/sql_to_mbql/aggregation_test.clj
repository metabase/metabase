(ns metabase.sql-to-mbql.aggregation-test
  "The aggregation mode of [[metabase.sql-to-mbql.core/expression->mbql]] (QRES-11): a SQL aggregate expression, the
  shape an Apache Ossie metric takes (`SUM(lineitem.net_amount_kept) / COUNT(DISTINCT lineitem.l_orderkey)`), as one
  Lib aggregation clause. The SQL is the [[corpus]], the metrics of public Ossie example projects, so that the tests
  cover the SQL a real import meets; a handful of constructed edge cases are marked as such. The row-level subset is
  covered in [[metabase.sql-to-mbql.expression-test]]."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing use-fixtures]]
   [clojure.walk :as walk]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-to-mbql.core :as sql-to-mbql]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

;; compiling a query runs the whole preprocessing pipeline, parts of which read the app DB
(use-fixtures :once (fixtures/initialize :db))

(def ^:private columns
  "The columns the corpus refers to, by the name the SQL writes (matched without regard to case), each with the type
  its fixture declares (Ossie's `Integer`, `Decimal`, `String`, `Date`, `DateTime` and `Boolean`). Ossie metrics
  qualify a column with its dataset, `lineitem.net_amount_kept`; the converter drops the qualifier, so the callback
  sees the column name alone, and one table holds every column here. The metric names some fixtures use as bare
  identifiers (`total_amount / orders__count`) are columns here too: to the converter they are identifiers like any
  other, and what is tested is that one outside an aggregate is reported."
  (array-map
   ;; TPC-H: Snowflake-Labs/sfquickstarts tpch-revenue.osi.yaml
   "net_amount_kept"       :type/Decimal
   "extended_price"        :type/Decimal
   "l_orderkey"            :type/Integer
   "o_orderkey"            :type/Integer
   "l_returnflag"          :type/Text
   "l_extendedprice"       :type/Decimal
   "l_discount"            :type/Decimal
   ;; TPC-DS: apache/ossie examples/tpcds_semantic_model.yaml
   "ss_quantity"           :type/Integer
   "ss_ext_sales_price"    :type/Decimal
   "ss_net_profit"         :type/Decimal
   "c_customer_sk"         :type/Integer
   "s_number_employees"    :type/Integer
   "s_store_sk"            :type/Integer
   "d_date"                :type/Date
   "d_year"                :type/Integer
   "d_moy"                 :type/Integer
   ;; SCOTT: apache/ossie compliance/query/scott
   "sal"                   :type/Decimal
   "comm"                  :type/Decimal
   ;; the portability fixtures and the spec's examples
   "amount"                :type/Decimal
   "order_id"              :type/Integer
   "customer_id"           :type/Integer
   "status"                :type/Text
   "sales"                 :type/Decimal
   "net_amount"            :type/Decimal
   "id"                    :type/Integer
   "revenue"               :type/Decimal
   ;; apache/ossie-converters fixtures
   "subtotal"              :type/Decimal
   "quantity"              :type/Integer
   "created_at"            :type/DateTime
   "city"                  :type/Text
   "qty"                   :type/Integer
   "cust"                  :type/Text
   "x"                     :type/Decimal
   "a"                     :type/Integer
   "b"                     :type/Integer
   "c"                     :type/Integer
   "d"                     :type/Integer
   "return_amount"         :type/Decimal
   "sales_amount"          :type/Decimal
   "is_returned"           :type/Boolean
   "total_amount"          :type/Decimal
   "orders__count"         :type/Integer
   "items_quantity"        :type/Decimal
   "quantity_per_customer" :type/Decimal
   ;; constructed cases
   "price"                 :type/Decimal))

;;; [[table-id]] and [[field-ids]] are random so we don't accidentally hardcode them in tests

(defonce ^:private table-id
  ;; 1001, 2001, 3001 ... 9001
  (inc (* (inc (rand-int 9)) 1000)))

(defonce ^:private ^{:doc "Upper-cased column name → the id of its field in [[metadata-provider]]."}
  field-ids
  ;; if table ID is 2001 then column IDs are 20001, 20002, etc
  (into {}
        (map-indexed (fn [i [column-name _]]
                       [(u/upper-case-en column-name) (+ (* (dec table-id) 10) i)]))
        columns))

(def ^:private metadata-provider
  "The test metadata with one more table, `OSSIE`, holding every column of [[columns]]."
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:tables [{:id table-id, :db-id (meta/id), :name "OSSIE", :schema "PUBLIC", :display-name "Ossie"}]
    :fields (for [[column-name base-type] columns]
              {:id             (get field-ids (u/upper-case-en column-name))
               :table-id       table-id
               :name           (u/upper-case-en column-name)
               :display-name   column-name
               :base-type      base-type
               :effective-type base-type
               :database-type  (u/upper-case-en (name base-type))})}))

(defn- resolve-column
  "The column callback: a new ref to the column of [[metadata-provider]] named `column-name`, however the SQL cases it.
  A name the corpus does not declare is a mistake in a test, and throws an exception [[reason]] does not swallow."
  [column-name]
  (let [id (or (get field-ids (u/upper-case-en column-name))
               (throw (ex-info (format "the corpus declares no column %s; add it to `columns`" (pr-str column-name))
                               {:column column-name})))]
    (lib/ref (lib.metadata/field metadata-provider id))))

(defn- without-uuids
  "`clause` with the `:lib/uuid` of every clause in it removed, for an `is` to compare."
  [clause]
  (walk/postwalk (fn [x] (if (map? x) (dissoc x :lib/uuid) x)) clause))

(defn- col
  "The ref [[resolve-column]] returns for `column-name`, without its uuid, for an expected clause."
  [column-name]
  (without-uuids (resolve-column column-name)))

(defn- reason
  "The message of the exception `thunk` throws, when it is one [[sql-to-mbql/unsupported?]] recognises."
  [thunk]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (if (sql-to-mbql/unsupported? e)
        (ex-message e)
        (throw e)))))

(defn- aggregation
  "The aggregation clause the SQL aggregate expression `sql` converts to in `dialect` (Postgres by default), uuids
  removed; the reason when it is reported."
  ([sql]
   (aggregation "postgres" sql))
  ([dialect sql]
   (reason #(without-uuids (sql-to-mbql/expression->mbql dialect sql resolve-column {:aggregation? true})))))

(defn- expression
  "The expression the SQL value expression `sql` converts to on Postgres, uuids removed; the reason when it is
  reported."
  [sql]
  (reason #(without-uuids (sql-to-mbql/expression->mbql "postgres" sql resolve-column))))

(defn- condition
  "The filter clause the SQL condition `sql` converts to on Postgres, uuids removed; the reason when it is reported."
  [sql]
  (reason #(without-uuids (sql-to-mbql/expression->mbql "postgres" sql resolve-column {:condition? true}))))

(defn- aggregation-sql
  "The aggregation of the H2 SQL a query aggregated by the converted `sql` (in the Postgres dialect) compiles to, with
  the columns spelled as the corpus does."
  [sql]
  (let [query (-> (lib/query metadata-provider (lib.metadata/table metadata-provider table-id))
                  (lib/aggregate (sql-to-mbql/expression->mbql "postgres" sql resolve-column {:aggregation? true})))]
    (driver/with-driver :h2
      (-> (qp.compile/compile query)
          :query
          (str/replace #"\"PUBLIC\"\.\"OSSIE\"\.\"(\w+)\"" (fn [[_ column-name]] (u/lower-case-en column-name)))
          (str/replace #"^SELECT " "")
          (str/replace #" AS \"[^\"]+\" FROM .*$" "")))))

(def ^:private corpus
  "Metric SQL from public Apache Ossie projects: each entry's `:sql` as its fixture writes it (`:from` says where), and
  whether it should come back as an aggregation clause (`:converts?`) or be reported, on `:dialect` (Postgres unless
  said). [[corpus-test]] runs every entry; the tests below check the clauses of representative ones.

  The sources, all Apache-2.0 or MIT:

  - `tpch-revenue`: Snowflake-Labs/sfquickstarts, `getting-started-with-apache-osi/assets/tpch-revenue.osi.yaml`
    (0.1.1) and `tpch-revenue.osi.v02.yaml` (0.2.0.dev0), the same four metrics in both. The semantic layer import
    inlines a field's expression where a metric refers to it, so the computed `net_amount_kept` field is here inlined
    as well.
  - `tpcds`: apache/ossie `examples/tpcds_semantic_model.yaml`, eight model-scoped metrics (three of them window
    functions) and one dataset-scoped.
  - `scott`: apache/ossie `compliance/query/scott/scott_model.ossie.yaml`, dataset-scoped metrics, and the `AVG` its
    comment describes.
  - `portability`: apache/ossie `compliance/portability/m0` to `m3`, the minimal single-dataset documents.
  - `spec`: the examples of apache/ossie `core-spec/spec.md` and `core-spec/expression_language.md`, whose tables of
    REQUIRED aggregate functions the statistical and percentile entries come from.
  - `converters`: the test fixtures of apache/ossie-converters, which other tools' converters write or read, with the
    tool's name; Hex's `${...}` templating removed. The dbt converter's `msi_to_ossie.py` writes the shapes marked
    `dbt`, so they are what a dbt project's `osi_document.json` holds."
  [;; tpch-revenue
   {:from "tpch-revenue net_revenue"         :sql "SUM(lineitem.net_amount_kept)" :converts? true}
   {:from "tpch-revenue gross_revenue"       :sql "SUM(lineitem.extended_price)" :converts? true}
   {:from "tpch-revenue order_count"         :sql "COUNT(DISTINCT orders.o_orderkey)" :converts? true}
   {:from "tpch-revenue average_order_value" :sql "SUM(lineitem.net_amount_kept) / COUNT(DISTINCT lineitem.l_orderkey)"
    :converts? true}
   {:from "tpch-revenue net_revenue, net_amount_kept inlined"
    :sql "SUM(CASE WHEN L_RETURNFLAG <> 'R' THEN L_EXTENDEDPRICE * (1 - L_DISCOUNT) ELSE 0 END)" :converts? true}
   {:from "tpch-revenue net_amount inlined" :sql "SUM(L_EXTENDEDPRICE * (1 - L_DISCOUNT))" :converts? true}
   ;; tpcds
   {:from "tpcds store_sales.total_quantity" :sql "SUM(ss_quantity)" :converts? true}
   {:from "tpcds total_sales"                :sql "SUM(store_sales.ss_ext_sales_price)" :converts? true}
   {:from "tpcds total_profit"               :sql "SUM(store_sales.ss_net_profit)" :converts? true}
   {:from "tpcds customer_lifetime_value"
    :sql "SUM(store_sales.ss_ext_sales_price) / COUNT(DISTINCT customer.c_customer_sk)" :converts? true}
   {:from "tpcds store_productivity"
    :sql "SUM(store_sales.ss_ext_sales_price) / NULLIF(SUM(store.s_number_employees), 0)" :converts? true}
   {:from "tpcds cumulative_sales"
    :sql (str "SUM(SUM(store_sales.ss_ext_sales_price)) OVER (ORDER BY date_dim.d_date ROWS BETWEEN UNBOUNDED"
              " PRECEDING AND CURRENT ROW)")
    :converts? false}
   {:from "tpcds brand_rank_in_store"
    :sql "RANK() OVER (PARTITION BY store.s_store_sk ORDER BY SUM(store_sales.ss_ext_sales_price) DESC)"
    :converts? false}
   {:from "tpcds monthly_sales_change"
    :sql (str "SUM(store_sales.ss_ext_sales_price) - LAG(SUM(store_sales.ss_ext_sales_price), 1)"
              " OVER (ORDER BY date_dim.d_year, date_dim.d_moy)")
    :converts? false}
   ;; scott
   {:from "scott emp.sum_sal"    :sql "SUM(sal)" :converts? true}
   {:from "scott emp.emp_count"  :sql "COUNT(*)" :converts? true}
   {:from "scott emp.comm_count" :sql "COUNT(comm)" :converts? true}
   {:from "scott emp.sum_comm"   :sql "SUM(comm)" :converts? true}
   {:from "scott, the AVG its comment describes" :sql "AVG(CAST(sal AS DOUBLE PRECISION))" :converts? true}
   ;; portability
   {:from "portability m0 qualified"          :sql "SUM(sales.amount)" :converts? true}
   {:from "portability m0 bare"               :sql "SUM(amount)" :converts? true}
   {:from "portability m2 count_orders"       :sql "COUNT(order_id)" :converts? true}
   {:from "portability m2 distinct_customers" :sql "COUNT(DISTINCT customer_id)" :converts? true}
   {:from "portability m2 avg_amount"         :sql "AVG(amount)" :converts? true}
   {:from "portability m2 min_amount"         :sql "MIN(amount)" :converts? true}
   {:from "portability m2 max_amount"         :sql "MAX(amount)" :converts? true}
   {:from "portability m3 bare"      :sql "SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END)" :converts? true}
   {:from "portability m3 qualified"
    :sql "SUM(CASE WHEN sales.status = 'completed' THEN sales.amount ELSE 0 END)" :converts? true}
   ;; spec
   {:from "spec.md metric expression" :sql "SUM(order.sales) / COUNT(DISTINCT order.customer_id)" :converts? true}
   {:from "spec.md cross-dataset metric" :sql "SUM(orders.amount) / COUNT(DISTINCT customers.id)" :converts? true}
   {:from "spec.md dataset-scoped metric" :sql "SUM(net_amount)" :converts? true}
   {:from "spec DISTINCT modifier" :sql "SUM(DISTINCT amount)" :converts? false}
   {:from "spec filtered via CASE" :sql "SUM(CASE WHEN status = 'completed' THEN amount END)" :converts? true}
   {:from "spec filtered via CASE" :sql "COUNT(CASE WHEN status = 'completed' THEN 1 END)" :converts? true}
   {:from "spec FILTER"            :sql "SUM(amount) FILTER (WHERE status = 'completed')" :converts? true}
   {:from "spec FILTER"            :sql "COUNT(*) FILTER (WHERE status = 'completed')" :converts? true}
   {:from "spec FILTER"            :sql "COUNT(DISTINCT customer_id) FILTER (WHERE status = 'completed')"
    :converts? true}
   {:from "spec statistical"       :sql "STDDEV(amount)" :converts? false}
   {:from "spec statistical"       :sql "STDDEV_POP(amount)" :converts? true}
   {:from "spec statistical"       :sql "STDDEV_SAMP(amount)" :converts? false}
   {:from "spec statistical"       :sql "VARIANCE(amount)" :converts? false}
   {:from "spec statistical"       :sql "VAR_POP(amount)" :converts? true}
   {:from "spec statistical"       :sql "VAR_SAMP(amount)" :converts? false}
   {:from "spec percentile"        :sql "MEDIAN(amount)" :converts? true}
   {:from "spec percentile"        :sql "PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount)" :converts? true}
   {:from "spec percentile"        :sql "PERCENTILE_DISC(0.75) WITHIN GROUP (ORDER BY amount)" :converts? false}
   {:from "spec approximate"       :sql "APPROX_COUNT_DISTINCT(customer_id)" :dialect "snowflake" :converts? false}
   {:from "spec approximate"       :sql "APPROX_PERCENTILE(amount, 0.5)" :dialect "snowflake" :converts? false}
   {:from "spec window"            :sql "RANK() OVER (ORDER BY revenue DESC NULLS LAST)" :converts? false}
   ;; converters
   {:from "converters cube orders__count"    :sql "COUNT(DISTINCT orders.id)" :converts? true}
   {:from "converters cube completed_amount"
    :sql "SUM(CASE WHEN (orders.status = 'completed') THEN orders.amount END)" :converts? true}
   {:from "converters cube avg_order_value, a metric naming two metrics" :sql "total_amount / orders__count"
    :converts? false}
   {:from "converters cube cities"           :sql "COUNT(DISTINCT users.city)" :converts? true}
   {:from "converters nvidia"                :sql "SUM(orders.subtotal)::NUMBER / COUNT(DISTINCT customers.customer_id)"
    :dialect "snowflake" :converts? false}
   {:from "converters holistics quantity_per_customer" :sql "SUM(items.quantity) / COUNT(DISTINCT users.id)"
    :converts? false}
   {:from "converters holistics quantity_per_customer" :sql "SUM(items.quantity) / COUNT(DISTINCT users.id)"
    :dialect "snowflake" :converts? true}
   {:from "converters holistics rounded_ratio"
    :sql "ROUND(SAFE_DIVIDE(SUM(items.quantity), ABS(COUNT(users.id))), 2)" :dialect "bigquery" :converts? false}
   {:from "converters holistics passthrough_call" :sql "SUM(items.quantity) + MY_WAREHOUSE_UDF(COUNT(users.id), 3)"
    :converts? false}
   {:from "converters holistics"              :sql "SUM(items.quantity) + LOG10(COUNT(users.id))" :converts? true}
   {:from "converters holistics windowed_rank"
    :sql "RANK() OVER (PARTITION BY users.id ORDER BY SUM(items.quantity) DESC)" :converts? false}
   {:from "converters holistics"              :sql "MAX(ecommerce_orders.created_at)" :converts? true}
   {:from "converters holistics, a metric naming a metric" :sql "items_quantity + COUNT(users.id)" :converts? false}
   {:from "converters holistics, a metric naming a metric" :sql "SUM(items.quantity) * quantity_per_customer"
    :converts? false}
   {:from "converters holistics, a metric naming a metric" :sql "quantity_per_customer / 2" :converts? false}
   {:from "converters lightdash"  :sql "AVG(CASE WHEN orders.status = 'completed' THEN 1 ELSE 0 END)" :converts? true}
   {:from "converters lightdash"  :sql "COUNT(CASE WHEN orders.status = 'customers.vip' THEN 1 END)" :converts? true}
   {:from "converters sigma"      :sql "AVG(CASE WHEN \"Status\" = 'won' THEN \"Amount\" END)" :converts? true}
   {:from "converters sigma"      :sql "COUNT(DISTINCT CASE WHEN \"Status\" = 'won' AND \"Qty\" > 0 THEN \"Cust\" END)"
    :converts? true}
   {:from "converters sigma"      :sql "COUNT(CASE WHEN \"Qty\" > 1 THEN 1 END)" :converts? true}
   {:from "converters sigma"      :sql "STDDEV_SAMP(\"X\")" :converts? false}
   {:from "converters hex"        :sql "COUNT(1)" :converts? true}
   {:from "converters hex"        :sql "SUM(1)" :converts? true}
   {:from "converters hex"        :sql "SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)" :converts? true}
   {:from "converters microsoft"  :sql "AVG(DISTINCT amount)" :converts? false}
   {:from "converters microsoft"  :sql "COUNT(DISTINCT *)" :converts? false}
   {:from "converters microsoft"  :sql "COUNT(DISTINCT amount, cust)" :converts? false}
   {:from "converters orionbelt"  :sql "COUNT(CASE WHEN a > 1 AND b >= 2 AND c < 3 AND d <= 4 THEN 1 ELSE NULL END)"
    :converts? true}
   {:from "converters dbt sum_boolean"      :sql "SUM(CASE WHEN is_returned THEN 1 ELSE 0 END)" :converts? true}
   {:from "converters dbt filtered count_distinct"
    :sql "COUNT(DISTINCT CASE WHEN status = 'completed' THEN customer_id END)" :converts? true}
   {:from "converters dbt filtered average"  :sql "AVG(CASE WHEN status = 'completed' THEN amount END)" :converts? true}
   {:from "converters dbt median"            :sql "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount)" :converts? true}
   {:from "converters dbt discrete percentile" :sql "PERCENTILE_DISC(0.9) WITHIN GROUP (ORDER BY amount)"
    :converts? false}
   {:from "converters dbt count rewritten as a sum"
    :sql "SUM(CASE WHEN orders.o_orderkey IS NOT NULL THEN 1 ELSE 0 END)" :converts? true}])

(deftest ^:parallel corpus-test
  (testing "every metric in the corpus converts to a valid aggregation clause, or is reported with a reason, as the corpus says"
    (doseq [{:keys [from sql dialect converts?]} corpus]
      (testing (str from ": " sql)
        (let [result (reason #(sql-to-mbql/expression->mbql (or dialect "postgres") sql resolve-column
                                                            {:aggregation? true}))]
          (if converts?
            (is (mr/validate ::lib.schema.aggregation/aggregation result)
                (str "expected an aggregation clause, got " (pr-str result)))
            (is (string? result)
                (str "expected a reason, got " (pr-str result)))))))))

(deftest ^:parallel plain-aggregate-test
  (testing "an aggregate over a column, qualified by its dataset or not: the qualifier is dropped before the callback sees the name"
    (are [sql clause] (= clause (aggregation sql))
      "SUM(lineitem.net_amount_kept)"     [:sum {} (col "net_amount_kept")]
      "SUM(amount)"                       [:sum {} (col "amount")]
      "AVG(amount)"                       [:avg {} (col "amount")]
      "MIN(amount)"                       [:min {} (col "amount")]
      "MAX(ecommerce_orders.created_at)"  [:max {} (col "created_at")]
      "MEDIAN(amount)"                    [:median {} (col "amount")]
      "COUNT(DISTINCT orders.o_orderkey)" [:distinct {} (col "o_orderkey")]
      "COUNT(DISTINCT users.city)"        [:distinct {} (col "city")]))
  (testing "a row count, in every spelling"
    (are [sql] (= [:count {}] (aggregation sql))
      "COUNT(*)"
      "COUNT(1)"
      "SUM(1)"
      "COUNT(orders.*)"))
  (testing "COUNT of a column counts the rows where it is not null, as count-where, the way the semantic layer import spells it"
    (are [sql clause] (= clause (aggregation sql))
      "COUNT(comm)"     [:count-where {} [:not-null {} (col "comm")]]
      "COUNT(order_id)" [:count-where {} [:not-null {} (col "order_id")]]))
  (testing "the argument is converted with the row-level converters: an expression, a cast, a CASE"
    (are [sql clause] (= clause (aggregation sql))
      "SUM(L_EXTENDEDPRICE * (1 - L_DISCOUNT))"
      [:sum {} [:* {} (col "l_extendedprice") [:- {} 1 (col "l_discount")]]]

      "AVG(CAST(sal AS DOUBLE PRECISION))"
      [:avg {} [:float {} (col "sal")]]

      "AVG(CASE WHEN status = 'completed' THEN amount END)"
      [:avg {} [:case {} [[[:= {} (col "status") "completed"] (col "amount")]]]]))
  (testing "and what the row-level converters report stays reported inside an aggregate"
    (is (re-find #"the function greatest is not supported" (aggregation "SUM(GREATEST(amount, comm))")))
    (is (re-find #"compares against NULL" (aggregation "SUM(CASE WHEN status = NULL THEN amount END)")))))

(deftest ^:parallel statistics-test
  (testing "Metabase's stddev and var are the population statistics, so those convert"
    (are [sql clause] (= clause (aggregation sql))
      "STDDEV_POP(amount)" [:stddev {} (col "amount")]
      "VAR_POP(amount)"    [:var {} (col "amount")]))
  (testing "and the sample statistics, which divide by n - 1, are reported rather than silently become the population ones"
    (are [sql] (re-find #"(?i)sample" (aggregation sql))
      "STDDEV(amount)"
      "STDDEV_SAMP(amount)"
      "VARIANCE(amount)"
      "VAR_SAMP(amount)"
      "STDDEV_SAMP(\"X\")")))

(deftest ^:parallel percentile-test
  (testing "a continuous percentile, with its fraction"
    (are [sql clause] (= clause (aggregation sql))
      "PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount)" [:percentile {} (col "amount") 0.75]
      "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount)"  [:percentile {} (col "amount") 0.5]))
  (testing "a discrete percentile returns a value from the data where Metabase's interpolates, so it is reported"
    (is (re-find #"PERCENTILE_DISC" (aggregation "PERCENTILE_DISC(0.9) WITHIN GROUP (ORDER BY amount)"))))
  (testing "the fraction has to be a literal from 0 to 1"
    (are [sql] (re-find #"(?i)percentile" (aggregation sql))
      "PERCENTILE_CONT(1.5) WITHIN GROUP (ORDER BY amount)"
      "PERCENTILE_CONT(amount) WITHIN GROUP (ORDER BY price)"))
  (testing "an approximate aggregate returns an estimate, which the exact Metabase aggregation does not"
    (are [sql] (re-find #"(?i)approx" (aggregation "snowflake" sql))
      "APPROX_COUNT_DISTINCT(customer_id)"
      "APPROX_PERCENTILE(amount, 0.5)")))

(deftest ^:parallel filter-clause-test
  (testing "FILTER (WHERE ...) over a sum, a row count and a distinct count is the -where aggregation"
    (are [sql clause] (= clause (aggregation sql))
      "SUM(amount) FILTER (WHERE status = 'completed')"
      [:sum-where {} (col "amount") [:= {} (col "status") "completed"]]

      "COUNT(*) FILTER (WHERE status = 'completed')"
      [:count-where {} [:= {} (col "status") "completed"]]

      "COUNT(DISTINCT customer_id) FILTER (WHERE status = 'completed')"
      [:distinct-where {} (col "customer_id") [:= {} (col "status") "completed"]]

      "SUM(amount) FILTER (WHERE status = 'completed' AND amount > 0)"
      [:sum-where {} (col "amount") [:and {} [:= {} (col "status") "completed"] [:> {} (col "amount") 0]]]))
  (testing "COUNT of a column with a filter counts the rows where the condition holds and the column is not null"
    (is (= [:count-where {} [:and {} [:= {} (col "status") "completed"] [:not-null {} (col "comm")]]]
           (aggregation "COUNT(comm) FILTER (WHERE status = 'completed')"))))
  (testing "Metabase has no filtered avg, min, max, median, percentile or stddev"
    (are [sql] (re-find #"FILTER" (aggregation sql))
      "AVG(amount) FILTER (WHERE status = 'completed')"
      "MIN(amount) FILTER (WHERE status = 'completed')"
      "MAX(amount) FILTER (WHERE status = 'completed')"
      "MEDIAN(amount) FILTER (WHERE status = 'completed')"
      "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) FILTER (WHERE status = 'completed')"
      "STDDEV_POP(amount) FILTER (WHERE status = 'completed')")))

(deftest ^:parallel case-filter-test
  (testing "SUM(CASE WHEN c THEN x ELSE 0 END) and SUM(CASE WHEN c THEN x END) are sum-where"
    (are [sql clause] (= clause (aggregation sql))
      "SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END)"
      [:sum-where {} (col "amount") [:= {} (col "status") "completed"]]

      "SUM(CASE WHEN status = 'completed' THEN amount END)"
      [:sum-where {} (col "amount") [:= {} (col "status") "completed"]]

      "SUM(CASE WHEN sales.status = 'completed' THEN sales.amount ELSE 0 END)"
      [:sum-where {} (col "amount") [:= {} (col "status") "completed"]]

      "SUM(CASE WHEN (orders.status = 'completed') THEN orders.amount END)"
      [:sum-where {} (col "amount") [:= {} (col "status") "completed"]]

      "SUM(CASE status WHEN 'completed' THEN amount ELSE 0 END)"
      [:sum-where {} (col "amount") [:= {} (col "status") "completed"]]

      "SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)"
      [:sum-where {} (col "amount") [:> {} (col "amount") 0]]

      "SUM(CASE WHEN L_RETURNFLAG <> 'R' THEN L_EXTENDEDPRICE * (1 - L_DISCOUNT) ELSE 0 END)"
      [:sum-where {} [:* {} (col "l_extendedprice") [:- {} 1 (col "l_discount")]]
       [:not {} [:= {} (col "l_returnflag") "R"]]])))

(deftest ^:parallel case-count-where-test
  (testing "a 1 under the CASE, summed or counted, is count-where"
    (are [sql clause] (= clause (aggregation sql))
      "SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)"
      [:count-where {} [:= {} (col "status") "completed"]]

      "COUNT(CASE WHEN status = 'completed' THEN 1 END)"
      [:count-where {} [:= {} (col "status") "completed"]]

      "COUNT(CASE WHEN orders.status = 'customers.vip' THEN 1 END)"
      [:count-where {} [:= {} (col "status") "customers.vip"]]

      "COUNT(CASE WHEN a > 1 AND b >= 2 AND c < 3 AND d <= 4 THEN 1 ELSE NULL END)"
      [:count-where {} [:and {} [:> {} (col "a") 1] [:>= {} (col "b") 2] [:< {} (col "c") 3] [:<= {} (col "d") 4]]]

      "COUNT(CASE WHEN \"Qty\" > 1 THEN 1 END)"
      [:count-where {} [:> {} (col "qty") 1]]

      "SUM(CASE WHEN is_returned THEN 1 ELSE 0 END)"
      [:count-where {} [:= {} (col "is_returned") true]]

      "SUM(CASE WHEN orders.o_orderkey IS NOT NULL THEN 1 ELSE 0 END)"
      [:count-where {} [:not-null {} (col "o_orderkey")]]))
  (testing "COUNT of a CASE yielding a column counts the rows where the condition holds and the column is not null"
    (is (= [:count-where {} [:and {} [:= {} (col "status") "completed"] [:not-null {} (col "comm")]]]
           (aggregation "COUNT(CASE WHEN status = 'completed' THEN comm END)")))))

(deftest ^:parallel case-distinct-where-and-share-test
  (testing "COUNT(DISTINCT CASE WHEN c THEN x END) is distinct-where"
    (are [sql clause] (= clause (aggregation sql))
      "COUNT(DISTINCT CASE WHEN status = 'completed' THEN customer_id END)"
      [:distinct-where {} (col "customer_id") [:= {} (col "status") "completed"]]

      "COUNT(DISTINCT CASE WHEN \"Status\" = 'won' AND \"Qty\" > 0 THEN \"Cust\" END)"
      [:distinct-where {} (col "cust") [:and {} [:= {} (col "status") "won"] [:> {} (col "qty") 0]]]))
  (testing "AVG of a CASE that is 1 or 0 is the share of rows where the condition holds"
    (is (= [:share {} [:= {} (col "status") "completed"]]
           (aggregation "AVG(CASE WHEN orders.status = 'completed' THEN 1 ELSE 0 END)")))))

(deftest ^:parallel case-as-expression-test
  (testing "any other CASE is aggregated as the expression it is"
    (are [sql clause] (= clause (aggregation sql))
      "AVG(CASE WHEN \"Status\" = 'won' THEN \"Amount\" END)"
      [:avg {} [:case {} [[[:= {} (col "status") "won"] (col "amount")]]]]

      "SUM(CASE WHEN status = 'completed' THEN amount ELSE amount / 2 END)"
      [:sum {} [:case {} [[[:= {} (col "status") "completed"] (col "amount")]] [:/ {} (col "amount") 2]]]

      "SUM(CASE WHEN status = 'completed' THEN amount WHEN status = 'pending' THEN 0 END)"
      [:sum {} [:case {} [[[:= {} (col "status") "completed"] (col "amount")] [[:= {} (col "status") "pending"] 0]]]]

      "MAX(CASE WHEN status = 'completed' THEN created_at END)"
      [:max {} [:case {} [[[:= {} (col "status") "completed"] (col "created_at")]]]])))

(deftest ^:parallel filter-spelling-test
  (testing "the FILTER and CASE spellings of one filtered aggregate convert to one clause"
    (are [a b] (= (aggregation a) (aggregation b))
      "SUM(amount) FILTER (WHERE status = 'completed')"
      "SUM(CASE WHEN status = 'completed' THEN amount END)"

      "COUNT(*) FILTER (WHERE status = 'completed')"
      "COUNT(CASE WHEN status = 'completed' THEN 1 END)"

      "COUNT(*) FILTER (WHERE status = 'completed')"
      "SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)"

      "COUNT(DISTINCT customer_id) FILTER (WHERE status = 'completed')"
      "COUNT(DISTINCT CASE WHEN status = 'completed' THEN customer_id END)"

      "COUNT(comm) FILTER (WHERE status = 'completed')"
      "COUNT(CASE WHEN status = 'completed' THEN comm END)")))

(deftest ^:parallel arithmetic-test
  (testing "arithmetic between aggregates is one aggregation: a ratio across datasets, in the fixtures' own words"
    (are [sql clause] (= clause (aggregation sql))
      "SUM(lineitem.net_amount_kept) / COUNT(DISTINCT lineitem.l_orderkey)"
      [:/ {} [:sum {} (col "net_amount_kept")] [:distinct {} (col "l_orderkey")]]

      "SUM(store_sales.ss_ext_sales_price) / COUNT(DISTINCT customer.c_customer_sk)"
      [:/ {} [:sum {} (col "ss_ext_sales_price")] [:distinct {} (col "c_customer_sk")]]

      "SUM(order.sales) / COUNT(DISTINCT order.customer_id)"
      [:/ {} [:sum {} (col "sales")] [:distinct {} (col "customer_id")]]

      "SUM(returns.return_amount) / SUM(sales.sales_amount)"
      [:/ {} [:sum {} (col "return_amount")] [:sum {} (col "sales_amount")]]

      "SUM(amount) - SUM(comm)"
      [:- {} [:sum {} (col "amount")] [:sum {} (col "comm")]]

      "SUM(amount) * 100"
      [:* {} [:sum {} (col "amount")] 100]

      "(SUM(amount) + SUM(comm)) / 2"
      [:/ {} [:+ {} [:sum {} (col "amount")] [:sum {} (col "comm")]] 2]

      "SUM(amount) FILTER (WHERE status = 'completed') / COUNT(*) FILTER (WHERE status = 'completed')"
      [:/ {}
       [:sum-where {} (col "amount") [:= {} (col "status") "completed"]]
       [:count-where {} [:= {} (col "status") "completed"]]]))
  (testing "NULLIF(..., 0) as a divisor is plain division, as it is between columns"
    (is (= [:/ {} [:sum {} (col "ss_ext_sales_price")] [:sum {} (col "s_number_employees")]]
           (aggregation "SUM(store_sales.ss_ext_sales_price) / NULLIF(SUM(store.s_number_employees), 0)")))))

(deftest ^:parallel function-over-aggregate-test
  (testing "coalesce and nullif over an aggregate"
    (are [sql clause] (= clause (aggregation sql))
      "COALESCE(SUM(amount), 0)" [:coalesce {} [:sum {} (col "amount")] 0]
      "NULLIF(SUM(amount), 0)"   [:case {} [[[:= {} [:sum {} (col "amount")] 0] nil]] [:sum {} (col "amount")]]))
  (testing "a function with a Lib equivalent over an aggregate"
    (are [sql clause] (= clause (aggregation sql))
      "SUM(items.quantity) + LOG10(COUNT(users.id))"
      [:+ {} [:sum {} (col "quantity")] [:log {} [:count-where {} [:not-null {} (col "id")]]]]

      "ROUND(SUM(amount) / COUNT(*), 2)"
      [:/ {} [:round {} [:* {} [:/ {} [:sum {} (col "amount")] [:count {}]] 100]] 100]

      "ABS(SUM(amount) - SUM(comm))"
      [:abs {} [:- {} [:sum {} (col "amount")] [:sum {} (col "comm")]]])))

(deftest ^:parallel integer-division-test
  (testing "an integer sum over a count is an integer division, truncated where the warehouse truncates, and is reported there as it is between columns"
    (are [sql] (re-find #"divides an integer by an integer" (aggregation "postgres" sql))
      "SUM(items.quantity) / COUNT(DISTINCT users.id)"
      "SUM(ss_quantity) / COUNT(*)"
      "COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*)")
    (is (= [:/ {} [:sum {} (col "quantity")] [:distinct {} (col "id")]]
           (aggregation "snowflake" "SUM(items.quantity) / COUNT(DISTINCT users.id)")))
    (is (= [:/ {} [:sum {} (col "sal")] [:count {}]]
           (aggregation "postgres" "SUM(sal) / COUNT(*)")))
    (testing "a share is a float, so it is not"
      (is (= [:/ {} [:share {} [:= {} (col "status") "completed"]] 2]
             (aggregation "postgres" "AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / 2"))))))

(deftest ^:parallel aggregate-cast-test
  (testing "a cast of an aggregate is read as a cast is: Snowflake's NUMBER is NUMBER(38, 0), which rounds"
    (is (re-find #"rounds to 0 decimal places"
                 (aggregation "snowflake" "SUM(orders.subtotal)::NUMBER / COUNT(DISTINCT customers.customer_id)")))
    (is (= [:/ {} [:float {} [:sum {} (col "subtotal")]] [:distinct {} (col "customer_id")]]
           (aggregation "postgres" "CAST(SUM(orders.subtotal) AS DECIMAL) / COUNT(DISTINCT customers.customer_id)")))))

(deftest ^:parallel bare-column-test
  (testing "a column outside an aggregate has no one value in an aggregation, and is reported: a metric naming another metric arrives this way"
    (are [sql] (re-find #"outside an aggregate" (aggregation sql))
      "SUM(price) + price"
      "amount"
      "SUM(items.quantity) * quantity_per_customer"
      "total_amount / orders__count"
      "items_quantity + COUNT(users.id)"
      "quantity_per_customer / 2"
      "CASE WHEN status = 'completed' THEN SUM(amount) END"))
  (testing "and so is an aggregation with no aggregate in it"
    (are [sql] (re-find #"(?i)no aggregate" (aggregation sql))
      "100"
      "1 + 1"
      "NULL")))

(deftest ^:parallel nested-aggregate-test
  (testing "an aggregate inside an aggregate, in its argument or its filter, has no meaning in one query and is reported"
    (are [sql] (re-find #"(?i)nested|inside" (aggregation sql))
      "SUM(MAX(price))"
      "SUM(COUNT(DISTINCT customer_id))"
      "SUM(CASE WHEN status = 'completed' THEN MAX(amount) END)"
      "SUM(amount) FILTER (WHERE COUNT(*) > 1)"
      "SUM(amount) FILTER (WHERE amount > AVG(amount))")))

(deftest ^:parallel window-function-test
  (testing "a window function's value depends on the other rows of the result, which one aggregation clause has no say over, and is reported"
    (are [sql] (re-find #"(?i)window" (aggregation sql))
      "SUM(SUM(store_sales.ss_ext_sales_price)) OVER (ORDER BY date_dim.d_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)"
      "RANK() OVER (PARTITION BY store.s_store_sk ORDER BY SUM(store_sales.ss_ext_sales_price) DESC)"
      "SUM(store_sales.ss_ext_sales_price) - LAG(SUM(store_sales.ss_ext_sales_price), 1) OVER (ORDER BY date_dim.d_year, date_dim.d_moy)"
      "RANK() OVER (PARTITION BY users.id ORDER BY SUM(items.quantity) DESC)"
      "RANK() OVER (ORDER BY revenue DESC NULLS LAST)"
      "SUM(amount) FILTER (WHERE status = 'completed') OVER ()")))

(deftest ^:parallel distinct-modifier-test
  (testing "DISTINCT under anything but COUNT has no Metabase aggregation"
    (are [sql] (re-find #"DISTINCT" (aggregation sql))
      "SUM(DISTINCT amount)"
      "AVG(DISTINCT amount)"))
  (testing "COUNT over more than one argument, or DISTINCT over all columns, is reported"
    (are [sql] (string? (aggregation sql))
      "COUNT(DISTINCT *)"
      "COUNT(DISTINCT amount, cust)"
      "COUNT(amount, cust)"
      "SUM(*)")))

(deftest ^:parallel unknown-function-test
  (testing "a function with no Lib equivalent is reported by name, around or inside an aggregate"
    (are [dialect sql function-name] (= (format "the function %s is not supported" function-name)
                                        (aggregation dialect sql))
      "bigquery" "ROUND(SAFE_DIVIDE(SUM(items.quantity), ABS(COUNT(users.id))), 2)" "safe_divide"
      "postgres" "SUM(items.quantity) + MY_WAREHOUSE_UDF(COUNT(users.id), 3)"       "my_warehouse_udf"
      "postgres" "SUM(GREATEST(amount, comm))"                                       "greatest"))
  (testing "and so is an aggregate function Metabase lacks"
    (are [sql] (string? (aggregation sql))
      "STRING_AGG(status, ',')"
      "BOOL_OR(is_returned)"
      "ARRAY_AGG(status)")))

(deftest ^:parallel mode-test
  (testing "an aggregate converts only in aggregation mode: as a value or a condition it is reported, naming it"
    (is (re-find #"(?i)sum" (expression "SUM(amount)")))
    (is (re-find #"(?i)sum" (condition "SUM(amount) > 0"))))
  (testing "and a comparison is a condition, not an aggregation"
    (is (string? (aggregation "SUM(amount) > 0")))
    (is (string? (aggregation "SUM(amount) > 0 AND COUNT(*) > 1"))))
  (testing "the other modes are unchanged"
    (is (= [:= {} (col "status") "completed"] (condition "status = 'completed'")))
    (is (= [:* {} (col "amount") 2] (expression "amount * 2")))))

(deftest ^:parallel distinct-uuids-test
  (testing "a column used more than once gets a ref of its own each time, so no two clauses share a uuid"
    (let [clause (sql-to-mbql/expression->mbql "postgres"
                                               "SUM(amount) FILTER (WHERE amount > 0) / NULLIF(SUM(amount), 0)"
                                               resolve-column
                                               {:aggregation? true})
          uuids  (keep #(when (map? %) (:lib/uuid %)) (tree-seq coll? seq clause))]
      (is (= 3 (count (filter #(= (col "amount") %) (filter vector? (tree-seq coll? seq (without-uuids clause)))))))
      (is (= (count uuids) (count (set uuids)))))))

(deftest ^:parallel aggregation-sql-test
  (testing "the converted aggregation compiles to the SQL the metric meant"
    (are [sql compiled] (= compiled (aggregation-sql sql))
      "COUNT(*)"
      "COUNT(*)"

      "COUNT(DISTINCT customer_id)"
      "count(distinct customer_id)"

      "COUNT(comm)"
      "SUM(CASE WHEN comm IS NOT NULL THEN 1 ELSE 0.0 END)"

      "SUM(amount) FILTER (WHERE status = 'completed')"
      "SUM(CASE WHEN status = ? THEN amount ELSE 0.0 END)"

      "SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END)"
      "SUM(CASE WHEN status = ? THEN amount ELSE 0.0 END)"

      "AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)"
      "SUM(CASE WHEN status = ? THEN 1 ELSE 0.0 END) / COUNT(*)"

      "SUM(net_amount_kept) / COUNT(DISTINCT l_orderkey)"
      "CAST(SUM(net_amount_kept) AS double) / NULLIF(CAST(count(distinct l_orderkey) AS double), 0.0)"

      "PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY amount)"
      "PERCENTILE_CONT(0.9) within group (order by amount)")))
