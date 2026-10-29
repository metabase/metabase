(ns dev.dbt-import.advanced-metrics-test
  "The metric types that compose other metrics: a ratio or derived metric becomes the same arithmetic over
  `:metric` references to the cards its input metrics convert to, an input with a filter of its own is inlined as the
  filtered form of its aggregation (`:count-where`, `:distinct-where`, or the aggregation over a `:case` that is null
  where the filter fails) so the metric stays one card, a cumulative metric becomes `:cum-sum` or `:cum-count`, with
  a note on when it agrees with dbt, and what has no Metabase equivalent (offsets, cumulative windows, conversion) is
  reported.

  The parse-time reasons for what is reported (offsets, windows, conversion) are in
  [[dev.dbt-import.parse-test/advanced-metric-types-test]].

  Each built manifest puts simple metrics (see [[input-metrics]]) next to the metric under test, `m`, in the shape
  dbt 1.12 writes: a ratio or derived
  metric's `depends_on.nodes` lists its input *metrics*, not a semantic model, and `input_measures` is filled in
  transitively. [[convert-all]] names the `:metric` leaves of what comes out after the metric each refers to, so an
  expectation reads `[:metric {} \"sales\"]` rather than an entity_id."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [clojure.walk :as walk]
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.test-util :as tu :refer [fld]]
   [mb.hawk.assert-exprs]))

(def ^:private input-measures
  "The measures the input metrics aggregate, replacing the fixture's default `m`."
  [(assoc (tu/base-measure) :name "sales" :expr "sales")
   (assoc (tu/base-measure) :name "target" :expr "target")
   (assoc (tu/base-measure) :name "order_count" :agg "count_distinct" :expr "order_key")
   (assoc (tu/base-measure) :name "row_count" :expr "1")
   (assoc (tu/base-measure) :name "avg_sales" :agg "average" :expr "sales")
   (assoc (tu/base-measure) :name "min_sales" :agg "min" :expr "sales")
   (assoc (tu/base-measure) :name "max_sales" :agg "max" :expr "sales")
   (assoc (tu/base-measure) :name "median_sales" :agg "median" :expr "sales")
   (assoc (tu/base-measure) :name "p90_sales" :agg "percentile" :expr "sales" :agg_params {:percentile 0.9})
   (assoc (tu/base-measure) :name "col_count" :agg "count" :expr "order_key")
   (assoc (tu/base-measure) :name "returned" :agg "sum_boolean" :expr "is_returned")])

(def ^:private input-metrics
  "The simple metrics next to the metric under test: name, the measure it aggregates and its own filter. `sales`,
  `target`, `order_count` and `row_count` are what dbt generates from `create_metric: true`; `avg_sales`, `min_sales`,
  `max_sales`, `median_sales` and `p90_sales` are the aggregations whose filtered form is over a `case`; `col_count`
  and `returned` are a `count` of a column and a `sum_boolean`, whose filtered forms carry a condition of their own;
  `shipped_sales` is `sales` with a filter of its own."
  [["sales"         "sales"        nil]
   ["target"        "target"       nil]
   ["order_count"   "order_count"  nil]
   ["row_count"     "row_count"    nil]
   ["avg_sales"     "avg_sales"    nil]
   ["min_sales"     "min_sales"    nil]
   ["max_sales"     "max_sales"    nil]
   ["median_sales"  "median_sales" nil]
   ["p90_sales"     "p90_sales"    nil]
   ["col_count"     "col_count"    nil]
   ["returned"      "returned"     nil]
   ["shipped_sales" "sales"        tu/shipped-filter]])

(defn- simple-metric
  "A simple metric `metric-name` over `measure-name` with `metric-filter`; `base` is the fixture's metric `m` to take
  the boilerplate from."
  [base [metric-name measure-name metric-filter]]
  (-> base
      (assoc :name metric-name, :unique_id (str "metric.p." metric-name), :label metric-name, :type "simple"
             :filter metric-filter, :depends_on {:macros [], :nodes [tu/sm-id]})
      (tu/over-measure measure-name)))

