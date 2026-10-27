(ns dev.dbt-import.advanced-metrics-test
  "The metric types that compose other metrics (QRES-5): a ratio or derived metric becomes the same arithmetic over
  `:metric` references to the cards its input metrics convert to, an input with a filter of its own is inlined as a
  `:sum-where`, `:count-where` or `:distinct-where` so the metric stays one card, a cumulative metric becomes
  `:cum-sum` or `:cum-count`, and what has no Metabase equivalent (offsets, cumulative windows, conversion) is
  reported.

  Written ahead of the implementation as its target. The parse-time reasons for what is reported (offsets, windows,
  conversion) are in `dev.dbt-import.parse-test/advanced-metric-types-test`.

  Each built manifest puts simple metrics (see [[input-metrics]]) next to the metric under test, `m`, in the shape
  dbt 1.12 writes: a ratio or derived
  metric's `depends_on.nodes` lists its input *metrics*, not a semantic model, and `input_measures` is filled in
  transitively. [[convert-all]] names the `:metric` leaves of what comes out after the metric each refers to, so an
  expectation reads `[:metric {} \"sales\"]` rather than an entity_id."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [are deftest is testing]]
   [clojure.walk :as walk]
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.test-util :as tu :refer [fld]]))

(set! *warn-on-reflection* true)

(def ^:private input-measures
  "The measures the input metrics aggregate, replacing the fixture's default `m`."
  [(assoc (tu/base-measure) :name "sales" :expr "sales")
   (assoc (tu/base-measure) :name "target" :expr "target")
   (assoc (tu/base-measure) :name "order_count" :agg "count_distinct" :expr "order_key")
   (assoc (tu/base-measure) :name "row_count" :expr "1")
   (assoc (tu/base-measure) :name "avg_sales" :agg "average" :expr "sales")])

(def ^:private shipped-filter
  {:where_filters [{:where_sql_template "{{ Dimension('fact_sales_key__status') }} = 'Shipped'"}]})

(def ^:private input-metrics
  "The simple metrics next to the metric under test: name, the measure it aggregates and its own filter. `sales`,
  `target`, `order_count` and `row_count` are what dbt generates from `create_metric: true`; `avg_sales` is an
  average, which has no filtered form; `shipped_sales` is `sales` with a filter of its own."
  [["sales"         "sales"       nil]
   ["target"        "target"      nil]
   ["order_count"   "order_count" nil]
   ["row_count"     "row_count"   nil]
   ["avg_sales"     "avg_sales"   nil]
   ["shipped_sales" "sales"       shipped-filter]])

(defn- simple-metric
  "A simple metric `metric-name` over `measure-name` with `metric-filter`; `base` is the fixture's metric `m` to take
  the boilerplate from."
  [base [metric-name measure-name metric-filter]]
  (-> base
      (assoc :name metric-name, :unique_id (str "metric.p." metric-name), :label metric-name, :type "simple"
             :filter metric-filter, :depends_on {:macros [], :nodes [tu/sm-id]})
      (assoc-in [:type_params :measure] (tu/input-measure {:name measure-name}))
      (assoc-in [:type_params :input_measures] [(tu/input-measure {:name measure-name})])))

(defn- with-input-metrics
  "A `:edit` fn for [[tu/build-manifest]] that adds [[input-metrics]]."
  [manifest]
  (let [base (get-in manifest [:metrics "metric.p.m"])]
    (update manifest :metrics into
            (map (fn [[metric-name :as input-metric]] [(str "metric.p." metric-name) (simple-metric base input-metric)]))
            input-metrics)))

