(ns dev.dbt-import.parse-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [are deftest is testing]]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.schemas.ir :as ir]
   [dev.dbt-import.test-util :as tu :refer [fld]]
   [mb.hawk.assert-exprs]
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
    (testing "the nine simple metrics parse, including the create_metric: true ones, and so do the ratio, derived and plain cumulative ones flexanalytics_extra_metrics.yml adds"
      (is (= ["cancelled_order_share" "cumulative_sales" "customer_count" "order_count" "price" "product_count" "quantity"
              "row_count" "sales" "sales_minus_target" "sales_pct_of_target" "sales_to_target" "sales_to_target_ratio_2" "target"]
             (map :name (:metrics parsed)))))
    (testing "what has no Metabase equivalent is reported with the reason"
      (is (= {"customer_reorder_rate" "conversion metrics are out of scope: a per-entity funnel is nothing a Metabase metric expresses"
              "sales_mtd"             "a cumulative metric with grain_to_date \"month\" has no Metabase equivalent: a running total that resets at each month needs a breakout the metric cannot require"
              "sales_trailing_7d"     "a cumulative metric with a window of 7 day has no Metabase equivalent: MBQL has no rolling-window aggregation"
              "sales_vs_prior_week"   "input \"sales_prior_week\" has an offset_window of 7 day: period-over-period comparisons have no Metabase equivalent"}
             (into {} (map (juxt :name :reason)) (:unsupported parsed)))))
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
    (testing "a ratio metric parses to its two inputs, which it refers to by name"
      (is (= {:type        :ratio
              :name        "sales_to_target_ratio_2"
              :unique-id   "metric.dbt_business_intelligence.sales_to_target_ratio_2"
              :label       "Sales to Target Ratio 2"
              :description "sum(sales) / sum(target), the correct form of sales_to_target"
              :filters     []
              :meta        {}
              :numerator   {:metric "sales", :alias nil, :filters []}
              :denominator {:metric "target", :alias nil, :filters []}}
             (parse/parse-metric semantic-models (get-in manifest [:metrics "metric.dbt_business_intelligence.sales_to_target_ratio_2"])))))
    (testing "a derived metric parses to its expr and inputs, aliases kept"
      (is (= {:type   :derived
              :expr   "sales_amt / target_amt * 100"
              :inputs [{:metric "sales", :alias "sales_amt", :filters []} {:metric "target", :alias "target_amt", :filters []}]}
             (-> (parse/parse-metric semantic-models (get-in manifest [:metrics "metric.dbt_business_intelligence.sales_pct_of_target"]))
                 (select-keys [:type :expr :inputs])))))
    (testing "a ratio input's filter is kept on the input"
      (is (= {:metric "order_count", :alias "cancelled_orders", :filters ["{{ Dimension('order__order_status_dim') }} = 'Cancelled'"]}
             (:numerator (parse/parse-metric semantic-models (get-in manifest [:metrics "metric.dbt_business_intelligence.cancelled_order_share"]))))))
    (testing "a cumulative metric with no window parses as a simple one of type cumulative"
      (is (= {:type :cumulative, :agg :sum, :expr "sales", :semantic-model "fact_sales", :measure "sales"}
             (-> (parse/parse-metric semantic-models (get-in manifest [:metrics "metric.dbt_business_intelligence.cumulative_sales"]))
                 (select-keys [:type :agg :expr :semantic-model :measure])))))
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

