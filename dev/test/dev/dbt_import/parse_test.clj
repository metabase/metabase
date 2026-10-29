(ns dev.dbt-import.parse-test
  "The parse stage, [[parse/parse-manifest]] and what leads up to it: reading and decoding a manifest against the
  manifest schemas, the version check, and what the two fixtures and small hand-built manifests parse into, metric by
  metric, including every case the stage reports rather than converts."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [clojure.walk :as walk]
   [dev.dbt-import.fixture :as fixture]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.schemas.dbt-manifest :as dbt-manifest]
   [dev.dbt-import.schemas.ir :as ir]
   [dev.dbt-import.test-util :as tu :refer [fld]]
   [mb.hawk.assert-exprs]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.log.capture :as log.capture]
   [metabase.util.malli.registry :as mr])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io File)))

(set! *warn-on-reflection* true)

(deftest ^:parallel parse-semantic-model-test
  (let [manifest (tu/flexanalytics-manifest)
        parsed   (parse/parse-semantic-model
                  (:nodes manifest)
                  (get-in manifest [:semantic_models "semantic_model.dbt_business_intelligence.fact_sales"]))]
    (is (mr/validate ::ir/semantic-model parsed))
    (is (= {:database "dbt_bi", :schema "public", :table "fact_sales"}
           (:relation parsed)))
    (testing "column types come from the model node"
      (is (= {"sales" "float", "quantity" "integer", "date_day" "date", "customer_key" "text"}
             (-> parsed
                 :columns
                 (select-keys ["sales" "quantity" "date_day" "customer_key"])
                 (update-vals :data-type)))))
    (testing "nil expr defaults to the name"
      (is (= {"fact_sales_key" "fact_sales_key", "customer" "customer_key"}
             (into {}
                   (map (juxt :name :expr))
                   (filter (comp #{"fact_sales_key" "customer"} :name) (:entities parsed))))))
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
  (let [parsed (tu/flexanalytics-ir)]
    (is (mr/validate ::ir/manifest parsed))
    ;; the fixtures are generated with the one dbt release [[fixture/dbt-version]] pins
    (is (= {:tool "dbt", :version fixture/dbt-version, :project "dbt_business_intelligence"}
            (:source parsed)))
    (is (= #{"fact_sales" "dim_customer" "dim_product" "dim_order"}
           (set (keys (:semantic-models parsed)))))
    (testing (str "the nine simple metrics parse, including the create_metric: true ones, and so do the ratio, derived"
                  " and plain cumulative ones flexanalytics_extra_metrics.yml adds")
      (is (= ["cancelled_order_share" "cumulative_sales" "customer_count" "order_count" "price" "product_count"
              "quantity" "row_count" "sales" "sales_minus_target" "sales_pct_of_target" "sales_to_target"
              "sales_to_target_ratio_2" "target"]
             (map :name (:metrics parsed)))))
    (testing "what has no Metabase equivalent is reported with the reason"
      (is (= {"customer_reorder_rate" (str "conversion metrics are out of scope: a per-entity funnel is nothing a"
                                           " Metabase metric expresses")
              "sales_mtd"             (str "a cumulative metric with grain_to_date \"month\" has no Metabase"
                                           " equivalent: a running total that resets at each month needs a breakout"
                                           " the metric cannot require")
              "sales_trailing_7d"     (str "a cumulative metric with a window of 7 day has no Metabase equivalent:"
                                           " MBQL has no rolling-window aggregation")
              "sales_vs_prior_week"   (str "input \"sales_prior_week\" has an offset_window of 7 day:"
                                           " period-over-period comparisons have no Metabase equivalent")}
             (into {} (map (juxt :name :reason)) (:unsupported parsed)))))
    (testing "a generated metric is flattened from its measure"
      (is (= {:name "sales", :label "Sales", :semantic-model "fact_sales", :measure "sales"
              :agg :sum, :expr "sales", :agg-time-dimension "date_day", :filters [], :fill-nulls-with nil
              :join-to-timespine false}
             (-> (tu/metric-named (:metrics parsed) "sales")
                 (select-keys [:name :label :semantic-model :measure :agg :expr :agg-time-dimension :filters
                               :fill-nulls-with :join-to-timespine])))))
    (testing "a hand-written metric takes its own label and meta over the measure's"
      (is (= {:label "Sales to Target Ratio", :agg :average, :expr "sales / target"
              :meta {:format {"type" "percent", "decimalPlaces" 1, "suffix" "%"}, :synonyms ["Sales Coverage Ratio"]}}
             (-> (tu/metric-named (:metrics parsed) "sales_to_target")
                 (select-keys [:label :agg :expr :meta])))))))

(deftest ^:parallel parse-metric-unsupported-test
  (let [manifest        (tu/flexanalytics-manifest)
        semantic-models (update-vals (:semantic_models manifest) #(parse/parse-semantic-model (:nodes manifest) %))
        metric          #(get-in manifest [:metrics (str "metric.dbt_business_intelligence." %)])
        sales           (metric "sales")]
    (testing "a ratio metric parses to its two inputs, which it refers to by name"
      (is (= {:type             :ratio
              :name             "sales_to_target_ratio_2"
              :unique-id        "metric.dbt_business_intelligence.sales_to_target_ratio_2"
              :label            "Sales to Target Ratio 2"
              :description      "sum(sales) / sum(target), the correct form of sales_to_target"
              :filters          []
              :fill-nulls-with  nil
              :time-granularity nil
              :meta             {}
              :numerator        {:metric "sales", :alias nil, :filters []}
              :denominator      {:metric "target", :alias nil, :filters []}}
             (parse/parse-metric semantic-models (metric "sales_to_target_ratio_2")))))
    (testing "fill_nulls_with and time_granularity are read on a ratio or derived metric too"
      (let [ratio (-> (metric "sales_to_target_ratio_2")
                      (assoc-in [:type_params :fill_nulls_with] 0)
                      (assoc :time_granularity "month"))]
        (is (= {:fill-nulls-with 0, :time-granularity "month"}
               (select-keys (parse/parse-metric semantic-models ratio) [:fill-nulls-with :time-granularity])))))
    (testing "a derived metric parses to its expr and inputs, aliases kept"
      (is (= {:type   :derived
              :expr   "sales_amt / target_amt * 100"
              :inputs [{:metric "sales", :alias "sales_amt", :filters []}
                       {:metric "target", :alias "target_amt", :filters []}]}
             (-> (parse/parse-metric semantic-models (metric "sales_pct_of_target"))
                 (select-keys [:type :expr :inputs])))))
    (testing "a ratio input's filter is kept on the input"
      (is (= {:metric  "order_count"
              :alias   "cancelled_orders"
              :filters ["{{ Dimension('order__order_status_dim') }} = 'Cancelled'"]}
             (:numerator (parse/parse-metric semantic-models (metric "cancelled_order_share"))))))
    (testing "a cumulative metric with no window parses as a simple one of type cumulative"
      (is (= {:type :cumulative, :agg :sum, :expr "sales", :semantic-model "fact_sales", :measure "sales"}
             (-> (parse/parse-metric semantic-models (metric "cumulative_sales"))
                 (select-keys [:type :agg :expr :semantic-model :measure])))))
    (testing "a dangling measure reference is reported"
      (is (= "measure \"nope\" not found on semantic model \"fact_sales\""
             (:reason (parse/parse-metric semantic-models (assoc-in sales [:type_params :measure :name] "nope"))))))
    (testing "a missing semantic model is reported"
      (is (= "semantic model \"semantic_model.x.y\" not found in manifest"
             (:reason (parse/parse-metric semantic-models
                                          (assoc-in sales [:depends_on :nodes] ["semantic_model.x.y"]))))))
    (testing "filters on either the metric or its input measure are collected"
      (is (= ["{{ Dimension('order__status') }} = 'Shipped'" "{{ Dimension('x') }} = 1"]
             (:filters (parse/parse-metric
                        semantic-models
                        (-> sales
                            (assoc :filter (tu/where-filters "{{ Dimension('order__status') }} = 'Shipped'"))
                            (assoc-in [:type_params :measure :filter]
                                      (tu/where-filters "{{ Dimension('x') }} = 1"))))))))
    (testing "a blank label falls back to the name, like a missing one"
      (is (= "sales" (:label (parse/parse-metric semantic-models (assoc sales :label "")))))
      (is (= "sales" (:label (parse/parse-metric semantic-models (assoc sales :label nil))))))))

(deftest ^:parallel advanced-metric-shapes-test
  (testing "the shapes dbt 1.12 writes for composed and conversion metrics decode as the manifest schema expects"
    (let [manifest (tu/flexanalytics-manifest)
          metric   #(get-in manifest [:metrics (str "metric.dbt_business_intelligence." %)])]
      (testing (str "ratio: numerator and denominator name metrics, and depends_on lists those metrics rather than a"
                    " semantic model")
        (is (=? {:type        :ratio
                 :type_params {:numerator      {:name "sales", :filter nil, :alias nil}
                               :denominator    {:name "target", :filter nil, :alias nil}
                               :input_measures [{:name "sales"} {:name "target"}]
                               :measure        nil}
                 :depends_on  {:nodes ["metric.dbt_business_intelligence.sales"
                                       "metric.dbt_business_intelligence.target"]}}
                (metric "sales_to_target_ratio_2"))))
      (testing "a ratio input carries its own filter and alias"
        (let [cancelled (tu/where-filters "{{ Dimension('order__order_status_dim') }} = 'Cancelled'")]
          (is (=? {:type_params {:numerator   {:name "order_count", :alias "cancelled_orders", :filter cancelled}
                                 :denominator {:name "order_count", :alias nil, :filter nil}}
                   :depends_on  {:nodes ["metric.dbt_business_intelligence.order_count"]}}
                  (metric "cancelled_order_share")))))
      (testing "derived: expr over input metrics, with optional aliases"
        (is (=? {:type        :derived
                 :type_params {:expr    "sales - target"
                               :metrics [{:name "sales", :alias nil} {:name "target", :alias nil}]}
                 :depends_on  {:nodes ["metric.dbt_business_intelligence.sales"
                                       "metric.dbt_business_intelligence.target"]}}
                (metric "sales_minus_target")))
        (is (=? {:type_params {:expr    "sales_amt / target_amt * 100"
                               :metrics [{:name "sales", :alias "sales_amt"} {:name "target", :alias "target_amt"}]}}
                (metric "sales_pct_of_target"))))
      (testing "an offset_window is a count and a granularity"
        (is (=? {:type_params {:metrics [{:name "sales", :alias nil, :offset_window nil}
                                         {:name          "sales"
                                          :alias         "sales_prior_week"
                                          :offset_window {:count 7, :granularity "day"}}]}}
                (metric "sales_vs_prior_week"))))
      (testing (str "cumulative: the measure plus cumulative_type_params, where period_agg is always written (dbt"
                    " defaults it to first), and the legacy window / grain_to_date stay nil")
        (is (=? {:type        :cumulative
                 :type_params {:measure                {:name "sales"}
                               :window                 nil
                               :grain_to_date          nil
                               :cumulative_type_params {:window nil, :grain_to_date nil, :period_agg :last}}
                 :depends_on  {:nodes ["semantic_model.dbt_business_intelligence.fact_sales"]}}
                (metric "cumulative_sales")))
        (is (=? {:type_params {:window                 nil
                               :cumulative_type_params {:window        {:count 7, :granularity "day"}
                                                        :grain_to_date nil
                                                        :period_agg    :first}}}
                (metric "sales_trailing_7d")))
        (is (=? {:type_params {:grain_to_date          nil
                               :cumulative_type_params {:window nil, :grain_to_date "month", :period_agg :first}}}
                (metric "sales_mtd"))))
      (testing "conversion params are left untyped, so what is nested in them keeps its string keys"
        (is (=? {:type        :conversion
                 :type_params {:conversion_type_params {:entity       "customer"
                                                        :calculation  "conversion_rate"
                                                        :base_measure {"name" "order_count"}
                                                        :window       {"count" 30, "granularity" "day"}}}}
                (metric "customer_reorder_rate")))))))

(defn- schema-version [v]
  (fn [m] (assoc-in m [:metadata :dbt_schema_version] (format "https://schemas.getdbt.com/dbt/manifest/%s.json" v))))

(defn- dbt-version [v]
  (fn [m] (assoc-in m [:metadata :dbt_version] v)))

(def ^:private funnel-metric
  "A `:edit` fn for [[tu/build-manifest]] that adds a metric of a type dbt's manifest schema does not have."
  (tu/add-metric "funnel" #(assoc % :type "funnel")))

(deftest ^:parallel manifest-version-test
  (testing "manifest schema v12 is the only one accepted"
    (is (= tu/sum-sales (tu/aggregation {:edit (schema-version "v12")})))
    (are [v] (thrown-with-msg? ExceptionInfo #"Unsupported dbt manifest.*manifest/v1[0-3]\.json"
                               (tu/convert {:edit (schema-version v)}))
      "v10" "v11" "v13"))
  (testing "dbt 1.12 and later are accepted, including pre-releases and a future major"
    (are [v] (= tu/sum-sales (tu/aggregation {:edit (dbt-version v)}))
      "1.12.0" "1.12.6" "1.13.0-b2" "1.20.1" "2.0.0"))
  (testing "manifests from dbt before 1.12 are rejected up front, by their version rather than by the keys they lack"
    (are [v] (thrown-with-msg? ExceptionInfo
                               (re-pattern (str "Unsupported dbt manifest.*dbt \""
                                                (java.util.regex.Pattern/quote v) "\""))
                               (tu/convert {:edit (dbt-version v)}))
      "1.11.5" "1.9.0" "1.8.0" "0.21.1" "garbage"))
  (testing "the exception carries both version fields and the schema explanation"
    (let [e (try
              (tu/convert {:edit (dbt-version "1.11.5")})
              (catch ExceptionInfo e e))]
      (is (=? {:dbt-version        "1.11.5"
               :dbt-schema-version "https://schemas.getdbt.com/dbt/manifest/v12.json"
               :errors             {:dbt_version ["only manifests written by dbt 1.12 or later are supported"]}}
              (ex-data e))))))

(deftest ^:parallel unknown-manifest-content-test
  (testing "unknown top-level keys and fields pass through"
    (is (= tu/sum-sales (tu/aggregation {:edit (fn [m]
                                              (-> m
                                                  (assoc :saved_queries {} :unit_tests {})
                                                  (assoc-in [:metrics "metric.p.m" :brand_new_field] {:x 1})))}))))
  (testing "a custom time_granularity on the metric is a free-form string; one Metabase has a unit for converts"
    (is (= tu/sum-sales (tu/aggregation {:metric {:time_granularity "fiscal_quarter"}}))))
  (testing "an entity needs only a name and a type, as in the manifest JSON schema"
    (is (= tu/sum-sales (tu/aggregation {:edit (fn [m]
                                              (update-in m [:semantic_models tu/sm-id :entities] conj
                                                         {:name "bare", :type "foreign"}))}))))
  (testing "aggregation, metric type, entity type and dimension granularity are closed enums in dbt's manifest schema"
    ;; dbt validates these when it parses the project, so a manifest it wrote never carries another value. One would
    ;; mean a dbt newer than the converter knows (`conversion` arrived with v11) or a hand-edited file: an invalid
    ;; manifest, rejected up front rather than guessed at.
    (are [edit] (thrown-with-msg? ExceptionInfo #"Invalid dbt manifest" (tu/convert {:edit edit}))
      (tu/add-measure {:name "weird", :agg "approx_count_distinct"})
      funnel-metric
      (fn [m]
        (update-in m [:semantic_models tu/sm-id :entities] conj
                   {:name "k", :type "composite", :description nil, :label nil, :role nil, :expr nil}))
      (fn [m]
        (update-in m [:semantic_models tu/sm-id :dimensions] conj
                   {:name         "fiscal_day"
                    :type         "time"
                    :description  nil
                    :label        nil
                    :is_partition false
                    :expr         "date_day"
                    :type_params  {:time_granularity "fiscal_quarter", :validity_params nil}})))))

(deftest ^:parallel invalid-manifest-errors-test
  (testing "the exception's :errors say where in the manifest the problem is, and what was expected there"
    (let [errors-of (fn [edit]
                      (try
                        (tu/convert {:edit edit})
                        (catch ExceptionInfo e
                          (:errors (ex-data e)))))]
      (is (=? {:semantic_models {tu/sm-id {:measures [{:agg [#"^should be either :sum, :min, :max, .*:count$"]}]}}}
              (errors-of (fn [m] (assoc-in m [:semantic_models tu/sm-id :measures 0 :agg] "approx_count_distinct")))))
      (is (=? {:metrics {"metric.p.funnel" {:type [#"^should be either :simple, :ratio, :cumulative, :derived.*"]}}}
              (errors-of funnel-metric)))
      (testing "an item of a list is placed by its index"
        (is (=? [#"^should be either :primary, :unique, :foreign or :natural$"]
                (get-in (errors-of (fn [m]
                                     (update-in m [:semantic_models tu/sm-id :entities] conj
                                                {:name "k", :type "composite"})))
                        [:semantic_models tu/sm-id :entities 4 :type])))))))

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
    (are [node-id resource-type] (= tu/sum-sales (tu/aggregation {:edit (re-home-model node-id resource-type)}))
      "seed.p.fact_sales"     "seed"
      "snapshot.p.fact_sales" "snapshot"))
  (testing "when depends_on lists several nodes, the one matching node_relation has the columns"
    (is (= tu/sum-sales (tu/aggregation {:edit (fn [m]
                                              (-> m
                                                  (assoc-in [:nodes "model.p.other"]
                                                            (assoc (tu/model-node {"sales" "text"})
                                                                   :unique_id "model.p.other"
                                                                   :name      "other"
                                                                   :alias     "other"))
                                                  (assoc-in [:semantic_models tu/sm-id :depends_on :nodes]
                                                            ["model.p.other" tu/model-id])))}))))
  (testing "the metrics map key need not be the unique_id"
    (is (= tu/sum-sales
           (tu/aggregation {:edit (fn [m] (update m :metrics (fn [ms] {"metric.p.weird_key" (val (first ms))})))}))))
  (testing "a semantic model with no default agg_time_dimension"
    (is (= tu/sum-sales (tu/aggregation {:edit (fn [m] (assoc-in m [:semantic_models tu/sm-id :defaults] nil))})))))

(deftest ^:parallel dangling-reference-test
  (is (re-find #"semantic model nil not found"
               (tu/unsupported {:metric {:depends_on {:macros [], :nodes []}}})))
  (is (re-find #"semantic model \"semantic_model.p.nope\" not found"
               (tu/unsupported {:metric {:depends_on {:macros [], :nodes ["semantic_model.p.nope"]}}})))
  (is (re-find #"measure \"nope\" not found on semantic model \"fact_sales\""
               (tu/unsupported {:input-measure {:name "nope"}}))))

(defn- other-type-reason
  "The reason a metric of `metric-type` with `type-params` is reported. `depends_on` lists the input metrics the way
  dbt resolves them, so that the reason is about the shape under test and not about a reference dbt did not resolve."
  [metric-type type-params]
  (let [{:keys [numerator denominator metrics]} type-params
        input-names                             (distinct (keep :name (concat [numerator denominator] metrics)))]
    (tu/unsupported {:metric      {:type       metric-type
                                   :depends_on {:macros [], :nodes (mapv #(str "metric.p." %) input-names)}}
                     :type-params (merge {:measure nil, :input_measures []} type-params)})))

(deftest ^:parallel advanced-metric-types-test
  (testing "what is structurally beyond Metabase is reported at parse time, with the reason"
    (are [metric-type type-params re] (re-find re (other-type-reason metric-type type-params))
      "derived"    {:expr    "current - previous"
                    :metrics [(tu/metric-input "a" :alias "current")
                              (tu/metric-input "a" :alias "previous" :offset_window {:count 7, :granularity "day"})]}
      #"input \"previous\" has an offset_window of 7 day"

      "derived"    {:expr    "a - mtd"
                    :metrics [(tu/metric-input "a") (tu/metric-input "a" :alias "mtd" :offset_to_grain "month")]}
      #"input \"mtd\" has an offset_to_grain of \"month\""

      "ratio"      {:numerator   (tu/metric-input "a" :offset_window {:count 1, :granularity "month"})
                    :denominator (tu/metric-input "a")}
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

      "cumulative" {:measure                (tu/input-measure {})
                    :cumulative_type_params {:window nil, :grain_to_date "month", :period_agg "first"}}
      #"grain_to_date \"month\""

      "cumulative" {:measure                (tu/input-measure {})
                    :cumulative_type_params {:window        {:count 30, :granularity "day"}
                                             :grain_to_date nil
                                             :period_agg    "last"}}
      #"a window of 30 day"

      "conversion" {:conversion_type_params {:base_measure        (tu/input-measure {})
                                             :conversion_measure  (tu/input-measure {:name "paid"})
                                             :entity              "customer"
                                             :calculation         "conversion_rate"
                                             :window              nil
                                             :constant_properties nil}}
      #"conversion metrics are out of scope"

      "conversion" {:conversion_type_params {:base_measure       (tu/input-measure {})
                                             :conversion_measure (tu/input-measure {:name "paid"})
                                             :entity             "customer"
                                             :calculation        "conversions"
                                             :window             {:count 7, :granularity "day"}}}
      #"conversion metrics are out of scope"))
  (testing "a reference to a metric the manifest does not have is reported when the metric is resolved"
    (are [metric-type type-params] (re-find #"metric \"a\" not found" (other-type-reason metric-type type-params))
      "ratio"   {:numerator (tu/metric-input "a"), :denominator (tu/metric-input "b")}
      "derived" {:expr "a * 100", :metrics [(tu/metric-input "a")]})))

(deftest ^:parallel cumulative-period-agg-test
  (testing "a cumulative metric with no window and period_agg last converts to a running sum"
    (is (= [:cum-sum {} (fld "sales" :type/Float)]
           (tu/aggregation {:metric      {:type "cumulative"}
                            :type-params {:cumulative_type_params {:window        nil
                                                                   :grain_to_date nil
                                                                   :period_agg    "last"}}}))))
  (testing (str "period_agg first, dbt's default, and average are the running total at the start of each period or its"
                " mean, which Metabase does not compute")
    (are [type-params] (re-find (re-pattern (str "^a cumulative metric with period_agg (first|average) has no Metabase"
                                                 " equivalent: .* set period_agg: last to convert it$"))
                                (tu/unsupported {:metric {:type "cumulative"}, :type-params type-params}))
      {:cumulative_type_params {:window nil, :grain_to_date nil, :period_agg "first"}}
      {:cumulative_type_params {:window nil, :grain_to_date nil, :period_agg "average"}}
      ;; a manifest without period_agg means dbt's default
      {:cumulative_type_params {:window nil, :grain_to_date nil}}
      {})
    (testing "a window or grain_to_date is the reason before period_agg is"
      (is (re-find #"^a cumulative metric with a window"
                   (tu/unsupported {:metric      {:type "cumulative"}
                                    :type-params {:cumulative_type_params {:window        {:count 7, :granularity "day"}
                                                                           :grain_to_date nil
                                                                           :period_agg    "first"}}}))))))

(defn- inline
  "Tweaks for a 1.12 inline-spec simple metric that carries `params` in `metric_aggregation_params` and `expr` in
  `type_params`, the way dbt 1.12 writes one (see the `parcel_delivery` fixture), instead of pointing at a measure.
  `more` are further tweaks."
  [{:keys [expr] :as params} & {:as more}]
  (merge {:type-params {:measure                   nil
                        :input_measures            []
                        :expr                      expr
                        :metric_aggregation_params (merge {:semantic_model         "fact_sales"
                                                           :agg_params             nil
                                                           :agg_time_dimension     nil
                                                           :non_additive_dimension nil}
                                                          (dissoc params :expr))}}
         more))

(deftest ^:parallel inline-spec-test
  (is (= tu/sum-sales (tu/aggregation (inline {:agg "sum", :expr "sales"}))))
  (is (= [:distinct {} (fld "customer_key" :type/Text)]
         (tu/aggregation (inline {:agg "count_distinct", :expr "customer_key"}))))
  (is (= [:percentile {} (fld "sales" :type/Float) 0.9]
         (tu/aggregation (inline {:agg "percentile", :expr "sales", :agg_params {:percentile 0.9}}))))
  (is (= [:count {}] (tu/aggregation (inline {:agg "count", :expr "1"}))))
  (testing "no expr defaults to the metric name, documented column or not"
    (is (= tu/sum-sales (tu/aggregation (inline {:agg "sum"} :metric {:name "sales", :unique_id "metric.p.sales"}))))
    (is (= [:sum {} (fld "m" nil)] (tu/aggregation (inline {:agg "sum"})))))
  (testing "agg_time_dimension override is accepted"
    (is (= tu/sum-sales (tu/aggregation (inline {:agg "sum", :expr "sales", :agg_time_dimension "nope"})))))
  (testing "fill_nulls_with on the metric"
    (is (= [:coalesce {} tu/sum-sales 0]
           (tu/aggregation (update (inline {:agg "sum", :expr "sales"}) :type-params assoc :fill_nulls_with 0)))))
  (is (re-find #"neither a measure nor metric_aggregation_params"
               (tu/unsupported {:type-params {:measure nil, :input_measures [], :metric_aggregation_params nil}})))
  (is (= "non-additive measures have no Metabase equivalent"
         (tu/unsupported (inline {:agg "sum", :expr "sales"
                                  :non_additive_dimension {:name "date_day", :window_choice "max"}}))))
  (testing "a measure and inline params both present: the measure wins"
    (is (= tu/sum-sales
           (tu/aggregation {:type-params {:expr                      "sales"
                                          :metric_aggregation_params {:semantic_model         "fact_sales"
                                                                      :agg                    "max"
                                                                      :agg_params             nil
                                                                      :agg_time_dimension     nil
                                                                      :non_additive_dimension nil}}})))))

(defn- parse-built
  "The IR the manifest [[tu/build-manifest]] makes from `tweaks` parses into, decoded the way the converter reads it."
  [tweaks]
  (-> (tu/build-manifest tweaks) tu/round-trip dbt-manifest/decode-manifest parse/parse-manifest))

(defn- built-metric
  "The IR of the metric `m` of the manifest [[tu/build-manifest]] makes from `tweaks`, or its `:unsupported` entry."
  [tweaks]
  (let [{:keys [metrics unsupported]} (parse-built tweaks)]
    (or (tu/metric-named metrics "m")
        (tu/metric-named unsupported "m"))))

(deftest ^:parallel time-granularity-test
  (testing "every grain of a time dimension is lifted into the IR as written"
    (are [grain] (= grain
                    (-> (parse-built {:edit (tu/edit-semantic-model
                                             #(assoc % :dimensions [(tu/dimension "d" "time"
                                                                                  :granularity (name grain))]))})
                        (get-in [:semantic-models "fact_sales" :dimensions 0 :granularity])))
      :hour :day :week :month :quarter :year))
  (testing "a metric's time_granularity is a free-form string, kept as written"
    (are [grain] (= grain (:time-granularity (built-metric {:metric {:time_granularity grain}})))
      "week" "quarter" "year" "fiscal_quarter")))

(defn- temp-manifest
  "A temporary file holding `content`, deleted when the JVM exits."
  ^File [content]
  (let [f (File/createTempFile "manifest" ".json")]
    (.deleteOnExit f)
    (spit f content)
    f))

(defn- read-error
  "How [[parse/read-manifest]] fails on a file holding `content`: the message with the file's path replaced by
  `<path>`, and whether the message and the exception's data carry the path. Nil when it reads."
  [content]
  (let [path (.getPath (temp-manifest content))]
    (try
      (parse/read-manifest path)
      nil
      (catch ExceptionInfo e
        {:message          (str/replace (ex-message e) path "<path>")
         :path-in-message? (str/includes? (ex-message e) path)
         :path-in-data?    (= path (:path (ex-data e)))}))))

(defn- old-manifest
  "The fixture manifest as JSON, written by dbt 1.11.5."
  []
  (json/encode (assoc-in (tu/build-manifest {}) [:metadata :dbt_version] "1.11.5")))

(deftest ^:parallel read-manifest-errors-test
  (testing "every failure to read a manifest names the file, in the message and in the exception's data"
    (are [content message] (= {:message message, :path-in-message? true, :path-in-data? true}
                              (read-error content))
      ""      "Invalid dbt manifest <path>: the file is empty"
      "[1, 2]" "Invalid dbt manifest <path>: the file holds a JSON array, not an object"
      "42"    "Invalid dbt manifest <path>: the file holds a JSON value that is not an object"
      "{}"    "Invalid dbt manifest (<path>)"
      (old-manifest) (str "Unsupported dbt manifest: the converter reads manifests written by dbt 1.12 or later"
                          " (manifest schema v12), this one says dbt \"1.11.5\" and"
                          " \"https://schemas.getdbt.com/dbt/manifest/v12.json\" (<path>)"))
    (testing "truncated JSON, with the JSON parser's own message"
      (is (=? {:message #"(?s)^Cannot read dbt manifest <path>: Unexpected end-of-input.*", :path-in-message? true
               :path-in-data? true}
              (read-error "{\"metadata\": "))))
    (testing "a file that does not exist"
      (is (thrown-with-msg? ExceptionInfo #"^Cannot read dbt manifest /nope/manifest\.json: "
                            (parse/read-manifest "/nope/manifest.json"))))
    (testing "the decode error's own data comes along"
      (let [path (.getPath (temp-manifest (old-manifest)))]
        (is (=? {:dbt-version "1.11.5", :dbt-schema-version string?, :errors map?, :path path}
                (try
                  (parse/read-manifest path)
                  (catch ExceptionInfo e
                    (ex-data e)))))))))

(def ^:private with-ratio
  "A `:edit` fn for [[tu/build-manifest]] that adds a ratio metric `r` of `m` to `m`."
  (tu/add-metric "r" #(-> %
                          (assoc :type "ratio", :depends_on {:macros [], :nodes ["metric.p.m"]})
                          (assoc-in [:type_params :measure] nil)
                          (assoc-in [:type_params :numerator] (tu/metric-input "m"))
                          (assoc-in [:type_params :denominator] (tu/metric-input "m")))))

(deftest parse-error-test
  (testing "an exception while parsing one metric is logged and reported as an error; the other metrics still parse"
    (mt/with-dynamic-fn-redefs [parse/parse-ratio (fn [_] (throw (NullPointerException. "boom")))]
      (log.capture/with-log-messages-for-level [messages [dev.dbt-import.parse :error]]
        (let [{:keys [metrics unsupported]} (parse-built {:edit with-ratio})]
          (is (= ["m"] (map :name metrics)))
          (is (= [{:name      "r"
                   :unique-id "metric.p.r"
                   :reason    "error parsing metric (java.lang.NullPointerException): boom"
                   :error?    true}]
                 unsupported))
          (is (=? [{:level :error, :message "Error parsing metric \"r\""}] (messages)))))))
  (testing (str "an exception while parsing a semantic model is logged and reported the same way, and the metrics over"
                " it are reported as over a model the manifest does not have")
    (mt/with-dynamic-fn-redefs [parse/parse-columns (fn [_] (throw (IllegalStateException. "boom")))]
      (log.capture/with-log-messages-for-level [messages [dev.dbt-import.parse :error]]
        (let [{:keys [semantic-models metrics unsupported]} (parse-built {})
              reason (str "error parsing semantic model (java.lang.IllegalStateException): boom")]
          (is (= {} semantic-models))
          (is (= [] metrics))
          (is (= {"fact_sales"  [reason true]
                  "dim_product" [reason true]
                  "dim_order"   [reason true]
                  "m"           ["semantic model \"semantic_model.p.fact_sales\" not found in manifest" nil]}
                 (into {} (map (juxt :name (juxt :reason :error?))) unsupported)))
          (is (= 3 (count (messages)))))))))

(deftest ^:parallel cumulative-input-offset-test
  (let [manifest        (parse/read-manifest tu/parcel-delivery-manifest-filename)
        semantic-models (update-vals (:semantic_models manifest) #(parse/parse-semantic-model (:nodes manifest) %))
        to-date         (get-in manifest [:metrics "metric.parcel_delivery.parcels_to_date"])
        reason          (fn [edit-reference]
                          (:reason (parse/parse-metric semantic-models (:metrics manifest)
                                                       (update-in to-date [:type_params :cumulative_type_params :metric]
                                                                  edit-reference))))]
    (testing "an inline-spec cumulative metric over an input shifted in time is reported, as a ratio input is"
      (is (= (str "input \"parcel_count\" has an offset_window of 1 month: period-over-period comparisons have no"
                  " Metabase equivalent")
             (reason #(assoc % :offset_window {:count 1, :granularity "month"}))))
      (is (= (str "input \"last_month\" has an offset_window of 1 month: period-over-period comparisons have no"
                  " Metabase equivalent")
             (reason #(assoc % :alias "last_month", :offset_window {:count 1, :granularity "month"}))))
      (is (= (str "input \"parcel_count\" has an offset_to_grain of \"month\": comparisons with the start of a period"
                  " have no Metabase equivalent")
             (reason #(assoc % :offset_to_grain "month")))))
    (testing "the reference has to name the metric depends_on resolved to"
      (is (= (str "cumulative_type_params.metric names \"other\" but depends_on resolved to the metric"
                  " \"parcel_count\": the manifest disagrees with itself")
             (reason #(assoc % :name "other")))))
    (testing "a manifest with the depends_on node alone, no reference, still parses"
      (is (nil? (reason (constantly nil)))))))

(defn- without-nulls
  "`manifest`, raw JSON with string keys, with every key whose value is null left out: what a writer that omits unset
  keys instead of writing `null` would produce."
  [manifest]
  (walk/postwalk (fn [x]
                   (if (map? x)
                     (into {} (remove (comp nil? val)) x)
                     x))
                 manifest))

(defn- bare
  "A `:edit` fn for [[tu/build-manifest]] that strips the fixture down to the keys the published manifest schema
  requires, plus what the metric needs to convert to the sum of `sales`."
  [manifest]
  (-> manifest
      (update-in [:nodes tu/model-id] dissoc :description :relation_name)
      (update-in [:nodes tu/model-id :columns] update-vals #(dissoc % :description))
      (update-in [:semantic_models tu/sm-id] dissoc :label :description :defaults :primary_entity :config)
      (update-in [:semantic_models tu/sm-id :node_relation] dissoc :relation_name)
      (update-in [:semantic_models tu/sm-id :entities] (partial mapv #(dissoc % :description :label :role)))
      (update-in [:semantic_models tu/sm-id :dimensions] (partial mapv #(dissoc % :description :label :is_partition)))
      (update-in [:semantic_models tu/sm-id :measures 0]
                 dissoc :description :label :create_metric :agg_params :non_additive_dimension :agg_time_dimension
                 :config)
      (update-in [:metrics "metric.p.m"] dissoc :filter :description :label :time_granularity :meta :config)
      (assoc-in [:metrics "metric.p.m" :type_params] {:measure {:name "m"}})))

(deftest ^:parallel optional-keys-test
  (testing "a manifest that leaves out the keys dbt-core writes as null parses to the same IR"
    (doseq [manifest-filename [tu/flexanalytics-manifest-filename tu/parcel-delivery-manifest-filename]]
      (testing manifest-filename
        (let [raw (with-open [r (io/reader manifest-filename)]
                    (json/decode r))]
          (is (= (parse/parse-manifest-file manifest-filename)
                 (parse/parse-manifest (dbt-manifest/decode-manifest (without-nulls raw))))))))
    (is (= (parse-built {})
           (-> (tu/build-manifest {}) tu/round-trip without-nulls dbt-manifest/decode-manifest parse/parse-manifest))))
  (testing "a manifest with little more than the keys the published schema requires converts"
    (is (= tu/sum-sales (tu/aggregation {:edit bare})))
    (is (= {:default-agg-time-dimension nil, :label nil, :description nil}
           (-> (parse-built {:edit bare})
               (get-in [:semantic-models "fact_sales"])
               (select-keys [:default-agg-time-dimension :label :description]))))
    (is (= {:filters [], :fill-nulls-with nil, :join-to-timespine false, :time-granularity nil, :meta nil
            :label   "m", :description nil, :agg-time-dimension nil}
           (select-keys (built-metric {:edit bare})
                        [:filters :fill-nulls-with :join-to-timespine :time-granularity :meta :label :description
                         :agg-time-dimension])))))

(deftest ^:parallel parse-validity-params-test
  (testing "a natural entity and a time dimension's validity_params, dbt's SCD type II, are carried into the IR"
    (let [edit  (tu/edit-semantic-model
                 #(-> %
                      (update :entities conj (tu/entity "customer_version" "natural" :expr "customer_key"))
                      (assoc :dimensions [(assoc-in (tu/dimension "valid_from" "time")
                                                    [:type_params :validity_params] {:is_start true, :is_end false})
                                          (assoc-in (tu/dimension "valid_to" "time")
                                                    [:type_params :validity_params] {:is_end true})
                                          (tu/dimension "date_day" "time")])))
          model (get-in (parse-built {:edit edit}) [:semantic-models "fact_sales"])]
      (is (= {:name "customer_version", :type :natural, :expr "customer_key"}
             (select-keys (last (:entities model)) [:name :type :expr])))
      (is (= {"valid_from" {:is-start true, :is-end false}
              "valid_to"   {:is-start false, :is-end true}
              "date_day"   nil}
             (into {} (map (juxt :name :validity-params)) (:dimensions model)))
          "a flag left out is false, as dbt defaults it"))))

(deftest ^:parallel inline-aggregation-params-expr-test
  (let [inline-expr (fn [tweaks expr]
                      (update tweaks :type-params assoc-in [:metric_aggregation_params :expr] expr))]
    (testing (str "an expr inside metric_aggregation_params, which the published schema allows, is read when"
                  " type_params has none")
      (is (= tu/sum-sales (tu/aggregation (inline-expr (inline {:agg "sum"}) "sales")))))
    (testing "type_params.expr is the one dbt writes; the two may agree, and a disagreement is reported"
      (is (= tu/sum-sales (tu/aggregation (inline-expr (inline {:agg "sum", :expr "sales"}) "sales"))))
      (is (= "metric_aggregation_params.expr \"quantity\" disagrees with type_params.expr \"sales\""
             (tu/unsupported (inline-expr (inline {:agg "sum", :expr "sales"}) "quantity")))))))

(deftest ^:parallel depends-on-cross-check-test
  (testing "a ratio or derived input that is not among the metrics depends_on lists is reported"
    (are [metric-type type-params]
         (= (str "input metric \"b\" is not among the metrics depends_on lists: the manifest did not resolve it, so it"
                 " is not read")
            (tu/unsupported {:metric      {:type metric-type, :depends_on {:macros [], :nodes ["metric.p.a"]}}
                             :type-params (merge {:measure nil, :input_measures []} type-params)}))
      "ratio"   {:numerator (tu/metric-input "a"), :denominator (tu/metric-input "b")}
      "derived" {:expr "a + b", :metrics [(tu/metric-input "a") (tu/metric-input "b")]}))
  (testing "metric_aggregation_params has to name the semantic model depends_on resolved to, when it names one"
    (is (= (str "metric_aggregation_params names semantic model \"dim_product\" but depends_on resolved to"
                " \"fact_sales\": the manifest disagrees with itself")
           (tu/unsupported (inline {:agg "sum", :expr "sales", :semantic_model "dim_product"}))))
    (is (= tu/sum-sales (tu/aggregation (inline {:agg "sum", :expr "sales", :semantic_model nil}))))))

(deftest ^:parallel simple-metric-extras-precedence-test
  (testing "fill_nulls_with: the metric's own over its input measure's; 0 is a value"
    (are [type-params input-measure expected]
         (= expected (:fill-nulls-with (built-metric {:type-params type-params, :input-measure input-measure})))
      {:fill_nulls_with 1} {:fill_nulls_with 2} 1
      {:fill_nulls_with 0} {:fill_nulls_with 2} 0
      {}                   {:fill_nulls_with 2} 2
      {}                   {}                   nil))
  (testing "join_to_timespine: true when either says so"
    (are [type-params input-measure expected]
         (= expected (:join-to-timespine (built-metric {:type-params type-params, :input-measure input-measure})))
      {:join_to_timespine true} {}                        true
      {}                        {:join_to_timespine true} true
      {}                        {}                        false))
  (testing "filters: the metric's own first, then its input measure's; both apply"
    (is (= ["{{ Dimension('x') }} = 1" "{{ Dimension('y') }} = 2"]
           (:filters (built-metric {:metric        {:filter (tu/where-filters "{{ Dimension('x') }} = 1")}
                                    :input-measure {:filter (tu/where-filters "{{ Dimension('y') }} = 2")}})))))
  (testing "an inline-spec cumulative metric: its own, then the metric it runs over's, then the reference's"
    (let [manifest        (parse/read-manifest tu/parcel-delivery-manifest-filename)
          semantic-models (update-vals (:semantic_models manifest) #(parse/parse-semantic-model (:nodes manifest) %))
          cumulative-id   "metric.parcel_delivery.parcels_to_date"
          input-id        "metric.parcel_delivery.parcel_count"
          parsed          (fn [edit-cumulative edit-input]
                            (let [metrics (-> (:metrics manifest)
                                              (update cumulative-id edit-cumulative)
                                              (update input-id edit-input))]
                              (parse/parse-metric semantic-models metrics (get metrics cumulative-id))))
          fill-nulls      (fn [value] #(assoc-in % [:type_params :fill_nulls_with] value))]
      (is (= 3 (:fill-nulls-with (parsed (fill-nulls 3) (fill-nulls 5)))))
      (is (= 5 (:fill-nulls-with (parsed identity (fill-nulls 5)))))
      (is (true? (:join-to-timespine (parsed identity #(assoc-in % [:type_params :join_to_timespine] true)))))
      (is (= ["{{ Dimension('parcel__is_insured') }}"
              "{{ Dimension('parcel__is_delivered') }}"
              "{{ Dimension('parcel__is_fragile') }}"]
             (:filters (parsed #(-> %
                                    (assoc :filter (tu/where-filters "{{ Dimension('parcel__is_insured') }}"))
                                    (assoc-in [:type_params :cumulative_type_params :metric :filter]
                                              (tu/where-filters "{{ Dimension('parcel__is_fragile') }}")))
                               #(assoc % :filter (tu/where-filters "{{ Dimension('parcel__is_delivered') }}")))))))))