(defn- composed
  "[[tu/build-manifest]] tweaks for a `metric-type` (ratio or derived) metric `m` with `type-params` over the input
  metrics `inputs`, alongside the simple metrics."
  [metric-type inputs type-params]
  {:measures    input-measures
   :columns     {"target" "float"}
   :metric      {:type       metric-type
                 :depends_on {:macros [], :nodes (mapv #(str "metric.p." %) inputs)}}
   :type-params (merge {:measure nil, :input_measures (mapv #(tu/input-measure {:name %}) inputs)} type-params)
   :edit        with-input-metrics})

(defn- cumulative
  "[[tu/build-manifest]] tweaks for a cumulative metric `m` over the measure `sales` (unless `type-params` says
  otherwise), alongside the simple metrics."
  [type-params]
  {:measures    input-measures
   :columns     {"target" "float"}
   :metric      {:type "cumulative"}
   :type-params (merge {:measure (tu/input-measure {:name "sales"}), :input_measures [(tu/input-measure {:name "sales"})]}
                       type-params)
   :edit        with-input-metrics})

(defn- name-metric-refs
  "`clause` with the entity_id of each `[:metric {} entity-id]` leaf replaced by the name of the converted metric it
  refers to, looked up in `names` (entity_id → name). An id that is no converted metric's is left as it is."
  [names clause]
  (walk/postwalk (fn [x]
                   (if (and (vector? x) (= :metric (first x)) (= 3 (count x)))
                     (update x 2 #(names % %))
                     x))
                 clause))

(defn- convert-all
  "Everything a resolved manifest converts to, by metric name: `:aggregation` (the exported aggregation clause, its
  `:metric` leaves named, see [[name-metric-refs]]), `:filters` (exported filter clauses), `:unsupported` (the
  reason), and `:paths`, the card files in the order they are written."
  [resolved]
  (let [names       (into {} (map (juxt :entity-id (comp :name :metric))) (:metrics resolved))
        stage       (fn [resolved-metric] (-> (emit/dataset-query resolved-metric) :stages first))
        by-name     (fn [f] (into {} (map (juxt (comp :name :metric) f)) (:metrics resolved)))]
    {:aggregation (by-name #(name-metric-refs names (-> % stage :aggregation first)))
     :filters     (by-name #(-> % stage (:filters [])))
     :unsupported (into {} (map (juxt :name :reason)) (:unsupported resolved))
     :paths       (mapv :path (rest (emit/files tu/default-config resolved)))}))

(defn- convert
  "[[convert-all]] for the manifest [[tu/build-manifest]] makes from `tweaks`."
  [tweaks]
  (convert-all (tu/resolve-manifest-map (tu/build-manifest tweaks))))

(defn- position
  "Where the card file of the metric labelled `label` sits among `paths`, or nil when it was not written."
  [paths label]
  (first (keep-indexed (fn [i path] (when (= path (str "collections/main/dbt_metrics/" label ".yaml")) i)) paths)))

(defn- written-before?
  "Whether the card file of the metric labelled `earlier` comes before that of `later` in `paths`; false when either was
  not written."
  [paths earlier later]
  (let [i (position paths earlier)
        j (position paths later)]
    (boolean (and i j (< i j)))))

(def ^:private sum-sales [:sum {} (fld "sales" :type/Float)])
(def ^:private sum-target [:sum {} (fld "target" :type/Float)])
(def ^:private cum-sum-sales [:cum-sum {} (fld "sales" :type/Float)])

(def ^:private order-status
  "`dim_order.status`, reached from `fact_sales` through the `order` entity's column."
  (tu/joined-fld "order_key" "dim_order" "status" :type/Text))

(def ^:private cancelled-filter
  {:where_filters [{:where_sql_template "{{ Dimension('order__order_status_dim') }} = 'Cancelled'"}]})

(def ^:private cancelled [:= {} order-status "Cancelled"])
(def ^:private shipped [:= {} (fld "status" :type/Text) "Shipped"])

(deftest ^:parallel ratio-test
  (testing "a ratio divides references to its input metrics' cards; the inputs convert as before"
    (let [{:keys [aggregation unsupported]}
          (convert (composed "ratio" ["sales" "target"]
                             {:numerator (tu/metric-input "sales"), :denominator (tu/metric-input "target")}))]
      (is (= {} unsupported))
      (is (= [:/ {} [:metric {} "sales"] [:metric {} "target"]] (aggregation "m")))
      (is (= sum-sales (aggregation "sales")))
      (is (= sum-target (aggregation "target")))))
  (testing "the same metric on both sides"
    (is (= [:/ {} [:metric {} "sales"] [:metric {} "sales"]]
           (-> (convert (composed "ratio" ["sales"] {:numerator (tu/metric-input "sales"), :denominator (tu/metric-input "sales")}))
               :aggregation
               (get "m")))))
  (testing "an input that is not in the manifest is reported"
    (is (re-find #"metric \"nope\""
                 (-> (convert (composed "ratio" ["sales" "nope"] {:numerator (tu/metric-input "sales"), :denominator (tu/metric-input "nope")}))
                     :unsupported
                     (get "m"))))))

(defn- filtered-ratio
  "Tweaks for a ratio `m` of `numerator` filtered by `cancelled-filter` (with `alias`, when given) to `denominator`."
  [numerator denominator & {:keys [alias]}]
  (composed "ratio" (distinct [numerator denominator])
            {:numerator   (tu/metric-input numerator :alias alias :filter cancelled-filter)
             :denominator (tu/metric-input denominator)}))

(deftest ^:parallel ratio-input-filter-test
  (testing "an input with its own filter is inlined as the filtered form of its aggregation, so the metric stays one card"
    (let [{:keys [aggregation filters unsupported]} (convert (filtered-ratio "order_count" "order_count" :alias "cancelled_orders"))]
      (is (= {} unsupported))
      (is (= [:/ {} [:distinct-where {} (fld "order_key" :type/Text) cancelled] [:metric {} "order_count"]]
             (aggregation "m")))
      (is (= [:distinct {} (fld "order_key" :type/Text)] (aggregation "order_count")) "the input itself is untouched")
      (is (= [] (filters "order_count"))))
    (are [numerator expected] (= [:/ {} expected [:metric {} "target"]]
                                 (-> (convert (filtered-ratio numerator "target")) :aggregation (get "m")))
      "sales"     [:sum-where {} (fld "sales" :type/Float) cancelled]
      "row_count" [:count-where {} cancelled]))
  (testing "the input's own filter and the one on the reference both apply"
    (is (= [:/ {} [:sum-where {} (fld "sales" :type/Float) [:and {} shipped cancelled]] [:metric {} "target"]]
           (-> (convert (filtered-ratio "shipped_sales" "target")) :aggregation (get "m")))))
  (testing "an aggregation with no filtered form is reported"
    (is (re-find #"average"
                 (-> (convert (filtered-ratio "avg_sales" "target")) :unsupported (get "m")))))
  (testing "an alias alone changes nothing: the ratio refers to the input itself"
    (is (= [:/ {} [:metric {} "sales"] [:metric {} "target"]]
           (-> (convert (composed "ratio" ["sales" "target"]
                                  {:numerator (tu/metric-input "sales" :alias "num"), :denominator (tu/metric-input "target" :alias "den")}))
               :aggregation
               (get "m"))))))

(defn- derived
  "Tweaks for a derived metric `m` with `expr` over `metric-inputs` (default `sales` and `target`)."
  ([expr]
   (derived expr [(tu/metric-input "sales") (tu/metric-input "target")]))
  ([expr metric-inputs]
   (composed "derived" (distinct (map :name metric-inputs)) {:expr expr, :metrics metric-inputs})))

(deftest ^:parallel derived-test
  (testing "an expr over input metrics is the same arithmetic over references to their cards"
    (are [expr expected] (= expected (-> (convert (derived expr)) :aggregation (get "m")))
      "sales - target"            [:- {} [:metric {} "sales"] [:metric {} "target"]]
      "sales / target"            [:/ {} [:metric {} "sales"] [:metric {} "target"]]
      "sales / target * 100"      [:* {} [:/ {} [:metric {} "sales"] [:metric {} "target"]] 100]
      "(sales - target) / target" [:/ {} [:- {} [:metric {} "sales"] [:metric {} "target"]] [:metric {} "target"]]
      "sales / 1000"              [:/ {} [:metric {} "sales"] 1000]
      "sales * 1.5"               [:* {} [:metric {} "sales"] 1.5]))
  (testing "aliases name the inputs in the expr"
    (is (= [:* {} [:/ {} [:metric {} "sales"] [:metric {} "target"]] 100]
           (-> (convert (derived "sales_amt / target_amt * 100"
                                 [(tu/metric-input "sales" :alias "sales_amt") (tu/metric-input "target" :alias "target_amt")]))
               :aggregation
               (get "m")))))
  (testing "a derived metric over a derived metric refers to its card"
    (let [d-metric (fn [manifest]
                     (let [base (get-in manifest [:metrics "metric.p.m"])]
                       (assoc-in manifest [:metrics "metric.p.d"]
                                 (-> base
                                     (assoc :name "d", :unique_id "metric.p.d", :label "d")
                                     (assoc-in [:type_params :expr] "sales - target")
                                     (assoc-in [:type_params :metrics] [(tu/metric-input "sales") (tu/metric-input "target")])
                                     (assoc-in [:type_params :input_measures] [(tu/input-measure {:name "sales"}) (tu/input-measure {:name "target"})])
                                     (assoc-in [:depends_on :nodes] ["metric.p.sales" "metric.p.target"])))))
          tweaks   (-> (composed "derived" ["d"] {:expr "d * 2", :metrics [(tu/metric-input "d")]})
                       (assoc-in [:type-params :input_measures] [(tu/input-measure {:name "sales"}) (tu/input-measure {:name "target"})])
                       (update :edit (fn [edit] (comp d-metric edit))))
          {:keys [aggregation unsupported]} (convert tweaks)]
      (is (= {} unsupported))
      (is (= [:- {} [:metric {} "sales"] [:metric {} "target"]] (aggregation "d")))
      (is (= [:* {} [:metric {} "d"] 2] (aggregation "m")))))
  (testing "dividing by NULLIF(x, 0) is plain division, as in a measure"
    (is (= [:/ {} [:metric {} "sales"] [:metric {} "target"]]
           (-> (convert (derived "sales / nullif(target, 0)")) :aggregation (get "m")))))
  (testing "what the expr cannot say in MBQL is reported"
    (are [expr re] (re-find re (-> (convert (derived expr)) :unsupported (get "m")))
      "coalesce(sales, 0) - target" #"(?i)coalesce"
      "sales - nope"                #"nope"
      "sales - target = 0"          #"(?i)comparison|="))
  (testing "an input with its own filter is inlined, as in a ratio"
    (is (= [:- {} [:distinct-where {} (fld "order_key" :type/Text) cancelled] [:metric {} "order_count"]]
           (-> (convert (derived "cancelled - order_count"
                                 [(tu/metric-input "order_count" :alias "cancelled" :filter cancelled-filter)
                                  (tu/metric-input "order_count")]))
               :aggregation
               (get "m"))))))

(deftest ^:parallel offset-test
  (testing "period-over-period inputs have no Metabase equivalent and are reported, naming the input"
    (is (re-find #"offset_window.*sales_prior_week|sales_prior_week.*offset_window"
                 (-> (convert (derived "sales - sales_prior_week"
                                       [(tu/metric-input "sales")
                                        (tu/metric-input "sales" :alias "sales_prior_week" :offset_window {:count 7, :granularity "day"})]))
                     :unsupported
                     (get "m"))))
    (is (re-find #"offset_to_grain"
                 (-> (convert (derived "sales - mtd"
                                       [(tu/metric-input "sales")
                                        (tu/metric-input "sales" :alias "mtd" :offset_to_grain "month")]))
                     :unsupported
                     (get "m"))))))

(deftest ^:parallel cumulative-test
  (testing "a cumulative metric with no window is a running sum"
    (is (= cum-sum-sales (tu/aggregation (cumulative {}))))
    (testing "also with the period_agg dbt 1.12 writes by default"
      (is (= cum-sum-sales
             (tu/aggregation (cumulative {:cumulative_type_params {:window nil, :grain_to_date nil, :period_agg "first"}}))))))
  (testing "over a row count it is a running count"
    (is (= [:cum-count {}] (tu/aggregation (cumulative {:measure (tu/input-measure {:name "row_count"})})))))
  (testing "a filter on the metric applies as on a simple one"
    (is (= [[:= {} (fld "status" :type/Text) "Shipped"]]
           (tu/filters (merge (cumulative {})
                              {:metric {:type   "cumulative"
                                        :filter {:where_filters [{:where_sql_template "{{ Dimension('fact_sales_key__status') }} = 'Shipped'"}]}}})))))
  (testing "a running aggregation other than a sum or count has no Metabase equivalent"
    (are [measure-name re] (re-find re (tu/unsupported (cumulative {:measure (tu/input-measure {:name measure-name})})))
      "order_count" #"count_distinct"
      "avg_sales"   #"average"))
  (testing "a window or grain_to_date is reported, whether written the 1.12 way or the legacy way"
    (are [type-params re] (re-find re (tu/unsupported (cumulative type-params)))
      {:cumulative_type_params {:window {:count 7, :granularity "day"}, :grain_to_date nil, :period_agg "first"}} #"window"
      {:cumulative_type_params {:window nil, :grain_to_date "month", :period_agg "first"}}                        #"grain_to_date"
      {:window {:count 7, :granularity "day"}}                                                                      #"window"
      {:grain_to_date "month"}                                                                                      #"grain_to_date")))

(deftest ^:parallel conversion-test
  (testing "conversion metrics are out of scope and reported as such"
    (is (re-find #"conversion"
                 (tu/unsupported {:measures    input-measures
                                  :metric      {:type "conversion"}
                                  :type-params {:measure                nil
                                                :input_measures         [(tu/input-measure {:name "order_count"})]
                                                :conversion_type_params {:entity             "customer"
                                                                         :calculation        "conversion_rate"
                                                                         :base_measure       (tu/input-measure {:name "order_count"})
                                                                         :conversion_measure (tu/input-measure {:name "order_count"})
                                                                         :window             {:count 30, :granularity "day"}
                                                                         :constant_properties nil}}
                                  :edit        with-input-metrics})))))

(deftest ^:parallel write-order-test
  (testing "a metric is written after the metrics it refers to, whatever the alphabetical order"
    (let [{:keys [paths]} (convert (composed "ratio" ["sales" "target"]
                                             {:numerator (tu/metric-input "sales"), :denominator (tu/metric-input "target")}))]
      (is (every? some? (map (partial position paths) ["m" "sales" "target"])) (pr-str paths))
      (is (written-before? paths "sales" "m"))
      (is (written-before? paths "target" "m")))))

(def ^:private flexanalytics-manifest-filename
  (.getPath ^java.net.URL (io/resource "dbt_import/flexanalytics_manifest.json")))

(deftest ^:parallel flexanalytics-test
  (let [resolved (resolve/resolve-manifest tu/default-config (parse/parse-manifest-file flexanalytics-manifest-filename))
        {:keys [aggregation unsupported paths]} (convert-all resolved)]
    (testing "every metric converts except the ones with no Metabase equivalent"
      (is (= #{"customer_reorder_rate" "sales_mtd" "sales_trailing_7d" "sales_vs_prior_week"}
             (set (keys unsupported)))))
    (testing "sales_to_target_ratio_2 is a proper ratio of sales to target, next to the project's own average of a per-row ratio"
      (is (= [:/ {} [:metric {} "sales"] [:metric {} "target"]] (aggregation "sales_to_target_ratio_2")))
      (is (= [:avg {} [:/ {} (fld "sales" :type/Float) (fld "target" :type/Float)]] (aggregation "sales_to_target"))))
    (testing "the derived metrics"
      (is (= [:- {} [:metric {} "sales"] [:metric {} "target"]] (aggregation "sales_minus_target")))
      (is (= [:* {} [:/ {} [:metric {} "sales"] [:metric {} "target"]] 100] (aggregation "sales_pct_of_target"))))
    (testing "the ratio with a filtered numerator inlines it"
      (is (= [:/ {} [:distinct-where {} (fld "order_key" :type/Text) cancelled] [:metric {} "order_count"]]
             (aggregation "cancelled_order_share"))))
    (testing "the hand-written cumulative metric over sales is a running sum"
      (is (= cum-sum-sales (aggregation "cumulative_sales"))))
    (testing "input metrics are written before the metrics that refer to them"
      (is (every? some? (map (partial position paths)
                             ["sales" "target" "order_count" "sales_minus_target" "sales_pct_of_target"
                              "sales_to_target_ratio_2" "cancelled_order_share" "cumulative_sales"]))
          (pr-str paths))
      (is (written-before? paths "target" "sales_minus_target"))
      (is (written-before? paths "target" "sales_pct_of_target"))
      (is (written-before? paths "target" "sales_to_target_ratio_2"))
      (is (written-before? paths "order_count" "cancelled_order_share")))))
