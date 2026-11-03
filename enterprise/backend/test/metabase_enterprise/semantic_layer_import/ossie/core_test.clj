(ns metabase-enterprise.semantic-layer-import.ossie.core-test
  "The Ossie source through the whole import: [[semantic-layer-import/convert!]] with `:type` `:ossie` on the TPC-H
  fixture, a document in, a serdes tree and a report out; and every other checked-in document through parse and
  resolve, pinning what converts, to what, and what is reported with which reason (see the fixtures' README for where
  they come from)."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [are deftest is testing]]
   [mb.hawk.assert-exprs]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.core :as semantic-layer-import]
   [metabase-enterprise.semantic-layer-import.ossie.test-util :as tu]
   [metabase-enterprise.semantic-layer-import.resolve :as resolve]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml])
  (:import
   (clojure.lang ExceptionInfo)))

(def ^:private tpch-config
  "The TPC-H model names Snowflake's sample database; read for Postgres, whose driver folds the unquoted names to lower
  case, with the schema mapped to `public`, where the end-to-end test's dataset is."
  {:databases      {"SNOWFLAKE_SAMPLE_DATA" tu/db}
   :driver         :postgres
   :creator-email  "admin@example.com"
   :schema-mapping {"TPCH_SF1" "public"}})

(defn- yaml-fld
  "A field ref as the YAML reads back, clause names as strings, on a TPC-H table in `public`."
  ([table column]
   ["field" {} [tu/db "public" table column]])
  ([table column source-column]
   ["field" {:source-field [tu/db "public" "lineitem" source-column]} [tu/db "public" table column]]))