(deftest ^:parallel advanced-metric-shapes-test
  (testing "the shapes dbt 1.12 writes for the metric types QRES-5 covers decode the way the manifest schema expects"
    (let [manifest (flexanalytics-manifest)
          metric   #(get-in manifest [:metrics (str "metric.dbt_business_intelligence." %)])]
      (testing "ratio: numerator and denominator name metrics, and depends_on lists those metrics rather than a semantic model"
        (is (=? {:type        :ratio
                 :type_params {:numerator      {:name "sales", :filter nil, :alias nil}
                               :denominator    {:name "target", :filter nil, :alias nil}
                               :input_measures [{:name "sales"} {:name "target"}]
                               :measure        nil}
                 :depends_on  {:nodes ["metric.dbt_business_intelligence.sales" "metric.dbt_business_intelligence.target"]}}
                (metric "sales_to_target_ratio_2"))))
      (testing "a ratio input carries its own filter and alias"
        (is (=? {:type_params {:numerator   {:name   "order_count"
                                             :alias  "cancelled_orders"
                                             :filter {:where_filters [{:where_sql_template "{{ Dimension('order__order_status_dim') }} = 'Cancelled'"}]}}
                               :denominator {:name "order_count", :alias nil, :filter nil}}
                 :depends_on  {:nodes ["metric.dbt_business_intelligence.order_count"]}}
                (metric "cancelled_order_share"))))
      (testing "derived: expr over input metrics, with optional aliases"
        (is (=? {:type        :derived
                 :type_params {:expr    "sales - target"
                               :metrics [{:name "sales", :alias nil} {:name "target", :alias nil}]}
                 :depends_on  {:nodes ["metric.dbt_business_intelligence.sales" "metric.dbt_business_intelligence.target"]}}
                (metric "sales_minus_target")))
        (is (=? {:type_params {:expr    "sales_amt / target_amt * 100"
                               :metrics [{:name "sales", :alias "sales_amt"} {:name "target", :alias "target_amt"}]}}
                (metric "sales_pct_of_target"))))
      (testing "an offset_window is a count and a granularity"
        (is (=? {:type_params {:metrics [{:name "sales", :alias nil, :offset_window nil}
                                         {:name "sales", :alias "sales_prior_week", :offset_window {:count 7, :granularity "day"}}]}}
                (metric "sales_vs_prior_week"))))
      (testing "cumulative: the measure plus cumulative_type_params; period_agg defaults to first even without a window, and the legacy window / grain_to_date stay nil"
        (is (=? {:type        :cumulative
                 :type_params {:measure                {:name "sales"}
                               :window                 nil
                               :grain_to_date          nil
                               :cumulative_type_params {:window nil, :grain_to_date nil, :period_agg :first}}
                 :depends_on  {:nodes ["semantic_model.dbt_business_intelligence.fact_sales"]}}
                (metric "cumulative_sales")))
        (is (=? {:type_params {:window nil, :cumulative_type_params {:window {:count 7, :granularity "day"}, :grain_to_date nil}}}
                (metric "sales_trailing_7d")))
        (is (=? {:type_params {:grain_to_date nil, :cumulative_type_params {:window nil, :grain_to_date "month"}}}
                (metric "sales_mtd"))))
      (testing "conversion params are left untyped, so what is nested in them keeps its string keys"
        (is (=? {:type        :conversion
                 :type_params {:conversion_type_params {:entity       "customer"
                                                        :calculation  "conversion_rate"
                                                        :base_measure {"name" "order_count"}
                                                        :window       {"count" 30, "granularity" "day"}}}}
                (metric "customer_reorder_rate")))))))

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

(defn- other-type-reason
  "The reason a metric of `metric-type` with `type-params` is reported."
  [metric-type type-params]
  (tu/unsupported {:metric      {:type metric-type}
                   :type-params (merge {:measure nil, :input_measures []} type-params)}))

(deftest ^:parallel advanced-metric-types-test
  (testing "what is structurally beyond Metabase is reported at parse time, with the reason"
    (are [metric-type type-params re] (re-find re (other-type-reason metric-type type-params))
      "derived"    {:expr    "current - previous"
                    :metrics [(tu/metric-input "a" :alias "current")
                              (tu/metric-input "a" :alias "previous" :offset_window {:count 7, :granularity "day"})]}
      #"input \"previous\" has an offset_window of 7 day"

      "derived"    {:expr "a - mtd", :metrics [(tu/metric-input "a") (tu/metric-input "a" :alias "mtd" :offset_to_grain "month")]}
      #"input \"mtd\" has an offset_to_grain of \"month\""

      "ratio"      {:numerator (tu/metric-input "a" :offset_window {:count 1, :granularity "month"}), :denominator (tu/metric-input "a")}
      #"input \"a\" has an offset_window of 1 month"

      "ratio"      {:numerator nil, :denominator (tu/metric-input "a")}
      #"ratio metric without a numerator and a denominator"

      "derived"    {:expr nil, :metrics [(tu/metric-input "a")]}
      #"derived metric without an expr"

      "derived"    {:expr "a", :metrics []}
      #"derived metric without input metrics"

      "cumulative" {:measure (tu/input-measure {}), :window {:count 7, :granularity "day"}}
      #"a cumulative metric with a window of 7 day has no Metabase equivalent"

      "cumulative" {:measure (tu/input-measure {}), :grain_to_date "month"}
      #"a cumulative metric with grain_to_date \"month\" has no Metabase equivalent"

      "cumulative" {:measure (tu/input-measure {}), :cumulative_type_params {:window nil, :grain_to_date "month", :period_agg "first"}}
      #"grain_to_date \"month\""

      "cumulative" {:measure (tu/input-measure {}), :cumulative_type_params {:window {:count 30, :granularity "day"}, :grain_to_date nil, :period_agg "last"}}
      #"a window of 30 day"

      "conversion" {:conversion_type_params {:base_measure (tu/input-measure {}), :conversion_measure (tu/input-measure {:name "paid"})
                                             :entity "customer", :calculation "conversion_rate", :window nil, :constant_properties nil}}
      #"conversion metrics are out of scope"

      "conversion" {:conversion_type_params {:base_measure (tu/input-measure {}), :conversion_measure (tu/input-measure {:name "paid"})
                                             :entity "customer", :calculation "conversions", :window {:count 7, :granularity "day"}}}
      #"conversion metrics are out of scope"))
  (testing "a reference to a metric the manifest does not have is reported when the metric is resolved"
    (are [metric-type type-params] (re-find #"metric \"a\" not found" (other-type-reason metric-type type-params))
      "ratio"   {:numerator (tu/metric-input "a"), :denominator (tu/metric-input "b")}
      "derived" {:expr "a * 100", :metrics [(tu/metric-input "a")]}))
  (testing "a cumulative metric with no window converts to a running sum; period_agg alone, which dbt writes by default, changes nothing"
    (are [type-params] (= [:cum-sum {} (fld "sales" :type/Float)]
                          (tu/aggregation {:metric {:type "cumulative"}, :type-params type-params}))
      {}
      {:cumulative_type_params {:window nil, :grain_to_date nil, :period_agg "first"}}
      {:cumulative_type_params {:window nil, :grain_to_date nil, :period_agg "average"}})))

(defn- inline
  "Tweaks for a 1.12 inline-spec simple metric that carries `params` in `metric_aggregation_params` and `expr` in
  `type_params`, the way dbt 1.12 writes one (see the `parcel_delivery` fixture), instead of pointing at a measure.
  `more` are further tweaks."
  [{:keys [expr] :as params} & {:as more}]
  (merge {:type-params {:measure                   nil
                        :input_measures            []
                        :expr                      expr
                        :metric_aggregation_params (merge {:semantic_model "fact_sales", :agg_params nil, :agg_time_dimension nil
                                                           :non_additive_dimension nil}
                                                          (dissoc params :expr))}}
         more))

(deftest ^:parallel inline-spec-test
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
  (is (re-find #"neither a measure nor metric_aggregation_params"
               (tu/unsupported {:type-params {:measure nil, :input_measures [], :metric_aggregation_params nil}})))
  (is (re-find #"non-additive"
               (tu/unsupported (inline {:agg "sum", :expr "sales"
                                        :non_additive_dimension {:name "date_day", :window_choice "max"}}))))
  (testing "a measure and inline params both present: the measure wins"
    (is (= sum-sales (tu/aggregation {:type-params {:expr "sales"
                                                    :metric_aggregation_params {:semantic_model "fact_sales", :agg "max", :agg_params nil
                                                                                :agg_time_dimension nil, :non_additive_dimension nil}}})))))