(defn- with-input-metrics
  "A `:edit` fn for [[tu/build-manifest]] that adds [[input-metrics]]."
  [manifest]
  (let [base (get-in manifest [:metrics "metric.p.m"])]
    (update manifest :metrics into
            (map (fn [[metric-name :as input-metric]]
                   [(str "metric.p." metric-name) (simple-metric base input-metric)]))
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

(def ^:private period-agg-last
  "The `cumulative_type_params` of a cumulative metric with no window and `period_agg: last`, the one `period_agg` the
  converter accepts (dbt's default, `first`, is reported; see
  [[dev.dbt-import.parse-test/advanced-metric-types-test]])."
  {:window nil, :grain_to_date nil, :period_agg "last"})

(defn- cumulative
  "[[tu/build-manifest]] tweaks for a cumulative metric `m` over the measure `sales` with `period_agg: last` (unless
  `type-params` says otherwise), alongside the simple metrics."
  [type-params]
  {:measures    input-measures
   :columns     {"target" "float"}
   :metric      {:type "cumulative"}
   :type-params (merge {:measure                (tu/input-measure {:name "sales"})
                        :input_measures         [(tu/input-measure {:name "sales"})]
                        :cumulative_type_params period-agg-last}
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
  (let [names   (into {} (map (juxt :entity-id (comp :name :ir))) (:metrics resolved))
        by-name (fn [f] (into {} (map (juxt (comp :name :ir) f)) (:metrics resolved)))]
    {:aggregation (by-name #(name-metric-refs names (:aggregation (tu/query-clauses %))))
     :filters     (by-name #(:filters (tu/query-clauses %)))
     :unsupported (tu/reasons-by-name (:unsupported resolved))
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

(def ^:private sum-target [:sum {} (fld "target" :type/Float)])
(def ^:private cum-sum-sales [:cum-sum {} (fld "sales" :type/Float)])

(def ^:private cancelled-filter
  (tu/where-filters "{{ Dimension('order__order_status_dim') }} = 'Cancelled'"))

(def ^:private cancelled [:= {} tu/order-status "Cancelled"])
(def ^:private shipped [:= {} (fld "status" :type/Text) "Shipped"])

(deftest ^:parallel ratio-test
  (testing "a ratio divides references to its input metrics' cards; the inputs convert as before"
    (let [{:keys [aggregation unsupported]}
          (convert (composed "ratio" ["sales" "target"]
                             {:numerator (tu/metric-input "sales"), :denominator (tu/metric-input "target")}))]
      (is (= {} unsupported))
      (is (= [:/ {} [:metric {} "sales"] [:metric {} "target"]] (aggregation "m")))
      (is (= tu/sum-sales (aggregation "sales")))
      (is (= sum-target (aggregation "target")))))
  (testing "the same metric on both sides"
    (is (= [:/ {} [:metric {} "sales"] [:metric {} "sales"]]
           (-> (convert (composed "ratio" ["sales"]
                                  {:numerator (tu/metric-input "sales"), :denominator (tu/metric-input "sales")}))
               :aggregation
               (get "m")))))
  (testing "an input that is not in the manifest is reported"
    (is (re-find #"^ratio: metric \"nope\" not found"
                 (-> (convert (composed "ratio" ["sales" "nope"]
                                        {:numerator (tu/metric-input "sales"), :denominator (tu/metric-input "nope")}))
                     :unsupported
                     (get "m")))))
  (testing "an input the parse stage reported is reported with that reason, not as missing"
    (let [windowed (tu/add-metric "sales_7d" #(-> (simple-metric % ["sales_7d" "sales" nil])
                                                 (assoc :type "cumulative")
                                                 (assoc-in [:type_params :cumulative_type_params]
                                                           {:window        {:count 7, :granularity "day"}
                                                            :grain_to_date nil
                                                            :period_agg    "last"})))
          {:keys [unsupported]} (convert (-> (composed "ratio" ["sales_7d" "sales"]
                                                       {:numerator   (tu/metric-input "sales_7d")
                                                        :denominator (tu/metric-input "sales")})
                                             (update :edit (fn [edit] (comp windowed edit)))))]
      (is (re-find #"^a cumulative metric with a window of 7 day" (get unsupported "sales_7d")))
      (is (re-find #"^ratio: metric \"sales_7d\" was not converted: a cumulative metric with a window of 7 day"
                   (get unsupported "m"))))))

(defn- filtered-ratio
  "Tweaks for a ratio `m` of the metric `numerator-name` filtered by [[cancelled-filter]] (with `input-alias`, when
  given) to the metric `denominator-name`."
  [numerator-name denominator-name & {:keys [input-alias]}]
  (composed "ratio" (distinct [numerator-name denominator-name])
            {:numerator   (tu/metric-input numerator-name :alias input-alias :filter cancelled-filter)
             :denominator (tu/metric-input denominator-name)}))

(deftest ^:parallel ratio-input-filter-test
  (testing (str "an input with its own filter is inlined as the filtered form of its aggregation, so the metric stays"
                " one card")
    (let [{:keys [aggregation filters unsupported]}
          (convert (filtered-ratio "order_count" "order_count" :input-alias "cancelled_orders"))]
      (is (= {} unsupported))
      (is (= [:/ {} [:distinct-where {} (fld "order_key" :type/Text) cancelled] [:metric {} "order_count"]]
             (aggregation "m")))
      (is (= [:distinct {} (fld "order_key" :type/Text)] (aggregation "order_count")) "the input itself is untouched")
      (is (= [] (filters "order_count"))))
    (are [numerator expected] (= [:/ {} expected [:metric {} "target"]]
                                 (-> (convert (filtered-ratio numerator "target")) :aggregation (get "m")))
      "row_count" [:count-where {} cancelled]
      ;; a count of a column skips its nulls, and a sum_boolean counts where the column is true: both conditions join
      ;; the filter's
      "col_count" [:count-where {} [:and {} cancelled [:not-null {} (fld "order_key" :type/Text)]]]
      "returned"  [:count-where {} [:and {} cancelled [:= {} (fld "is_returned" :type/Boolean) true]]]))
  (testing (str "every other aggregation is over a case that is the expression where the condition holds and null"
                " elsewhere, which it skips: as the query processor splices a filtered metric in, and null, like dbt,"
                " for a group no row of which passes, where sum-where would give 0")
    (let [filtered-sales [:case {} [[cancelled (fld "sales" :type/Float)]]]]
      (are [numerator expected] (= [:/ {} expected [:metric {} "target"]]
                                   (-> (convert (filtered-ratio numerator "target")) :aggregation (get "m")))
        "sales"        [:sum {} filtered-sales]
        "avg_sales"    [:avg {} filtered-sales]
        "min_sales"    [:min {} filtered-sales]
        "max_sales"    [:max {} filtered-sales]
        "median_sales" [:median {} filtered-sales]
        "p90_sales"    [:percentile {} filtered-sales 0.9])))
  (testing "the input's own filter and the one on the reference both apply"
    (is (= [:/ {} [:sum {} [:case {} [[[:and {} shipped cancelled] (fld "sales" :type/Float)]]]] [:metric {} "target"]]
           (-> (convert (filtered-ratio "shipped_sales" "target")) :aggregation (get "m")))))
  (testing "an alias alone changes nothing: the ratio refers to the input itself"
    (is (= [:/ {} [:metric {} "sales"] [:metric {} "target"]]
           (-> (convert (composed "ratio" ["sales" "target"]
                                  {:numerator   (tu/metric-input "sales" :alias "num")
                                   :denominator (tu/metric-input "target" :alias "den")}))
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
                                 [(tu/metric-input "sales" :alias "sales_amt")
                                  (tu/metric-input "target" :alias "target_amt")]))
               :aggregation
               (get "m")))))
  (testing "a derived metric over a derived metric refers to its card"
    (let [d-metric (tu/add-metric "d" #(-> %
                                         (assoc-in [:type_params :expr] "sales - target")
                                         (assoc-in [:type_params :metrics]
                                                   [(tu/metric-input "sales") (tu/metric-input "target")])
                                         (assoc-in [:type_params :input_measures]
                                                   [(tu/input-measure {:name "sales"})
                                                    (tu/input-measure {:name "target"})])
                                         (assoc-in [:depends_on :nodes] ["metric.p.sales" "metric.p.target"])))
          tweaks   (-> (composed "derived" ["d"] {:expr "d * 2", :metrics [(tu/metric-input "d")]})
                       (assoc-in [:type-params :input_measures]
                                 [(tu/input-measure {:name "sales"}) (tu/input-measure {:name "target"})])
                       (update :edit (fn [edit] (comp d-metric edit))))
          {:keys [aggregation unsupported]} (convert tweaks)]
      (is (= {} unsupported))
      (is (= [:- {} [:metric {} "sales"] [:metric {} "target"]] (aggregation "d")))
      (is (= [:* {} [:metric {} "d"] 2] (aggregation "m")))))
  (testing "dividing by NULLIF(x, 0) is plain division, as in a measure"
    (is (= [:/ {} [:metric {} "sales"] [:metric {} "target"]]
           (-> (convert (derived "sales / nullif(target, 0)")) :aggregation (get "m")))))
  (testing "a function over an input is the same function over its metric reference"
    (is (= [:- {} [:coalesce {} [:metric {} "sales"] 0] [:metric {} "target"]]
           (-> (convert (derived "coalesce(sales, 0) - target")) :aggregation (get "m")))))
  (testing "what the expr cannot say in MBQL is reported"
    (are [expr re] (re-find re (-> (convert (derived expr)) :unsupported (get "m")))
      "greatest(sales, 0) - target" #"^expr \"greatest\(sales, 0\) - target\": the function greatest is not supported$"
      "sales - nope"
      #"^expr \"sales - nope\": \"nope\" is not one of the metric's inputs \(\"sales\", \"target\"\)$"
      "sales - target = 0"          #"^expr \"sales - target = 0\": sales - target = 0 \(EQ\) is not supported$"))
  (testing "an input with its own filter is inlined, as in a ratio"
    (is (= [:- {} [:distinct-where {} (fld "order_key" :type/Text) cancelled] [:metric {} "order_count"]]
           (-> (convert (derived "cancelled - order_count"
                                 [(tu/metric-input "order_count" :alias "cancelled" :filter cancelled-filter)
                                  (tu/metric-input "order_count")]))
               :aggregation
               (get "m"))))))

(deftest ^:parallel cumulative-test
  (testing "a cumulative metric with no window and period_agg last is a running sum"
    (is (= cum-sum-sales (tu/aggregation (cumulative {})))))
  (testing "over a row count it is a running count"
    (is (= [:cum-count {}] (tu/aggregation (cumulative {:measure (tu/input-measure {:name "row_count"})})))))
  (testing "over a count of a column, which skips nulls, it is a running sum of 1 where the column is not null"
    (let [order-key (fld "order_key" :type/Text)]
      (is (= [:cum-sum {} [:case {} [[[:not-null {} order-key] 1]] 0]]
             (tu/aggregation (assoc (cumulative {:measure (tu/input-measure {:name "order_key_count"})})
                                    :measures (conj input-measures
                                                    (assoc (tu/base-measure)
                                                           :name "order_key_count"
                                                           :agg  "count"
                                                           :expr "order_key"))))))))
  (testing "a filter on the metric applies as on a simple one"
    (is (= [[:= {} (fld "status" :type/Text) "Shipped"]]
           (tu/filters (merge (cumulative {})
                              {:metric {:type   "cumulative"
                                        :filter tu/shipped-filter}})))))
  (testing "a running aggregation other than a sum or count has no Metabase equivalent"
    (are [measure-name re] (re-find re (tu/unsupported (cumulative {:measure (tu/input-measure {:name measure-name})})))
      "order_count" #"a running count_distinct has no Metabase equivalent"
      "avg_sales"   #"a running average has no Metabase equivalent"
      "median_sales" #"a running median has no Metabase equivalent"
      ;; a sum_boolean is a count of the rows where the condition holds, but its running form is not a cum-count
      "returned"    #"a running sum_boolean has no Metabase equivalent")))

(deftest ^:parallel cumulative-note-test
  (testing (str "a cumulative metric carries a note: a running total over whatever it is broken out by, which agrees"
                " with dbt under its agg_time_dimension only")
    (is (=? [#"^a cumulative metric is a running total over whatever it is broken out by.*"]
            (:notes (tu/convert (cumulative {})))))
    (is (=? [#"^a cumulative metric is a running total.*"]
            (:notes (tu/convert (cumulative {:measure (tu/input-measure {:name "row_count"})})))))
    (is (= [] (:notes (tu/convert (composed "ratio" ["sales" "target"]
                                            {:numerator   (tu/metric-input "sales")
                                             :denominator (tu/metric-input "target")})))))))

(deftest ^:parallel composed-fill-nulls-with-test
  (testing "fill_nulls_with on a ratio wraps the division in coalesce, as it does the aggregation of a simple metric"
    (is (= [:coalesce {} [:/ {} [:metric {} "sales"] [:metric {} "target"]] 0]
           (-> (convert (assoc-in (composed "ratio" ["sales" "target"]
                                            {:numerator   (tu/metric-input "sales")
                                             :denominator (tu/metric-input "target")})
                                  [:type-params :fill_nulls_with] 0))
               :aggregation
               (get "m")))))
  (testing "and on a derived metric wraps the whole expr"
    (is (= [:coalesce {} [:- {} [:metric {} "sales"] [:metric {} "target"]] -1]
           (-> (convert (assoc-in (derived "sales - target") [:type-params :fill_nulls_with] -1))
               :aggregation
               (get "m")))))
  (testing "an input's own fill_nulls_with stays on the input's card, not on the metric referring to it"
    (let [fill-sales            #(assoc-in % [:metrics "metric.p.sales" :type_params :fill_nulls_with] 0)
          {:keys [aggregation]} (convert (-> (derived "sales - target")
                                             (update :edit (fn [edit] (comp fill-sales edit)))))]
      (is (= [:coalesce {} tu/sum-sales 0] (aggregation "sales")))
      (is (= [:- {} [:metric {} "sales"] [:metric {} "target"]] (aggregation "m"))))))

(defn- also
  "`tweaks` with the `:edit` fn `f` run after the edit they already have."
  [tweaks f]
  (update tweaks :edit (fn [edit] (comp f edit))))

(def ^:private cyclic-reason
  "metric refers to itself, directly or through the metrics it refers to")

(deftest ^:parallel cyclic-metrics-test
  (testing "a derived metric over itself can never be placed after its input, and is reported"
    (let [{:keys [aggregation unsupported]}
          (convert (composed "derived" ["m"] {:expr "m * 2", :metrics [(tu/metric-input "m")]}))]
      (is (= {"m" cyclic-reason} unsupported))
      (is (= tu/sum-sales (aggregation "sales")) "the other metrics still convert")))
  (testing "two metrics that refer to each other are both reported, and neither is written"
    (let [d-over-m (tu/add-metric "d" #(-> %
                                         (assoc :depends_on {:macros [], :nodes ["metric.p.m"]})
                                         (update :type_params assoc :expr "m + 1" :metrics [(tu/metric-input "m")])))
          {:keys [unsupported paths]}
          (convert (also (composed "derived" ["d"] {:expr "d * 2", :metrics [(tu/metric-input "d")]}) d-over-m))]
      (is (= {"m" cyclic-reason, "d" cyclic-reason} unsupported))
      (is (nil? (position paths "m")))
      (is (nil? (position paths "d")))))
  (testing (str "a metric that refers to a cyclic one is not cyclic itself: it is reported as referring to a metric"
                " that was not converted, like any other dependent")
    (let [d-over-d (tu/add-metric "d" #(-> %
                                         (assoc :depends_on {:macros [], :nodes ["metric.p.d"]})
                                         (update :type_params assoc :expr "d + 1" :metrics [(tu/metric-input "d")])))
          {:keys [unsupported]}
          (convert (also (composed "derived" ["d"] {:expr "d * 2", :metrics [(tu/metric-input "d")]}) d-over-d))]
      (is (= {"d" cyclic-reason
              "m" (str "expr \"d * 2\": metric \"d\" was not converted: " cyclic-reason)}
             unsupported)))))

(def ^:private msrp-total
  "A measure on `dim_product`, which has none in the fixture."
  (assoc (tu/base-measure) :name "msrp_total" :expr "msrp"))

(def ^:private with-product-metric
  "A `:edit` fn for [[tu/build-manifest]] that adds [[msrp-total]] to `dim_product` and a simple metric over it."
  (comp (tu/add-metric "msrp_total" #(assoc (simple-metric % ["msrp_total" "msrp_total" nil])
                                            :depends_on {:macros [], :nodes [tu/product-sm-id]}))
        (tu/add-measure tu/product-sm-id msrp-total)))

(deftest ^:parallel inputs-on-different-models-test
  (testing "a ratio or derived metric has one table, so its inputs have to be on one semantic model"
    (let [{:keys [aggregation unsupported]}
          (convert (also (composed "ratio" ["sales" "msrp_total"]
                                   {:numerator (tu/metric-input "sales"), :denominator (tu/metric-input "msrp_total")})
                         with-product-metric))]
      (is (= {"m" (str "inputs are on different semantic models (sales on fact_sales, msrp_total on dim_product); a"
                       " metric has one table")}
             unsupported))
      (is (= [:sum {} (fld "public" "dim_product" "msrp" :type/Integer)] (aggregation "msrp_total"))
          "the input itself converts, on its own table"))))

(def ^:private greatest-sales
  "A measure the resolve stage reports: `greatest` has no Metabase equivalent."
  (assoc (tu/base-measure) :name "greatest_sales" :expr "greatest(sales, 0)"))

(def ^:private with-greatest-sales-metric
  "A `:edit` fn for [[tu/build-manifest]] that adds [[greatest-sales]] and a simple metric over it."
  (comp (tu/add-metric "greatest_sales" #(simple-metric % ["greatest_sales" "greatest_sales" nil]))
        (tu/add-measure greatest-sales)))

(deftest ^:parallel failed-input-test
  (testing "an input the resolve stage reported is reported with that reason, not as missing"
    (let [greatest-reason "expr \"greatest(sales, 0)\": the function greatest is not supported"
          d-over-m        (tu/add-metric "d" #(-> %
                                                (assoc :type "derived", :depends_on {:macros [], :nodes ["metric.p.m"]})
                                                (update :type_params assoc
                                                        :expr "m * 2" :metrics [(tu/metric-input "m")])))
          {:keys [unsupported]}
          (convert (-> (composed "ratio" ["greatest_sales" "sales"]
                                 {:numerator   (tu/metric-input "greatest_sales")
                                  :denominator (tu/metric-input "sales")})
                       (also with-greatest-sales-metric)
                       (also d-over-m)))
          m-reason        (str "ratio: metric \"greatest_sales\" was not converted: " greatest-reason)]
      (is (= greatest-reason (get unsupported "greatest_sales")))
      (is (= m-reason (get unsupported "m")))
      (testing "and a metric over that one chains the reasons"
        (is (= (str "expr \"m * 2\": metric \"m\" was not converted: " m-reason) (get unsupported "d")))))))

(deftest ^:parallel constant-derived-expr-test
  (testing "a derived expr that refers to no input is a constant, which is no metric"
    (are [expr reason] (re-find reason (-> (convert (derived expr)) :unsupported (get "m")))
      "1"   #"expr \"1\" is the constant 1, not arithmetic over the inputs"
      "-1"  #"expr \"-1\" is the constant -1, not arithmetic over the inputs"
      "'x'" #"expr \"'x'\" is the constant \"x\", not arithmetic over the inputs")))

(deftest ^:parallel composed-input-filter-test
  (testing "only a simple metric can be inlined with a filter: a ratio or derived input with one is reported"
    (let [ratio-d (tu/add-metric "d" #(-> %
                                        (assoc :type "ratio"
                                               :depends_on {:macros [], :nodes ["metric.p.sales" "metric.p.target"]})
                                        (update :type_params assoc
                                                :numerator (tu/metric-input "sales")
                                                :denominator (tu/metric-input "target"))))
          {:keys [aggregation unsupported]}
          (convert (also (derived "d_cancelled - d" [(tu/metric-input "d" :alias "d_cancelled" :filter cancelled-filter)
                                                     (tu/metric-input "d")])
                         ratio-d))]
      (is (= [:/ {} [:metric {} "sales"] [:metric {} "target"]] (aggregation "d")))
      (is (= (str "expr \"d_cancelled - d\": metric \"d\" is a ratio metric; only a simple metric can take a filter"
                  " where it is referred to")
             (get unsupported "m")))))
  (testing "a filter on the ratio or derived metric itself applies as on a simple one"
    (let [{:keys [aggregation filters]}
          (convert (assoc-in (composed "ratio" ["sales" "target"]
                                       {:numerator (tu/metric-input "sales"), :denominator (tu/metric-input "target")})
                             [:metric :filter] cancelled-filter))]
      (is (= [:/ {} [:metric {} "sales"] [:metric {} "target"]] (aggregation "m")))
      (is (= [cancelled] (filters "m"))))))

(deftest ^:parallel write-order-test
  (testing "a metric is written after the metrics it refers to, whatever the alphabetical order"
    (let [{:keys [paths]} (convert (composed "ratio" ["sales" "target"]
                                             {:numerator   (tu/metric-input "sales")
                                             :denominator (tu/metric-input "target")}))]
      (is (every? some? (map (partial position paths) ["m" "sales" "target"])) (pr-str paths))
      (is (written-before? paths "sales" "m"))
      (is (written-before? paths "target" "m")))))

(deftest ^:parallel flexanalytics-test
  (let [{:keys [aggregation paths]} (convert-all (tu/flexanalytics-resolved))]
    (testing (str "sales_to_target_ratio_2 is a proper ratio of sales to target, next to the project's own average of"
                  " a per-row ratio")
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