(deftest convert!-test
  (mt/with-temp-dir [dir nil]
    (let [out-dir   (str (io/file dir "out"))
          report    (semantic-layer-import/convert! {:type :ossie, :raw tu/tpch-document, :out-dir out-dir
                                                     :config tpch-config})
          read-yaml #(yaml/parse-string (slurp (io/file out-dir %)))
          card      (fn [metric-name]
                      (read-yaml (:path (m/find-first #(= metric-name (:name %)) (:converted report)))))
          stage     (fn [metric-name]
                      (-> (card metric-name) :dataset_query :stages first))]
      (is (mr/validate ::semantic-layer-import/report report))
      (testing "every metric converts; the SQL dimension is reported on each"
        (is (=? [{:kind :metric, :name "net_revenue", :path "collections/main/ossie_metrics/net_revenue.yaml"
                  :notes [], :unsupported-dimensions [{:name "order_year"
                                                       :reason #"dimension \"order_year\" is the SQL expression.*"}]}
                 {:kind :metric, :name "gross_revenue", :path "collections/main/ossie_metrics/gross_revenue.yaml"}
                 {:kind :metric, :name "order_count", :path "collections/main/ossie_metrics/order_count.yaml"}
                 {:kind :metric, :name "average_order_value"
                  :path "collections/main/ossie_metrics/average_order_value.yaml"}]
                (:converted report)))
        (is (= [] (:unsupported report)))
        (is (= [] (:errors report))))
      (testing "the collection is named after the tool"
        (is (= {:name "ossie metrics", :description "Metrics imported from ossie."}
               (select-keys (read-yaml "collections/main/ossie_metrics.yaml") [:name :description]))))
      (testing "a named expression is inlined where the metric refers to it, columns named as the warehouse stores them"
        (is (=? {:source-table [tu/db "public" "lineitem"]
                 :aggregation  [["sum" {}
                                 ["case" {}
                                  [[["not" {} ["=" {} (yaml-fld "lineitem" "l_returnflag") "R"]]
                                    ["*" {} (yaml-fld "lineitem" "l_extendedprice")
                                     ["-" {} 1 (yaml-fld "lineitem" "l_discount")]]]]
                                  0]]]}
                (stage "net_revenue"))))
      (testing "a ratio of aggregates is one aggregation"
        (is (=? {:aggregation [["/" {}
                                ["sum" {} ["case" {} [[["not" {} ["=" {} (yaml-fld "lineitem" "l_returnflag") "R"]]
                                                       ["*" {} (yaml-fld "lineitem" "l_extendedprice")
                                                        ["-" {} 1 (yaml-fld "lineitem" "l_discount")]]]] 0]]
                                ["distinct" {} (yaml-fld "lineitem" "l_orderkey")]]]}
                (stage "average_order_value"))))
      (testing "a metric over another dataset is over that table"
        (is (=? {:source-table [tu/db "public" "orders"]
                 :aggregation  [["distinct" {} (yaml-fld "orders" "o_orderkey")]]}
                (stage "order_count"))))
      (testing "the dimension set: the table's own, its one time dimension the default, and the joined dataset's"
        (let [dimensions (:dimensions (card "net_revenue"))]
          (is (= [["l_orderkey" nil "main"] ["l_linenumber" nil "main"] ["l_partkey" nil "main"]
                  ["return_flag" nil "main"] ["ship_date" true "main"]
                  ["o_orderkey" nil "connection"] ["o_custkey" nil "connection"] ["order_date" nil "connection"]
                  ["order_priority" nil "connection"]]
                 (map (juxt :name :default (comp :type :group)) dimensions)))
          (testing "a dimension without a label is named like a Field; the groups are named after the relations"
            (is (= ["L Orderkey" "LINEITEM" "ORDERS"]
                   [(:display-name (first dimensions)) (-> dimensions first :group :display-name)
                    (-> dimensions last :group :display-name)])))
          (is (= (yaml-fld "orders" "o_orderpriority" "l_orderkey")
                 (:target (last (:dimension_mappings (card "net_revenue"))))))))
      (testing "the metric's description and metadata-free card"
        (is (= "Number of orders." (:description (card "order_count"))))))))

(deftest convert!-both-shapes-test
  (testing "the 0.2.0.dev0 document writes the same tree as the 0.1.1 one, apart from nothing"
    (mt/with-temp-dir [dir nil]
      (let [tree (fn [filename]
                   (let [out-dir (str (io/file dir (str (hash filename))))
                         report  (semantic-layer-import/convert! {:type :ossie, :raw filename, :out-dir out-dir
                                                                  :config tpch-config})]
                     (into {} (map (fn [{:keys [path]}] [path (slurp (io/file out-dir path))])) (:converted report))))]
        (is (= (tree tu/tpch-document) (tree tu/tpch-document-v02)))))))

(deftest convert!-dialect-test
  (testing "the dialect the document is read in says which warehouse it was written for, and the driver has to agree"
    (mt/with-temp-dir [dir nil]
      (is (thrown-with-msg? ExceptionInfo #"written for the warehouse \"SNOWFLAKE\", which Metabase connects to with the :snowflake driver, but the config's :driver is :postgres"
                            (semantic-layer-import/convert! {:type    :ossie
                                                             :raw     tu/tpch-document
                                                             :options {:dialect "SNOWFLAKE"}
                                                             :out-dir (str (io/file dir "out"))
                                                             :config  tpch-config}))))))

(deftest ^:parallel compliance-ladder-test
  (testing "every rung of the portability ladder converts, the bare and qualified forms alike"
    ;; the ladder's dataset is `samples.sales.orders`: schema `sales`
    (let [amount      (tu/fld "sales" "orders" "amount")
          order-id    (tu/fld "sales" "orders" "order_id")
          customer-id (tu/fld "sales" "orders" "customer_id")
          status      (tu/fld "sales" "orders" "status")]
      (are [file metric clause] (= clause (tu/aggregation (tu/resolve-file (tu/fixture (str "apache/compliance/portability/" file))) metric))
        "m0_ansi_qualified.ossie.yaml"       "total_amount"       [:sum {} amount]
        "m0_ossiesql_qualified.ossie.yaml"   "total_amount"       [:sum {} amount]
        "m0_sum_bare.ossie.yaml"             "total_amount"       [:sum {} amount]
        "m1_scalar_field.ossie.yaml"         "total_amount"       [:sum {} amount]
        "m2_aggregates_qualified.ossie.yaml" "sum_amount"         [:sum {} amount]
        "m2_aggregates_qualified.ossie.yaml" "count_orders"       [:count {} order-id]
        "m2_aggregates_qualified.ossie.yaml" "distinct_customers" [:distinct {} customer-id]
        "m2_aggregates_qualified.ossie.yaml" "avg_amount"         [:avg {} amount]
        "m2_aggregates_qualified.ossie.yaml" "min_amount"         [:min {} amount]
        "m2_aggregates_qualified.ossie.yaml" "max_amount"         [:max {} amount]
        "m2_aggregates_bare.ossie.yaml"      "count_orders"       [:count {} order-id]
        "m3_filtered_agg_qualified.ossie.yaml" "completed_amount" [:sum-where {} amount [:= {} status "completed"]]
        "m3_filtered_agg_bare.ossie.yaml"      "completed_amount" [:sum-where {} amount [:= {} status "completed"]])
      (testing "the ladder's datasets declare no dimension, so a metric has no curated dimensions, and reports none"
        (let [resolved (tu/resolve-file (tu/fixture "apache/compliance/portability/m2_aggregates_qualified.ossie.yaml"))]
          (is (= [] (:dimensions (first (:metrics resolved)))))
          (is (= {} (:unsupported-dimensions (tu/outcome resolved "sum_amount")))))))))

(deftest ^:parallel scott-test
  (testing "dataset-scoped metrics, each over its own dataset, named dataset.metric"
    (let [resolved (tu/resolve-file (tu/fixture "apache/compliance/scott/scott_model.ossie.yaml"))]
      (is (= {"emp.sum_sal"         [:sum {} (tu/fld "scott" "emp" "sal")]
              "emp.emp_count"       [:count {}]
              "emp.comm_count"      [:count {} (tu/fld "scott" "emp" "comm")]
              "emp.sum_comm"        [:sum {} (tu/fld "scott" "emp" "comm")]
              "dept.dept_count"     [:count {}]
              "salgrade.grade_count" [:count {}]}
             (into {} (map (fn [m] [(-> m :ir :name) (tu/aggregation resolved (-> m :ir :name))])) (:metrics resolved))))
      (is (= [] (:unsupported resolved)))
      (testing "a two-part source is a schema and a table in no database; fields without a dimension make no dimension set"
        (is (= [tu/db "scott" "emp"] (:source-table (tu/outcome resolved "emp.sum_sal"))))
        (is (= [] (:dimensions (first (:metrics resolved)))))))))

(deftest ^:parallel renamed-fields-test
  (testing "metrics name fields, which are inlined as the expressions over the source's columns"
    (let [resolved (tu/resolve-file (tu/fixture "apache/examples/renamed_fields.yaml"))]
      (is (= {"total_revenue"  [:sum {} [:/ {} (tu/fld "orders" "total_cents") 100.0]]
              "order_count"    [:distinct {} (tu/fld "orders" "o_orderkey")]
              "customer_count" [:distinct {} (tu/fld "orders" "o_custkey")]
              "gross_revenue"  [:sum {} (tu/fld "orders" "o_totalprice")]}
             (into {} (map (fn [m] [(-> m :ir :name) (tu/aggregation resolved (-> m :ir :name))])) (:metrics resolved)))))))

(deftest ^:parallel tpcds-test
  (testing "the TPC-DS example: aggregates over the fact table convert, window functions and a sum over a joined dataset are reported"
    (let [resolved (tu/resolve-file (tu/fixture "apache/examples/tpcds_semantic_model.yaml"))
          price    (tu/fld "store_sales" "ss_ext_sales_price")]
      (is (= [:sum {} (tu/fld "store_sales" "ss_quantity")] (tu/aggregation resolved "store_sales.total_quantity")))
      (is (= [:sum {} price] (tu/aggregation resolved "total_sales")))
      (is (= [:sum {} (tu/fld "store_sales" "ss_net_profit")] (tu/aggregation resolved "total_profit")))
      (is (= [:sum {} price] (tu/aggregation resolved "sales_by_brand")))
      (testing "a distinct count over a joined dataset is safe, and is reached through the relationship's column"
        (is (= [:/ {} [:sum {} price] [:distinct {} (tu/fld "public" "customer" "c_customer_sk" ["store_sales" "ss_customer_sk"])]]
               (tu/aggregation resolved "customer_lifetime_value"))))
      (is (re-find #"^expr \"SUM\(store_sales\.ss_ext_sales_price\) / NULLIF\(SUM\(store\.s_number_employees\), 0\)\": SUM\(store\.s_number_employees\) aggregates \"s_number_employees\" of dataset \"store\", which \"store_sales\" reaches on the one side of a relationship"
                   (tu/unsupported resolved "store_productivity")))
      (are [metric] (re-find #"is a window function, whose value depends on the other rows of the result"
                             (tu/unsupported resolved metric))
        "cumulative_sales"
        "brand_rank_in_store"
        "monthly_sales_change")
      (testing "the computed dimension of the customer dataset is reported in each dimension set"
        (is (= {"customer_full_name" (str "dimension \"customer_full_name\" is the SQL expression \"c_first_name || ' '"
                                          " || c_last_name\"; a dimension mapping targets a column, not SQL")}
               (:unsupported-dimensions (tu/outcome resolved "total_sales"))))))
    (testing "the 0.1.1 shape of the example, which has no window metrics and no dataset-scoped ones, converts the same"
      (let [resolved (tu/resolve-file (tu/fixture "apache/examples/tpcds_semantic_model.osi-0.1.1.yaml"))]
        (is (= ["total_sales" "total_profit" "customer_lifetime_value" "sales_by_brand"]
               (map (comp :name :ir) (:metrics resolved))))
        (is (= ["store_productivity"] (map :name (:unsupported resolved))))
        (is (re-find #"SUM\(store\.s_number_employees\) aggregates \"s_number_employees\" of dataset \"store\""
                     (tu/unsupported resolved "store_productivity")))))))

(deftest ^:parallel two-hop-reference-test
  (testing "a reference two relationships away parses with its path, and the resolve stage reports it: a dimension mapping is one join"
    (let [ir       (tu/ir (tu/shop-document [(tu/metric "eu_sales" "SUM(orders.amount) FILTER (WHERE regions.region_name = 'EU')")]
                                            :edit #(-> %
                                                       (update :datasets conj {:name        "regions"
                                                                               :source      "shop.public.regions"
                                                                               :primary_key ["id"]
                                                                               :fields      [(tu/dimension "id") (tu/dimension "region_name")]})
                                                       (update :relationships conj {:name         "customers_to_regions"
                                                                                    :from         "customers"
                                                                                    :to           "regions"
                                                                                    :from_columns ["segment"]
                                                                                    :to_columns   ["id"]}))))
          resolved (resolve/resolve-semantic-layer {:databases {"shop" tu/db}, :driver :postgres, :creator-email "admin@example.com"}
                                                   ir)]
      (is (= [] (:unsupported ir)))
      (is (= {:kind :dimension, :path ["orders_to_customers" "customers_to_regions"], :name "region_name", :bucket nil}
             (-> ir :metrics first :aggregation :references (get "__ossie_ref_1__"))))
      (is (re-find #"is reached through more than one join \(\"orders_to_customers\", \"customers_to_regions\"\)"
                   (tu/unsupported resolved "eu_sales"))))))

(deftest ^:parallel duckdb-ossie-fixtures-test
  (let [resolve-fixture #(tu/resolve-file (tu/fixture (str "duckdb_ossie/" %)))]
    (testing "a model-scoped metric with a bare field name reads as the one dataset's field"
      (let [resolved (resolve-fixture "invalid/unqualified_metric.json")]
        (is (= [:sum {} (tu/fld "store_sales" "ss_ext_sales_price")] (tu/aggregation resolved "total_sales")))))
    (testing "a field that is not declared is reported, as the spec says it is invalid"
      (is (= "expr \"SUM(store_sales.ss_bogus)\": dataset \"store_sales\" has no field \"ss_bogus\""
             (tu/unsupported (resolve-fixture "undeclared_column_model.json") "total_sales"))))
    (testing "SQL that does not parse is reported with the parser's diagnostic"
      (is (re-find #"^expr \"SUM\(store_sales\.ss_ext_sales_price\) / NULLIF\(SUM\(\": could not parse"
                   (tu/unsupported (resolve-fixture "invalid/malformed_expression.json") "store_productivity"))))
    (testing "a relationship to a dataset the model does not have is a join that cannot be made"
      (let [ir       (tu/parse-file (tu/fixture "duckdb_ossie/invalid/dangling_relationship.json"))
            resolved (resolve-fixture "invalid/dangling_relationship.json")]
        (is (= {:name        "store_sales_to_date"
                :reason      "relationship \"store_sales_to_date\" leads to dataset \"date_dimension\", which the model does not have"
                :unreachable []}
               (first (get-in ir [:tables "store_sales" :joins]))))
        (testing "nothing is behind it, so the dimension set reports nothing for it; the metrics convert"
          (is (= {"customer_full_name" (str "dimension \"customer_full_name\" is the SQL expression \"c_first_name || ' '"
                                            " || c_last_name\"; a dimension mapping targets a column, not SQL")}
                 (:unsupported-dimensions (tu/outcome resolved "total_sales"))))
          (is (= [:sum {} (tu/fld "store_sales" "ss_ext_sales_price")] (tu/aggregation resolved "total_sales"))))))
    (testing "a relationship that does not land on a key of its dataset would multiply the rows"
      (is (re-find #"relationship \"store_sales_to_store\" leads to \"s_city\" of dataset \"store\", which is not on its own among its keys \(\"s_store_id\", \"s_store_sk\"\)"
                   (get (:unsupported-dimensions (tu/outcome (resolve-fixture "many_to_many_model.json") "total_sales"))
                        "s_store_name"))))
    (testing "two relationships to a dataset are two paths, and the shorter one is taken"
      (is (= [:/ {} [:sum {} (tu/fld "store_sales" "ss_ext_sales_price")]
              [:distinct {} (tu/fld "public" "customer" "c_customer_sk" ["store_sales" "ss_customer_sk"])]]
             (tu/aggregation (resolve-fixture "ambiguous_path_model.json") "customer_lifetime_value"))))
    (testing "a filtered aggregate through a joined dimension converts; a bare COUNT(*) over a five-dataset model has no dataset"
      (let [resolved (resolve-fixture "grain_model.json")]
        (is (= [:sum-where {} (tu/fld "store_sales" "ss_ext_sales_price")
                [:= {} (tu/fld "public" "item" "i_category" ["store_sales" "ss_item_sk"]) "Books"]]
               (tu/aggregation resolved "books_sales")))
        (is (= (str "expr \"COUNT(*)\": the metric refers to no dataset, and the model has 5; a model-scoped metric"
                    " names the dataset of every field it aggregates")
               (tu/unsupported resolved "transaction_count")))))
    (testing "field expressions are over the source's columns, so a field named like another field does not refer to it"
      (is (= [:count {} (tu/fld "t" "k")]
             (tu/aggregation (resolve-fixture "invalid/field_cycle.json") "m")))
      (is (= [:sum {} (tu/fld "sales" "amt")] (tu/aggregation (resolve-fixture "nested_field_model.json") "total"))))
    (testing "OSSIE_SQL_2026's own functions are reported by the SQL converter when a metric reaches them"
      (let [resolved (resolve-fixture "ossie_sql_2026_model.json")]
        (is (= [:count {} (tu/fld "main" "orders" "id")] (tu/aggregation resolved "order_count")))
        (is (= "expr \"SUM(ZEROIFNULL(o.discount))\": dataset \"o\" has no field \"discount\""
               (tu/unsupported resolved "discount_total_ossie")))))
    (testing "documents whose fields use OSSIE_SQL_2026's functions, and which declare no metric, convert nothing and report nothing"
      (are [file] (= {:metrics [], :unsupported [], :errors []}
                     (select-keys (resolve-fixture file) [:metrics :unsupported :errors]))
        "invalid/ossie_sql_2026_arity.json"
        "invalid/ossie_sql_2026_date_part.json"
        "invalid/ossie_sql_2026_format_model.json"
        "invalid/ossie_sql_2026_regexp_like.json"
        "invalid/semantic_model_wrapper.json"))
    (testing "the hostile YAML converts its one metric"
      (is (= [:count {} (tu/fld "t" "k")] (tu/aggregation (resolve-fixture "yaml_edge_cases.yaml") "m"))))))
