(ns metabase-enterprise.semantic-layer-import.ossie.metric-sql-test
  "[[metabase-enterprise.semantic-layer-import.ossie.metric-sql]]: a metric's SQL with placeholders for its field
  references, the base dataset and the paths to the others, and what is reported."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase-enterprise.semantic-layer-import.ossie.metric-sql :as metric-sql]
   [metabase-enterprise.semantic-layer-import.unsupported :as unsupported])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- dataset [dataset-name & fields]
  [dataset-name {:name   dataset-name
                 :fields (into {}
                               (map (fn [[field-name kind]] [field-name {:name field-name, :kind kind}]))
                               fields)}])

(def ^:private tpch
  "The TPC-H model as the metric SQL sees it: a chain of many-to-one relationships."
  {:datasets      (into {} [(dataset "lineitem" ["net_amount_kept" :expression] ["l_orderkey" :dimension]
                                     ["extended_price" :expression] ["ship_date" :dimension])
                            (dataset "orders" ["o_orderkey" :dimension] ["o_custkey" :dimension]
                                     ["total_price" :expression] ["order_date" :dimension])
                            (dataset "customer" ["c_custkey" :dimension] ["market_segment" :dimension])
                            (dataset "nation" ["n_nationkey" :dimension] ["nation_name" :dimension])])
   :relationships [{:name "lineitem_to_orders", :from "lineitem", :to "orders"}
                   {:name "orders_to_customer", :from "orders", :to "customer"}
                   {:name "customer_to_nation", :from "customer", :to "nation"}]})

(defn- aggregation
  "What [[metric-sql/aggregation]] makes of `text` over [[tpch]] in the default dialect, or the reason it is
  reported."
  ([text]
   (aggregation nil text))
  ([scope text]
   (aggregation tpch scope text))
  ([model scope text]
   (try
     (metric-sql/aggregation model scope nil text)
     (catch ExceptionInfo e
       (if (unsupported/exception? e)
         {:unsupported (ex-message e)}
         (throw e))))))

(defn- reason [& args]
  (:unsupported (apply aggregation args)))

(deftest ^:parallel placeholders-test
  (testing "every field reference becomes a placeholder, one per distinct reference, with what it stood for"
    (is (= {:table       "lineitem"
            :aggregation {:text       "SUM(lineitem.net_amount_kept) / COUNT(DISTINCT lineitem.l_orderkey)"
                          :sql        "SUM(__ossie_ref_0__) / COUNT(DISTINCT __ossie_ref_1__)"
                          :references {"__ossie_ref_0__" {:kind :expression, :path [], :name "net_amount_kept"}
                                       "__ossie_ref_1__" {:kind :dimension, :path [], :name "l_orderkey", :bucket nil}}}}
           (aggregation "SUM(lineitem.net_amount_kept) / COUNT(DISTINCT lineitem.l_orderkey)"))))
  (testing "a reference written twice is one placeholder"
    (is (= "SUM(__ossie_ref_0__) / AVG(__ossie_ref_0__)"
           (-> (aggregation "SUM(lineitem.extended_price) / AVG(lineitem.extended_price)") :aggregation :sql))))
  (testing "the SQL is as the parser renders it: keywords upper-cased, spacing normalized, the text kept as written"
    (is (= {:text "sum( lineitem . extended_price )", :sql "SUM(__ossie_ref_0__)"}
           (-> (aggregation "sum( lineitem . extended_price )") :aggregation (select-keys [:text :sql])))))
  (testing "a quoted reference is matched as rendered, and a string literal that spells one is left alone"
    (is (= "SUM(CASE WHEN __ossie_ref_0__ = 'lineitem.extended_price' THEN __ossie_ref_1__ ELSE 0 END)"
           (-> (aggregation "SUM(CASE WHEN \"lineitem\".\"l_orderkey\" = 'lineitem.extended_price' THEN lineitem.extended_price ELSE 0 END)")
               :aggregation :sql))))
  (testing "a reference does not match inside a longer one"
    (let [model {:datasets      (into {} [(dataset "t" ["a" :expression] ["ab" :expression])])
                 :relationships []}]
      (is (= "SUM(__ossie_ref_0__) + SUM(__ossie_ref_1__)"
             (-> (aggregation model nil "SUM(t.a) + SUM(t.ab)") :aggregation :sql))))))

