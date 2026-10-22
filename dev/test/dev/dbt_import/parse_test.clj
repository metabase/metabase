(ns dev.dbt-import.parse-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.schemas.ir :as ir]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private flexanalytics-manifest-filename
  "The flexanalytics/dbt-business-intelligence manifest, trimmed to the sections the converter reads."
  (.getPath ^java.net.URL (io/resource "dbt_import/flexanalytics_manifest.json")))

(defn- flexanalytics-manifest
  "The fixture, read and decoded but not yet parsed into the IR."
  []
  (parse/read-manifest flexanalytics-manifest-filename))

(defn- metric-named [parsed metric-name]
  (first (filter (comp #{metric-name} :name) (:metrics parsed))))

(deftest ^:parallel parse-semantic-model-test
  (let [manifest (flexanalytics-manifest)
        parsed   (parse/parse-semantic-model manifest (get-in manifest [:semantic_models "semantic_model.dbt_business_intelligence.fact_sales"]))]
    (is (mr/validate ::ir/semantic-model parsed))
    (is (= {:database "dbt_bi", :schema "public", :table "fact_sales"}
           (:relation parsed)))
    (testing "column types come from the model node"
      (is (= {"sales" "float", "quantity" "integer", "date_day" "date", "customer_key" "text"}
             (-> parsed :columns (select-keys ["sales" "quantity" "date_day" "customer_key"]) (update-vals :data-type)))))
    (testing "nil expr defaults to the name"
      (is (= {"fact_sales_key" "fact_sales_key", "customer" "customer_key"}
             (into {} (map (juxt :name :expr)) (filter (comp #{"fact_sales_key" "customer"} :name) (:entities parsed))))))
    (testing "time dimension granularity is lifted"
      (is (= [{:name "date_day", :type :time, :expr "date_day", :granularity :day}]
             (map #(select-keys % [:name :type :expr :granularity]) (:dimensions parsed)))))
    (testing "measures are keyed by name and inherit the default agg_time_dimension"
      (is (= "date_day" (:default-agg-time-dimension parsed)))
      (is (= {:agg :sum, :expr "sales", :agg-time-dimension "date_day", :label "Sales"}
             (-> parsed :measures (get "sales") (select-keys [:agg :expr :agg-time-dimension :label]))))
      (is (= "sales / target" (get-in parsed [:measures "sales_to_target" :expr]))
          "SQL exprs pass through untouched; emit decides what to do with them"))))

(deftest ^:parallel parse-manifest-test
  (let [parsed (parse/parse-manifest-file flexanalytics-manifest-filename)]
    (is (mr/validate ::ir/manifest parsed))
    (is (= {:tool "dbt", :version "1.12.6", :project "dbt_business_intelligence"}
           (:source parsed)))
    (is (= #{"fact_sales" "dim_customer" "dim_product" "dim_order"}
           (set (keys (:semantic-models parsed)))))
    (testing "all nine simple metrics parse, including the create_metric: true ones"
      (is (= ["customer_count" "order_count" "price" "product_count" "quantity" "row_count" "sales" "sales_to_target" "target"]
             (map :name (:metrics parsed))))
      (is (empty? (:unsupported parsed))))
    (testing "a generated metric is flattened from its measure"
      (is (= {:name "sales", :label "Sales", :semantic-model "fact_sales", :measure "sales"
              :agg :sum, :expr "sales", :agg-time-dimension "date_day", :filters [], :fill-nulls-with nil
              :join-to-timespine false}
             (-> (metric-named parsed "sales")
                 (select-keys [:name :label :semantic-model :measure :agg :expr :agg-time-dimension :filters
                               :fill-nulls-with :join-to-timespine])))))
    (testing "a hand-written metric takes its own label and meta over the measure's"
      (is (= {:label "Sales to Target Ratio", :agg :average, :expr "sales / target"
              :meta {:format {"type" "percent", "decimalPlaces" 1, "suffix" "%"}, :synonyms ["Sales Coverage Ratio"]}}
             (-> (metric-named parsed "sales_to_target")
                 (select-keys [:label :agg :expr :meta])))))))

(deftest ^:parallel parse-metric-unsupported-test
  (let [manifest        (flexanalytics-manifest)
        semantic-models (update-vals (:semantic_models manifest) #(parse/parse-semantic-model manifest %))
        sales           (get-in manifest [:metrics "metric.dbt_business_intelligence.sales"])]
    (testing "non-simple metric types are reported, not thrown"
      (is (= {:name "sales", :unique-id "metric.dbt_business_intelligence.sales"
              :reason "metric type ratio is not supported yet (QRES-5)"}
             (parse/parse-metric semantic-models (assoc sales :type :ratio)))))
    (testing "a dangling measure reference is reported"
      (is (= "measure \"nope\" not found on semantic model \"fact_sales\""
             (:reason (parse/parse-metric semantic-models (assoc-in sales [:type_params :measure :name] "nope"))))))
    (testing "a missing semantic model is reported"
      (is (= "semantic model \"semantic_model.x.y\" not found in manifest"
             (:reason (parse/parse-metric semantic-models (assoc-in sales [:depends_on :nodes] ["semantic_model.x.y"]))))))
    (testing "filters on either the metric or its input measure are collected"
      (is (= ["{{ Dimension('order__status') }} = 'Shipped'" "{{ Dimension('x') }} = 1"]
             (:filters (parse/parse-metric semantic-models
                                           (-> sales
                                               (assoc :filter {:where_filters [{:where_sql_template "{{ Dimension('order__status') }} = 'Shipped'"}]})
                                               (assoc-in [:type_params :measure :filter] {:where_filters [{:where_sql_template "{{ Dimension('x') }} = 1"}]})))))))))
