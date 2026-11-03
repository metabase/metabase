(ns metabase-enterprise.semantic-layer-import.ossie.parse-test
  "[[metabase-enterprise.semantic-layer-import.ossie.parse]]: what the IR gets of an Ossie document, on the TPC-H
  fixture in both shapes and on small documents built here."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.ossie.parse :as parse]
   [metabase-enterprise.semantic-layer-import.ossie.test-util :as tu]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase.util.malli.registry :as mr])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest ^:parallel tpch-ir-test
  (let [ir (tu/parse tu/tpch-document)]
    (is (mr/validate ::ir/semantic-layer ir))
    (testing "the source is the tool, the document's version and the model's name; the warehouse is unknown for ANSI SQL"
      (is (= {:tool "ossie", :version "0.1.1", :project "tpch_revenue"} (:source ir)))
      (is (= {:type nil, :driver nil} (:warehouse ir))))
    (testing "a dataset is a table over the relation its source names, the dataset's name an alias of it"
      (let [{:keys [relation aliases label description]} (get-in ir [:tables "lineitem"])]
        (is (= {:database "SNOWFLAKE_SAMPLE_DATA", :schema "TPCH_SF1", :table "LINEITEM", :quoted #{}} relation))
        (is (= #{"lineitem"} aliases))
        (is (nil? label))
        (is (= "Order lines. Grain is one row per order line; revenue is measured here." description))))
    (testing "a field with a dimension is a dimension, a time one when is_time says so"
      (is (= [["l_orderkey" :categorical] ["l_linenumber" :categorical] ["l_partkey" :categorical]
              ["return_flag" :categorical] ["ship_date" :time]]
             (map (juxt :name :type) (get-in ir [:tables "lineitem" :dimensions]))))
      (is (= {:name        "ship_date"
              :type        :time
              :expr        "L_SHIPDATE"
              :grain       nil
              :validity    nil
              :label       nil
              :description "Date the line was shipped. Use order_date, not ship_date, for revenue over time."}
             (last (get-in ir [:tables "lineitem" :dimensions])))))
    (testing "a field without one is a named expression"
      (is (= [["extended_price" "L_EXTENDEDPRICE"]
              ["net_amount" "L_EXTENDEDPRICE * (1 - L_DISCOUNT)"]
              ["net_amount_kept" "CASE WHEN L_RETURNFLAG <> 'R' THEN L_EXTENDEDPRICE * (1 - L_DISCOUNT) ELSE 0 END"]]
             (map (juxt :name :expr) (get-in ir [:tables "lineitem" :expressions])))))
    (testing "a field over a bare column documents the column, typed by the field's datatype, as written"
      (is (= {"L_ORDERKEY"     :type/Integer
              "L_LINENUMBER"   :type/Integer
              "L_PARTKEY"      :type/Integer
              "L_RETURNFLAG"   :type/Text
              "L_SHIPDATE"     :type/Date
              "L_EXTENDEDPRICE" :type/Decimal}
             (update-vals (get-in ir [:tables "lineitem" :columns]) :base-type)))
      (is (= {:name "L_SHIPDATE", :data-type nil, :base-type :type/Date, :quoted? false
              :description "Date the line was shipped. Use order_date, not ship_date, for revenue over time."}
             (get-in ir [:tables "lineitem" :columns "L_SHIPDATE"]))))
    (testing "the primary key's fields are the table's keys"
      (is (= [{:name "l_orderkey", :expr "L_ORDERKEY"} {:name "l_linenumber", :expr "L_LINENUMBER"}]
             (get-in ir [:tables "lineitem" :keys]))))
    (testing "a relationship is a join from its many side through its field's column"
      (is (= [{:name "lineitem_to_orders", :table "orders", :source-column "L_ORDERKEY"}]
             (get-in ir [:tables "lineitem" :joins])))
      (is (= [{:name "orders_to_customer", :table "customer", :source-column "O_CUSTKEY"}]
             (get-in ir [:tables "orders" :joins])))
      (is (= [] (get-in ir [:tables "region" :joins]))))
    (testing "a metric is a simple metric over its base dataset, aggregated by its SQL with placeholders"
      (is (= {:type            :simple
              :name            "net_revenue"
              :unique-id       "tpch_revenue.net_revenue"
              :label           "net_revenue"
              :description     (str "Revenue, the company definition: extended price after discount, excluding"
                                    " returned lines, before tax. Also called sales or net sales. Use this metric"
                                    " whenever a question asks for revenue or sales.\n")
              :filters         []
              :fill-nulls-with nil
              :time-grain      nil
              :meta            {:datatype "Decimal", :ai_context "Synonyms: revenue, sales, net sales"}
              :table           "lineitem"
              :aggregation     {:text       "SUM(lineitem.net_amount_kept)"
                                :sql        "SUM(__ossie_ref_0__)"
                                :references {"__ossie_ref_0__" {:kind :expression, :path [], :name "net_amount_kept"}}}
              :time-dimension  "ship_date"}
             (tu/metric-named (:metrics ir) "net_revenue"))))
    (testing "the metric's time dimension is its base dataset's one time dimension; orders has two, so none"
      (is (= [["net_revenue" "lineitem" "ship_date"]
              ["gross_revenue" "lineitem" "ship_date"]
              ["order_count" "orders" nil]
              ["average_order_value" "lineitem" "ship_date"]]
             (map (juxt :name :table :time-dimension) (:metrics ir)))))
    (is (= [] (:unsupported ir)))))

(deftest ^:parallel both-shapes-test
  (testing "the 0.1.1 and 0.2.0.dev0 documents of the TPC-H model parse to the same IR, apart from the version"
    (let [old (tu/parse tu/tpch-document)
          new (tu/parse tu/tpch-document-v02)]
      (is (= "0.2.0.dev0" (-> new :source :version)))
      (is (= (assoc-in old [:source :version] "0.2.0.dev0") new)))))

(deftest ^:parallel dialect-test
  (testing "a document in one vendor dialect is read in it, and names that warehouse"
    (let [snowflake (fn [text] {:dialects [{:dialect "ANSI_SQL", :expression text}
                                           {:dialect "SNOWFLAKE", :expression (str text " /* sf */")}]})
          ir        (tu/ir (tu/shop-document [(assoc (tu/metric "total" "SUM(orders.amount)")
                                                     :expression (snowflake "SUM(orders.amount)"))]))]
      (is (= {:type "SNOWFLAKE", :driver :snowflake} (:warehouse ir)))
      (is (= "SUM(orders.amount) /* sf */" (-> ir :metrics first :aggregation :text)))))
  (testing "the :dialect option picks, and a field or metric with no form in a readable dialect is reported"
    (let [raw (tu/shop-document [(assoc (tu/metric "total" "SUM(orders.amount)")
                                        :expression {:dialects [{:dialect "BIGQUERY", :expression "SUM(orders.amount)"}]})
                                 (assoc (tu/metric "mdx_only" "x")
                                        :expression {:dialects [{:dialect "MDX", :expression "[Measures].[x]"}]})])]
      (is (= {:type "BIGQUERY", :driver :bigquery-cloud-sdk} (:warehouse (tu/ir {:dialect "bigquery"} raw))))
      (is (= [["mdx_only" "the metric has no expression in BIGQUERY, ANSI_SQL, OSSIE_SQL_2026"]]
             (map (juxt :name :reason) (:unsupported (tu/ir {:dialect "bigquery"} raw)))))
      (testing "without the option the document's one vendor dialect is read; a portable option reads the portable ones"
        (is (= {:type "BIGQUERY", :driver :bigquery-cloud-sdk} (:warehouse (tu/ir raw))))
        (is (= "the metric has no expression in ANSI_SQL, OSSIE_SQL_2026"
               (-> (tu/ir {:dialect "ANSI_SQL"} raw) :unsupported first :reason)))
        (is (= [["total" "the metric has no expression in ANSI_SQL, OSSIE_SQL_2026"]
                ["mdx_only" "the metric has no expression in ANSI_SQL, OSSIE_SQL_2026"]]
               (map (juxt :name :reason) (:unsupported (tu/ir {:dialect "ANSI_SQL"} raw))))))
      (is (thrown-with-msg? ExceptionInfo #"The :dialect option \"MDX\" is not a SQL dialect"
                            (tu/ir {:dialect "MDX"} raw)))))
  (testing "a field with no readable form is left out, and a metric over it reported"
    (let [raw (tu/shop-document [(tu/metric "total" "SUM(orders.amount)")]
                                :edit #(assoc-in % [:datasets 0 :fields 4 :expression]
                                                 {:dialects [{:dialect "DAX", :expression "SUM([amount])"}]}))
          ir  (tu/ir raw)]
      (is (= ["net_amount"] (map :name (get-in ir [:tables "orders" :expressions]))))
      (is (= [["total" "expr \"SUM(orders.amount)\": dataset \"orders\" has no field \"amount\""]]
             (map (juxt :name :reason) (:unsupported ir)))))))

(deftest ^:parallel source-test
  (testing "a dataset's source, in one to three parts, quoted or not"
    (are [source relation] (= relation (parse/parse-source source))
      "db.schema.table"           {:database "db", :schema "schema", :table "table", :quoted #{}}
      "schema.table"              {:database nil, :schema "schema", :table "table", :quoted #{}}
      "table"                     {:database nil, :schema nil, :table "table", :quoted #{}}
      "\"My DB\".public.\"T 1\""  {:database "My DB", :schema "public", :table "T 1", :quoted #{:database :table}}
      "`db`.`s`.`t`"              {:database "db", :schema "s", :table "t", :quoted #{:database :schema :table}}
      "[db].[s].[t]"              {:database "db", :schema "s", :table "t", :quoted #{:database :schema :table}}
      " db.s.t "                  {:database "db", :schema "s", :table "t", :quoted #{}}
      "\"a\"\"b\".t"              {:database nil, :schema "a\"b", :table "t", :quoted #{:schema}}))
  (testing "anything else is a query"
    (are [source] (nil? (parse/parse-source source))
      "SELECT * FROM orders"
      "select 1"
      "a.b.c.d"
      "db..t"
      ""))
  (testing "a dataset that is a query is reported, and so is every metric over it; the rest of the model is read"
    (let [raw (tu/shop-document [(tu/metric "total" "SUM(orders.amount)")
                                 (tu/metric "customers" "COUNT(DISTINCT customers.id)")]
                                :edit #(-> %
                                           (assoc-in [:datasets 0 :source] "SELECT * FROM shop.public.orders WHERE deleted IS NULL")
                                           (update :datasets conj {:name   "sized"
                                                                   :source "shop.public.sized"
                                                                   :fields [(tu/field "n")]
                                                                   :metrics [(tu/metric "rows" "COUNT(n)")]})))
          ir  (tu/ir raw)]
      (is (= ["customers" "sized"] (sort (keys (:tables ir)))))
      (is (= [["sized.rows" :simple "sized"] ["customers" :simple "customers"]]
             (map (juxt :name :type :table) (:metrics ir))))
      (is (= [{:kind      :table
               :name      "orders"
               :unique-id "shop.orders"
               :reason    (str "dataset \"orders\" is defined by the query \"SELECT * FROM shop.public.orders WHERE"
                               " deleted IS NULL\", not a table; a metric is over a table")}
              {:kind      :metric
               :name      "total"
               :unique-id "shop.total"
               :reason    (str "expr \"SUM(orders.amount)\": orders.amount refers to dataset \"orders\", which the"
                               " model does not have")}]
             (:unsupported ir))))))

(deftest ^:parallel fields-test
  (testing "is_time: explicit, else from a temporal datatype in 0.2.0.dev0, else false"
    (let [types (fn [fields]
                  (->> (tu/ir {:version "0.2.0.dev0", :name "m", :datasets [{:name "t", :source "t", :fields fields}]})
                       :tables (#(get % "t")) :dimensions (map (juxt :name :type))))]
      (is (= [["a" :time] ["b" :categorical] ["c" :time] ["d" :categorical] ["e" :categorical] ["f" :time]]
             (types [(tu/field "a" :dimension {:is_time true} :datatype "String")
                     (tu/field "b" :dimension {:is_time false} :datatype "Date")
                     (tu/field "c" :dimension {} :datatype "DateTimeTz")
                     (tu/field "d" :dimension {} :datatype "Integer")
                     (tu/field "e" :dimension {})
                     (tu/field "f" :dimension {} :datatype "timestamp")]))))
    (testing "a 0.1.1 field has no datatype, so only is_time makes a time dimension"
      (is (= [["a" :time] ["b" :categorical]]
             (->> (tu/ir {:version "0.1.1", :semantic_model [{:name "m", :datasets [{:name "t", :source "t"
                                                                                     :fields [(tu/field "a" :dimension {:is_time true})
                                                                                              (tu/field "b" :dimension {})]}]}]})
                  :tables (#(get % "t")) :dimensions (map (juxt :name :type)))))))
  (testing "datatype to base type, an unknown or missing one being unknown"
    (let [base-types (fn [fields]
                       (->> (tu/ir {:version "0.2.0.dev0", :name "m", :datasets [{:name "t", :source "t", :fields fields}]})
                            :tables (#(get % "t")) :columns (m/map-vals :base-type)))]
      (is (= {"s" :type/Text, "i" :type/Integer, "d" :type/Decimal, "f" :type/Float, "b" :type/Boolean
              "dt" :type/Date, "tm" :type/Time, "ts" :type/DateTime, "tz" :type/DateTimeWithTZ, "o" nil, "x" nil
              "n" nil}
             (base-types [(tu/field "s" :datatype "String") (tu/field "i" :datatype "Integer")
                          (tu/field "d" :datatype "Decimal") (tu/field "f" :datatype "float")
                          (tu/field "b" :datatype "Boolean") (tu/field "dt" :datatype "Date")
                          (tu/field "tm" :datatype "Time") (tu/field "ts" :datatype "DateTime")
                          (tu/field "tz" :datatype "DateTimeTz") (tu/field "o" :datatype "Opaque")
                          (tu/field "x" :datatype "Geography") (tu/field "n")])))))
  (testing "a quoted column keeps its spelling; a SQL field documents no column"
    (let [table (-> (tu/ir {:version "0.2.0.dev0", :name "m"
                            :datasets [{:name "t", :source "t"
                                        :fields [(tu/field "a" :expr "\"Mixed Case\"")
                                                 (tu/field "b" :expr "`ticked`")
                                                 (tu/field "c" :expr "x * 2")
                                                 (tu/field "d" :expr "t.plain")]}]})
                    :tables (get "t"))]
      (is (= {"Mixed Case" true, "ticked" true, "plain" false} (update-vals (:columns table) :quoted?)))
      (is (= [["a" "\"Mixed Case\""] ["b" "`ticked`"] ["c" "x * 2"] ["d" "t.plain"]]
             (map (juxt :name :expr) (:expressions table))))))
  (testing "a key naming no field is read as a column, the 0.1.1 way"
    (is (= [{:name "o_orderkey", :expr "o_orderkey"}]
           (-> (tu/ir {:version "0.1.1", :semantic_model [{:name "m", :datasets [{:name "t", :source "t", :primary_key ["o_orderkey"]
                                                                                   :fields [(tu/field "order_id" :expr "o_orderkey")]}]}]})
               :tables (get "t") :keys)))))

(deftest ^:parallel relationships-test
  (let [join (fn [relationship]
               (-> (tu/ir (tu/shop-document [] :edit #(assoc % :relationships [relationship])))
                   :tables (get "orders") :joins first))]
    (testing "a relationship on one field that is a column of each side, landing on a key"
      (is (= {:name "orders_to_customers", :table "customers", :source-column "customer_id"} (join tu/orders-to-customers))))
    (testing "what cannot be an implicit join, and what the dimension set reports for it"
      (are [relationship reason] (= {:name (:name relationship), :reason reason, :unreachable ["id" "segment"]}
                                    (join relationship))
        (assoc tu/orders-to-customers :from_columns ["customer_id" "status"], :to_columns ["id" "segment"])
        (str "relationship \"orders_to_customers\" is on a composite key (customer_id, status to id, segment); an"
             " implicit join is on one column of each side")

        (assoc tu/orders-to-customers :from_columns ["nope"])
        "relationship \"orders_to_customers\" is on \"nope\", which is not a field of dataset \"orders\""

        (assoc tu/orders-to-customers :to_columns ["nope"])
        "relationship \"orders_to_customers\" leads to \"nope\", which is not a field of dataset \"customers\""

        (assoc tu/orders-to-customers :from_columns ["net_amount"])
        (str "relationship \"orders_to_customers\" is on \"net_amount\", which is the SQL expression"
             " \"amount - discount\", not a column; an implicit join needs a column")

        (assoc tu/orders-to-customers :to_columns ["segment"])
        (str "relationship \"orders_to_customers\" leads to \"segment\" of dataset \"customers\", which is not among"
             " its keys (id); a join to anything but a key would multiply the rows"))
      (is (= {:name "orders_to_customers", :unreachable []
              :reason "relationship \"orders_to_customers\" leads to dataset \"nope\", which the model does not have"}
             (join (assoc tu/orders-to-customers :to "nope")))))
    (testing "a dataset that declares no keys is trusted"
      (is (= {:name "orders_to_customers", :table "customers", :source-column "customer_id"}
             (-> (tu/ir (tu/shop-document [] :edit #(-> %
                                                        (update-in [:datasets 1] dissoc :primary_key)
                                                        (assoc :relationships [(assoc tu/orders-to-customers :to_columns ["segment"])]))))
                 :tables (get "orders") :joins first))))
    (testing "unique keys count as keys"
      (is (= {:name "orders_to_customers", :table "customers", :source-column "customer_id"}
             (-> (tu/ir (tu/shop-document [] :edit #(-> %
                                                        (assoc-in [:datasets 1 :unique_keys] [["segment"]])
                                                        (assoc :relationships [(assoc tu/orders-to-customers :to_columns ["segment"])]))))
                 :tables (get "orders") :joins first))))
    (testing "a relationship from a dataset the model does not have is dropped"
      (is (= [] (-> (tu/ir (tu/shop-document [] :edit #(assoc % :relationships [(assoc tu/orders-to-customers :from "nope")])))
                    :tables (get "orders") :joins))))
    (testing "a dataset may relate to itself"
      (is (= [{:name "manager", :table "orders", :source-column "customer_id"}]
             (-> (tu/ir (tu/shop-document [] :edit #(assoc % :relationships [{:name "manager", :from "orders", :to "orders"
                                                                              :from_columns ["customer_id"], :to_columns ["order_id"]}])))
                 :tables (get "orders") :joins))))))

(deftest ^:parallel metrics-test
  (testing "a dataset-scoped metric is named dataset.metric, labelled by its own name, and over its dataset"
    (let [ir (tu/ir (tu/shop-document [] :edit #(assoc-in % [:datasets 0 :metrics] [(tu/metric "total" "SUM(amount)" :description "d")])))]
      (is (= [{:type            :simple
               :name            "orders.total"
               :unique-id       "shop.orders.total"
               :label           "total"
               :description     "d"
               :filters         []
               :fill-nulls-with nil
               :time-grain      nil
               :meta            nil
               :table           "orders"
               :aggregation     {:text       "SUM(amount)"
                                 :sql        "SUM(__ossie_ref_0__)"
                                 :references {"__ossie_ref_0__" {:kind :expression, :path [], :name "amount"}}}
               :time-dimension  "order_date"}]
             (:metrics ir)))))
  (testing "a model-scoped metric over one dataset is over it, wherever the relationships lead"
    (is (= {:table       "customers"
            :aggregation {:text       "COUNT(DISTINCT customers.id) FILTER (WHERE customers.segment = 'vip')"
                          :sql        "COUNT(DISTINCT __ossie_ref_0__) FILTER(WHERE __ossie_ref_1__ = 'vip')"
                          :references {"__ossie_ref_0__" {:kind :dimension, :path [], :name "id", :bucket nil}
                                       "__ossie_ref_1__" {:kind :dimension, :path [], :name "segment", :bucket nil}}}}
           (-> (tu/ir (tu/shop-document [(tu/metric "vip_customers" "COUNT(DISTINCT customers.id) FILTER (WHERE customers.segment = 'vip')")]))
               :metrics first (select-keys [:table :aggregation])))))
  (testing "a model-scoped metric spanning datasets is over the many side, reaching the other through the relationship"
    (is (= {:table       "orders"
            :aggregation {:text       "COUNT(DISTINCT customers.id) FILTER (WHERE orders.status = 'paid')"
                          :sql        "COUNT(DISTINCT __ossie_ref_0__) FILTER(WHERE __ossie_ref_1__ = 'paid')"
                          :references {"__ossie_ref_0__" {:kind :dimension, :path ["orders_to_customers"], :name "id", :bucket nil}
                                       "__ossie_ref_1__" {:kind :dimension, :path [], :name "status", :bucket nil}}}}
           (-> (tu/ir (tu/shop-document [(tu/metric "paying_customers" "COUNT(DISTINCT customers.id) FILTER (WHERE orders.status = 'paid')")]))
               :metrics first (select-keys [:table :aggregation])))))
  (testing "a dataset-scoped metric of a dataset that is a query is reported with the dataset's reason"
    (is (= [{:kind :table, :name "orders", :unique-id "shop.orders"
             :reason "dataset \"orders\" is defined by the query \"select 1\", not a table; a metric is over a table"}
            {:kind :metric, :name "orders.total", :unique-id "shop.orders.total"
             :reason "dataset \"orders\" is defined by the query \"select 1\", not a table; a metric is over a table"}]
           (:unsupported (tu/ir (tu/shop-document [] :edit #(-> %
                                                                (assoc-in [:datasets 0 :source] "select 1")
                                                                (assoc-in [:datasets 0 :metrics] [(tu/metric "total" "SUM(amount)")]))))))))
  (testing "the metrics' free-form metadata is carried, empty as nil"
    (is (= [{:datatype "Decimal", :ai_context {:synonyms ["sales"]}, :custom_extensions [{:vendor_name "X", :data "{}"}]} nil]
           (map :meta (:metrics (tu/ir (tu/shop-document [(tu/metric "a" "SUM(orders.amount)" :datatype "Decimal"
                                                                     :ai_context {:synonyms ["sales"]}
                                                                     :custom_extensions [{:vendor_name "X", :data "{}"}])
                                                          (tu/metric "b" "SUM(orders.amount)")]))))))))