(deftest ^:parallel scope-test
  (testing "a dataset-scoped metric names its own fields bare, and is over its dataset"
    (is (= {:table       "orders"
            :aggregation {:text       "SUM(total_price)"
                          :sql        "SUM(__ossie_ref_0__)"
                          :references {"__ossie_ref_0__" {:kind :expression, :path [], :name "total_price"}}}}
           (aggregation "orders" "SUM(total_price)")))
    (is (= "orders" (:table (aggregation "orders" "COUNT(*)")))))
  (testing "a dataset-scoped metric may qualify its own dataset, but no other"
    (is (= "orders" (:table (aggregation "orders" "SUM(orders.total_price)"))))
    (is (= (str "lineitem.net_amount_kept refers to dataset \"lineitem\" from a metric of dataset \"orders\"; a metric"
                " that spans datasets is model-scoped")
           (reason "orders" "SUM(lineitem.net_amount_kept)"))))
  (testing "a model-scoped metric's bare name is the field of the one dataset that declares it"
    (is (= {:kind :expression, :path [], :name "net_amount_kept"}
           (-> (aggregation "SUM(net_amount_kept)") :aggregation :references (get "__ossie_ref_0__"))))
    (is (= "no dataset has a field \"bogus\"" (reason "SUM(bogus)")))
    (let [model {:datasets      (into {} [(dataset "a" ["id" :dimension]) (dataset "b" ["id" :dimension])])
                 :relationships [{:name "a_to_b", :from "a", :to "b"}]}]
      (is (= "\"id\" is a field of more than one dataset (\"a\", \"b\"); a model-scoped metric names a field as dataset.field"
             (reason model nil "COUNT(DISTINCT id)")))))
  (testing "names match ignoring case, as SQL does"
    (is (= {:table "lineitem", :references {"__ossie_ref_0__" {:kind :expression, :path [], :name "net_amount_kept"}}}
           (-> (aggregation "SUM(LineItem.NET_AMOUNT_KEPT)") (update :aggregation :references)
               (as-> result {:table (:table result), :references (:aggregation result)})))))
  (testing "what does not exist"
    (is (= "nope.x refers to dataset \"nope\", which the model does not have" (reason "SUM(nope.x)")))
    (is (= "dataset \"lineitem\" has no field \"bogus\"" (reason "SUM(lineitem.bogus)")))
    (is (= "a.b.c names more than a dataset and a field" (reason "SUM(a.b.c)")))))

