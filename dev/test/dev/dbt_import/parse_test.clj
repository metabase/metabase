(ns dev.dbt-import.parse-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.schemas.ir :as ir]
   [dev.dbt-import.test-util :as tu :refer [fld]]
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
                                               (assoc-in [:type_params :measure :filter] {:where_filters [{:where_sql_template "{{ Dimension('x') }} = 1"}]})))))))
    (testing "a blank label falls back to the name, like a missing one"
      (is (= "sales" (:label (parse/parse-metric semantic-models (assoc sales :label "")))))
      (is (= "sales" (:label (parse/parse-metric semantic-models (assoc sales :label nil))))))))

;;; ------------------------------------------------------- manifest-level -------------------------------------------------------

(def ^:private sum-sales [:sum {} (fld "sales" :type/Float)])

(defn- schema-version [v]
  (fn [m] (assoc-in m [:metadata :dbt_schema_version] (format "https://schemas.getdbt.com/dbt/manifest/%s.json" v))))

(defn- add-measure [measure]
  (fn [m] (update-in m [:semantic_models tu/sm-id :measures] conj (merge (tu/base-measure) measure))))

(defn- add-metric [metric]
  (fn [m] (assoc-in m [:metrics (:unique_id metric)] (merge (get-in m [:metrics "metric.p.m"]) metric))))

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
   ;; one value the converter does not know, anywhere in the manifest, must not fail every metric
   {:id "another measure with an aggregation the converter does not know"
    :edit (add-measure {:name "weird", :agg "approx_count_distinct"}) :expect {:aggregation sum-sales}}
   {:id "another metric with a type the converter does not know"
    :edit (add-metric {:unique_id "metric.p.funnel", :name "funnel", :type "funnel"}) :expect {:aggregation sum-sales}}
   {:id "a metric with a type the converter does not know is reported"
    :edit        (add-metric {:unique_id "metric.p.funnel", :name "funnel", :type "funnel"})
    :metric-name "funnel"
    :expect      {:unsupported #"metric type funnel is not supported"}}
   {:id "a dimension with a custom granularity from the time spine (dbt 1.9+)"
    :edit (fn [m] (update-in m [:semantic_models tu/sm-id :dimensions]
                             conj {:name "fiscal_day", :type "time", :description nil, :label nil, :is_partition false
                                   :type_params {:time_granularity "fiscal_quarter", :validity_params nil}, :expr "date_day"}))
    :expect {:aggregation sum-sales}}
   {:id "an entity type the converter does not know"
    :edit (fn [m] (update-in m [:semantic_models tu/sm-id :entities] conj
                             {:name "k", :type "composite", :description nil, :label nil, :role nil, :expr nil}))
    :expect {:aggregation sum-sales}}])

(deftest ^:parallel manifest-test
  (tu/check-cases manifest-cases))

;;; ---------------------------------------------------------- nodes ----------------------------------------------------------

