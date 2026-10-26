(ns dev.dbt-import.parse-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [are deftest is testing]]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.schemas.ir :as ir]
   [dev.dbt-import.test-util :as tu :refer [fld]]
   [medley.core :as m]
   [metabase.util.malli.registry :as mr])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(def ^:private flexanalytics-manifest-filename
  "The flexanalytics/dbt-business-intelligence manifest, trimmed to the sections the converter reads."
  (.getPath ^java.net.URL (io/resource "dbt_import/flexanalytics_manifest.json")))

(defn- flexanalytics-manifest
  "The fixture, read and decoded but not yet parsed into the IR."
  []
  (parse/read-manifest flexanalytics-manifest-filename))

(defn- metric-named [parsed metric-name]
  (m/find-first (comp #{metric-name} :name) (:metrics parsed)))

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

(def ^:private sum-sales [:sum {} (fld "sales" :type/Float)])

(defn- schema-version [v]
  (fn [m] (assoc-in m [:metadata :dbt_schema_version] (format "https://schemas.getdbt.com/dbt/manifest/%s.json" v))))

(defn- add-measure [measure]
  (fn [m] (update-in m [:semantic_models tu/sm-id :measures] conj (merge (tu/base-measure) measure))))

(defn- add-metric [metric]
  (fn [m] (assoc-in m [:metrics (:unique_id metric)] (merge (get-in m [:metrics "metric.p.m"]) metric))))

(deftest ^:parallel manifest-version-test
  (testing "manifest schema versions v10 to v12 are accepted"
    (are [v] (= sum-sales (tu/aggregation {:edit (schema-version v)}))
      "v10" "v11" "v12"))
  (testing "other versions are rejected up front"
    (are [v] (thrown-with-msg? ExceptionInfo #"Invalid dbt manifest"
                               (tu/convert {:edit (schema-version v)}))
      "v9" "v13"))
  (testing "a pre-release dbt version string"
    (is (= sum-sales (tu/aggregation {:edit (fn [m] (assoc-in m [:metadata :dbt_version] "1.13.0-b2"))})))))

(deftest ^:parallel unknown-manifest-content-test
  (testing "unknown top-level keys and fields pass through"
    (is (= sum-sales (tu/aggregation {:edit (fn [m]
                                              (-> m
                                                  (assoc :saved_queries {} :unit_tests {})
                                                  (assoc-in [:metrics "metric.p.m" :brand_new_field] {:x 1})))}))))
  (testing "a custom time_granularity on the metric is a free-form string"
    (is (= sum-sales (tu/aggregation {:metric {:time_granularity "fiscal_quarter"}}))))
  (testing "aggregation, metric type, entity type and dimension granularity are closed enums in dbt's manifest schema"
    ;; dbt validates these when it parses the project, so a manifest it wrote never carries another value. One would
    ;; mean a dbt newer than the converter knows (`conversion` arrived with v11) or a hand-edited file: an invalid
    ;; manifest, rejected up front rather than guessed at.
    (are [edit] (thrown-with-msg? ExceptionInfo #"Invalid dbt manifest" (tu/convert {:edit edit}))
      (add-measure {:name "weird", :agg "approx_count_distinct"})
      (add-metric {:unique_id "metric.p.funnel", :name "funnel", :type "funnel"})
      (fn [m]
        (update-in m [:semantic_models tu/sm-id :entities] conj
                   {:name "k", :type "composite", :description nil, :label nil, :role nil, :expr nil}))
      (fn [m]
        (update-in m [:semantic_models tu/sm-id :dimensions] conj
                   {:name "fiscal_day", :type "time", :description nil, :label nil, :is_partition false, :expr "date_day"
                    :type_params {:time_granularity "fiscal_quarter", :validity_params nil}})))))

(defn- re-home-model
  "Move the model node to `node-id` with `resource-type`, and point the semantic model at it."
  [node-id resource-type]
  (fn [m]
    (let [node (assoc (get-in m [:nodes tu/model-id]) :unique_id node-id :resource_type resource-type)]
      (-> m
          (update :nodes #(-> % (dissoc tu/model-id) (assoc node-id node)))
          (assoc-in [:semantic_models tu/sm-id :depends_on :nodes] [node-id])))))

(deftest ^:parallel source-node-test
  (testing "a semantic model built on a seed or a snapshot finds its columns"
    (are [node-id resource-type] (= sum-sales (tu/aggregation {:edit (re-home-model node-id resource-type)}))
      "seed.p.fact_sales"     "seed"
      "snapshot.p.fact_sales" "snapshot"))
  (testing "when depends_on lists several nodes, the one matching node_relation has the columns"
    (is (= sum-sales (tu/aggregation {:edit (fn [m]
                                              (-> m
                                                  (assoc-in [:nodes "model.p.other"]
                                                            (assoc (tu/model-node {"sales" "text"})
                                                                   :unique_id "model.p.other" :name "other" :alias "other"))
                                                  (assoc-in [:semantic_models tu/sm-id :depends_on :nodes]
                                                            ["model.p.other" tu/model-id])))}))))
  (testing "the metrics map key need not be the unique_id"
    (is (= sum-sales (tu/aggregation {:edit (fn [m] (update m :metrics (fn [ms] {"metric.p.weird_key" (val (first ms))})))}))))
  (testing "a semantic model with no default agg_time_dimension"
    (is (= sum-sales (tu/aggregation {:edit (fn [m] (assoc-in m [:semantic_models tu/sm-id :defaults] nil))})))))

(deftest ^:parallel dangling-reference-test
  (is (re-find #"semantic model nil not found"
               (tu/unsupported {:metric {:depends_on {:macros [], :nodes []}}})))
  (is (re-find #"semantic model \"semantic_model.p.nope\" not found"
               (tu/unsupported {:metric {:depends_on {:macros [], :nodes ["semantic_model.p.nope"]}}})))
  (is (re-find #"measure \"nope\" not found on semantic model \"fact_sales\""
               (tu/unsupported {:input-measure {:name "nope"}}))))

(defn- metric-input [metric-name & {:as overrides}]
  (merge {:name metric-name, :filter nil, :alias nil} overrides))

(defn- other-type-reason
  "The reason a metric of `metric-type` with `type-params` is reported."
  [metric-type type-params]
  (tu/unsupported {:metric      {:type metric-type}
                   :type-params (merge {:measure nil, :input_measures []} type-params)}))

(deftest ^:parallel other-metric-types-test
  (testing "ratio, derived, cumulative and conversion metrics are reported, not thrown (QRES-5)"
    (are [metric-type type-params] (re-find (re-pattern (str "metric type " metric-type " is not supported yet"))
                                            (other-type-reason metric-type type-params))
      "ratio"      {:numerator (metric-input "a"), :denominator (metric-input "b")}
      "ratio"      {:numerator (metric-input "a"), :denominator (metric-input "a")}
      "ratio"      {:numerator   (metric-input "a" :filter {:where_filters [{:where_sql_template "{{ Dimension('order__status') }} = 'Shipped'"}]})
                    :denominator (metric-input "a")}
      "ratio"      {:numerator (metric-input "a" :alias "x"), :denominator (metric-input "b" :alias "y")}
      "derived"    {:expr "a * 100", :metrics [(metric-input "a")]}
      "derived"    {:expr "a - b", :metrics [(metric-input "a") (metric-input "b")]}
      "derived"    {:expr "a / nullif(b, 0)", :metrics [(metric-input "a") (metric-input "b")]}
      "derived"    {:expr    "current - previous"
                    :metrics [(metric-input "a" :alias "current")
                              (metric-input "a" :alias "previous" :offset_window {:count 7, :granularity "day"})]}
      "derived"    {:expr "a - mtd", :metrics [(metric-input "a") (metric-input "a" :alias "mtd" :offset_to_grain "month")]}
      "derived"    {:expr "d * 2", :metrics [(metric-input "d")]}
      "cumulative" {:measure (tu/input-measure {}), :window {:count 7, :granularity "day"}}
      "cumulative" {:measure (tu/input-measure {}), :grain_to_date "month"}
      "cumulative" {:measure (tu/input-measure {})}
      "cumulative" {:measure (tu/input-measure {}), :cumulative_type_params {:window nil, :grain_to_date "month", :period_agg "first"}}
      "cumulative" {:measure (tu/input-measure {}), :cumulative_type_params {:window {:count 30, :granularity "day"}, :grain_to_date nil, :period_agg "last"}}
      "cumulative" {:measure (tu/input-measure {}), :cumulative_type_params {:window nil, :grain_to_date nil, :period_agg "average"}}
      "conversion" {:conversion_type_params {:base_measure (tu/input-measure {}), :conversion_measure (tu/input-measure {:name "paid"})
                                             :entity "customer", :calculation "conversion_rate", :window nil, :constant_properties nil}}
      "conversion" {:conversion_type_params {:base_measure (tu/input-measure {}), :conversion_measure (tu/input-measure {:name "paid"})
                                             :entity "customer", :calculation "conversions", :window {:count 7, :granularity "day"}}}
      "conversion" {:conversion_type_params {:base_measure (tu/input-measure {}), :conversion_measure (tu/input-measure {:name "paid"})
                                             :entity "customer", :calculation "conversion_rate"
                                             :constant_properties [{:base_property "plan", :conversion_property "plan"}]}})))

(defn- inline
  "Tweaks for a 1.12 inline-spec simple metric that carries `params` in `metric_aggregation_params` instead of pointing
  at a measure. `more` are further tweaks."
  [params & {:as more}]
  (merge {:type-params {:measure                   nil
                        :input_measures            []
                        :metric_aggregation_params (merge {:semantic_model "fact_sales"} params)}}
         more))

(deftest ^:parallel inline-spec-test
  (testing "the inline spec shares the converter's unverified assumption about the metric_aggregation_params shape (QRES-6)"
    (is (= sum-sales (tu/aggregation (inline {:agg "sum", :expr "sales"}))))
    (is (= [:distinct {} (fld "customer_key" :type/Text)]
           (tu/aggregation (inline {:agg "count_distinct", :expr "customer_key"}))))
    (is (= [:percentile {} (fld "sales" :type/Float) 0.9]
           (tu/aggregation (inline {:agg "percentile", :expr "sales", :agg_params {:percentile 0.9}}))))
    (is (= [:count {}] (tu/aggregation (inline {:agg "count", :expr "1"}))))
    (testing "no expr defaults to the metric name, documented column or not"
      (is (= sum-sales (tu/aggregation (inline {:agg "sum"} :metric {:name "sales", :unique_id "metric.p.sales"}))))
      (is (= [:sum {} (fld "m" nil)] (tu/aggregation (inline {:agg "sum"})))))
    (testing "agg_time_dimension override is accepted"
      (is (= sum-sales (tu/aggregation (inline {:agg "sum", :expr "sales", :agg_time_dimension "nope"})))))
    (testing "fill_nulls_with on the metric"
      (is (= [:coalesce {} sum-sales 0]
             (tu/aggregation (update (inline {:agg "sum", :expr "sales"}) :type-params assoc :fill_nulls_with 0)))))
    (is (re-find #"neither a measure nor metric_aggregation_params" (tu/unsupported (inline {}))))
    (is (re-find #"non-additive"
                 (tu/unsupported (inline {:agg "sum", :expr "sales"
                                          :non_additive_dimension {:name "date_day", :window_choice "max"}}))))
    (testing "a measure and inline params both present: the measure wins"
      (is (= sum-sales (tu/aggregation {:type-params {:metric_aggregation_params {:semantic_model "fact_sales", :agg "max", :expr "sales"}}}))))))