(deftest ^:parallel base-dataset-test
  (testing "one dataset referred to is the base"
    (is (= "orders" (:table (aggregation "COUNT(DISTINCT orders.o_orderkey)")))))
  (testing "of several, the one that reaches the others through the relationships, each by its shortest path"
    (is (= {:table       "lineitem"
            :aggregation {:text       "SUM(lineitem.net_amount_kept) FILTER (WHERE customer.market_segment = 'BUILDING') / COUNT(DISTINCT orders.o_orderkey)"
                          :sql        "SUM(__ossie_ref_0__) FILTER(WHERE __ossie_ref_1__ = 'BUILDING') / COUNT(DISTINCT __ossie_ref_2__)"
                          :references {"__ossie_ref_0__" {:kind :expression, :path [], :name "net_amount_kept"}
                                       "__ossie_ref_1__" {:kind :dimension, :name "market_segment", :bucket nil
                                                          :path ["lineitem_to_orders" "orders_to_customer"]}
                                       "__ossie_ref_2__" {:kind :dimension, :name "o_orderkey", :bucket nil
                                                          :path ["lineitem_to_orders"]}}}}
           (aggregation "SUM(lineitem.net_amount_kept) FILTER (WHERE customer.market_segment = 'BUILDING') / COUNT(DISTINCT orders.o_orderkey)"))))
  (testing "no dataset reaches the others"
    (let [model {:datasets      (into {} [(dataset "a" ["x" :expression]) (dataset "b" ["y" :expression])])
                 :relationships []}]
      (is (= (str "no dataset among \"a\", \"b\" reaches the others through the model's relationships; a metric that"
                  " spans datasets is over the one whose many-to-one relationships lead to every dataset it refers to")
             (reason model nil "SUM(a.x) + MAX(b.y)")))))
  (testing "several datasets reach the others"
    (let [model {:datasets      (into {} [(dataset "a" ["x" :expression]) (dataset "b" ["y" :expression])])
                 :relationships [{:name "a_to_b", :from "a", :to "b"} {:name "b_to_a", :from "b", :to "a"}]}]
      (is (re-find #"^\"a\", \"b\" each reach the others" (reason model nil "MAX(a.x) + MAX(b.y)")))))
  (testing "two shortest paths to a dataset"
    (let [model {:datasets      (into {} [(dataset "a" ["x" :expression]) (dataset "b" ["y" :dimension])])
                 :relationships [{:name "a_to_b", :from "a", :to "b"} {:name "a_to_b_again", :from "a", :to "b"}]}]
      (is (= (str "dataset \"b\" is reached from \"a\" by more than one path of the same length through the model's"
                  " relationships; nothing says which")
             (reason model nil "SUM(a.x) + MAX(b.y)")))))
  (testing "a metric that names no dataset"
    (is (= (str "the metric refers to no dataset, and the model has 4; a model-scoped metric names the dataset of"
                " every field it aggregates")
           (reason "COUNT(*)")))
    (let [model {:datasets (into {} [(dataset "only" ["x" :expression])]), :relationships []}]
      (is (= "only" (:table (aggregation model nil "COUNT(*)")))))))

(deftest ^:parallel fan-out-test
  (testing "an aggregate over a field of a joined dataset would count it once per base row, and is reported"
    (are [text aggregate] (= (format (str "%s aggregates \"total_price\" of dataset \"orders\", which \"lineitem\""
                                          " reaches on the one side of a relationship: each value would count once"
                                          " per \"lineitem\" row, not once; over a joined dataset only MIN, MAX and"
                                          " COUNT(DISTINCT ...) give the same answer either way")
                                     aggregate)
                             (reason text))
      "SUM(orders.total_price) / COUNT(DISTINCT lineitem.l_orderkey)"         "SUM(orders.total_price)"
      "AVG(orders.total_price) + MAX(lineitem.extended_price)"                "AVG(orders.total_price)"
      "COUNT(orders.total_price) + SUM(lineitem.extended_price)"              "COUNT(orders.total_price)"
      "SUM(COALESCE(orders.total_price, 0)) + SUM(lineitem.extended_price)"   "SUM(COALESCE(orders.total_price, 0))"
      "SUM(CASE WHEN lineitem.l_orderkey > 0 THEN orders.total_price END) + SUM(lineitem.extended_price)"
      "SUM(CASE WHEN lineitem.l_orderkey > 0 THEN orders.total_price END)"))
  (testing "MIN, MAX and COUNT(DISTINCT ...) give the same answer either way"
    (are [text] (= "lineitem" (:table (aggregation text)))
      "MAX(orders.total_price) - MIN(orders.total_price) + SUM(lineitem.extended_price)"
      "COUNT(DISTINCT orders.o_orderkey) + SUM(lineitem.extended_price)"
      "SUM(lineitem.extended_price) / COUNT(DISTINCT customer.c_custkey)"))
  (testing "a joined field in a condition is a test on each base row, not a value counted"
    (are [text] (= "lineitem" (:table (aggregation text)))
      "SUM(CASE WHEN customer.market_segment = 'BUILDING' THEN lineitem.net_amount_kept ELSE 0 END)"
      "SUM(lineitem.extended_price) FILTER (WHERE orders.o_custkey > 10)"
      "COUNT(*) FILTER (WHERE nation.nation_name = 'FRANCE') + SUM(lineitem.extended_price)"))
  (testing "an argument that also takes from the base dataset is a value per base row"
    (is (= "lineitem" (:table (aggregation "SUM(lineitem.extended_price * orders.total_price)"))))))

(deftest ^:parallel parse-test
  (testing "SQL that does not parse is reported with the parser's diagnostic"
    (is (re-find #"^could not parse \"SUM\(lineitem\.extended_price\) / NULLIF\(SUM\(\": ParseError"
                 (reason "SUM(lineitem.extended_price) / NULLIF(SUM("))))
  (testing "a window function's references resolve; the window itself is the resolve stage's to report"
    (is (= {"__ossie_ref_0__" {:kind :expression, :path [], :name "extended_price"}
            "__ossie_ref_1__" {:kind :dimension, :path ["lineitem_to_orders"], :name "order_date", :bucket nil}}
           (-> (aggregation "SUM(SUM(lineitem.extended_price)) OVER (ORDER BY orders.order_date)")
               :aggregation :references))))
  (testing "a field written in the case of a keyword cannot be told apart from the keyword and is reported"
    (let [model {:datasets (into {} [(dataset "t" ["DATE" :dimension] ["x" :expression])]), :relationships []}]
      (testing "qualified, the reference is told apart"
        (is (= "COUNT(__ossie_ref_0__) + MAX(CAST(__ossie_ref_1__ AS DATE))"
               (-> (aggregation model nil "COUNT(t.DATE) + MAX(CAST(t.x AS DATE))") :aggregation :sql))))
      (testing "bare, it is not"
        (is (= (str "DATE occurs 1 times in \"COUNT(DATE) + MAX(CAST(x AS DATE))\" but was found 2 times as an"
                    " identifier; the import cannot tell the references apart from the rest of the SQL")
               (reason model "t" "COUNT(DATE) + MAX(CAST(x AS DATE))")))))))