(defn- re-home-model
  "Move the model node to `node-id` with `resource-type`, and point the semantic model at it."
  [node-id resource-type]
  (fn [m]
    (let [node (assoc (get-in m [:nodes tu/model-id]) :unique_id node-id :resource_type resource-type)]
      (-> m
          (update :nodes #(-> % (dissoc tu/model-id) (assoc node-id node)))
          (assoc-in [:semantic_models tu/sm-id :depends_on :nodes] [node-id])))))

(def ^:private node-cases
  [{:id "a semantic model built on a seed" :edit (re-home-model "seed.p.fact_sales" "seed") :expect {:aggregation sum-sales}}
   {:id "a semantic model built on a snapshot" :edit (re-home-model "snapshot.p.fact_sales" "snapshot") :expect {:aggregation sum-sales}}
   {:id "depends_on lists another model first: the node matching node_relation is the one with the columns"
    :edit (fn [m]
            (-> m
                (assoc-in [:nodes "model.p.other"] (assoc (tu/model-node {"sales" "text"}) :unique_id "model.p.other" :name "other" :alias "other"))
                (assoc-in [:semantic_models tu/sm-id :depends_on :nodes] ["model.p.other" tu/model-id])))
    :expect {:aggregation sum-sales}}
   {:id "a metric whose depends_on names no semantic model"
    :metric {:depends_on {:macros [], :nodes []}} :expect {:unsupported #"semantic model nil not found"}}
   {:id "a metric whose semantic model is missing"
    :metric {:depends_on {:macros [], :nodes ["semantic_model.p.nope"]}} :expect {:unsupported #"semantic model \"semantic_model.p.nope\" not found"}}
   {:id "a metric whose measure is missing"
    :input-measure {:name "nope"} :expect {:unsupported #"measure \"nope\" not found on semantic model \"fact_sales\""}}
   {:id "the metrics map key is not the unique_id"
    :edit (fn [m] (update m :metrics (fn [ms] {"metric.p.weird_key" (val (first ms))}))) :expect {:aggregation sum-sales}}
   {:id "a semantic model with no default agg_time_dimension"
    :edit (fn [m] (assoc-in m [:semantic_models tu/sm-id :defaults] nil)) :expect {:aggregation sum-sales}}])

(deftest ^:parallel node-test
  (tu/check-cases node-cases))

;;; ------------------------------------------------------ other metric types ------------------------------------------------------

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
   (other-type-case "cumulative over a 7 day window" "cumulative" {:measure (tu/input-measure {}), :window {:count 7, :granularity "day"}})
   (other-type-case "cumulative month to date" "cumulative" {:measure (tu/input-measure {}), :grain_to_date "month"})
   (other-type-case "cumulative all time" "cumulative" {:measure (tu/input-measure {})})
   (other-type-case "cumulative, period_agg first" "cumulative"
                    {:measure (tu/input-measure {}), :cumulative_type_params {:window nil, :grain_to_date "month", :period_agg "first"}})
   (other-type-case "cumulative, period_agg last" "cumulative"
                    {:measure (tu/input-measure {}), :cumulative_type_params {:window {:count 30, :granularity "day"}, :grain_to_date nil, :period_agg "last"}})
   (other-type-case "cumulative, period_agg average" "cumulative"
                    {:measure (tu/input-measure {}), :cumulative_type_params {:window nil, :grain_to_date nil, :period_agg "average"}})
   (other-type-case "conversion rate" "conversion"
                    {:conversion_type_params {:base_measure (tu/input-measure {}), :conversion_measure (tu/input-measure {:name "paid"})
                                              :entity "customer", :calculation "conversion_rate", :window nil, :constant_properties nil}})
   (other-type-case "conversion count" "conversion"
                    {:conversion_type_params {:base_measure (tu/input-measure {}), :conversion_measure (tu/input-measure {:name "paid"})
                                              :entity "customer", :calculation "conversions", :window {:count 7, :granularity "day"}}})
   (other-type-case "conversion with constant properties" "conversion"
                    {:conversion_type_params {:base_measure (tu/input-measure {}), :conversion_measure (tu/input-measure {:name "paid"})
                                              :entity "customer", :calculation "conversion_rate"
                                              :constant_properties [{:base_property "plan", :conversion_property "plan"}]}})])

(deftest ^:parallel metric-type-test
  (tu/check-cases metric-type-cases))

;;; --------------------------------------------------- 1.12 inline-spec metrics ---------------------------------------------------

(defn- inline-case [id params expect & {:as more}]
  (merge {:id          (str "inline spec: " id)
          :type-params {:measure nil, :input_measures [], :metric_aggregation_params (merge {:semantic_model "fact_sales"} params)}
          :expect      expect}
         more))

(def ^:private inline-cases
  "The inline-spec cases share the converter's unverified assumption about the `metric_aggregation_params` shape
  (QRES-6)."
  [(inline-case "sum" {:agg "sum", :expr "sales"} {:aggregation sum-sales})
   (inline-case "count_distinct" {:agg "count_distinct", :expr "customer_key"}
                {:aggregation [:distinct {} (fld "customer_key" :type/Text)]})
   (inline-case "no expr defaults to the metric name" {:agg "sum"} {:aggregation sum-sales}
                :metric {:name "sales", :unique_id "metric.p.sales"})
   (inline-case "no expr and no documented column of the metric's name" {:agg "sum"} {:aggregation [:sum {} (fld "m" nil)]})
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
  (tu/check-cases inline-cases))
