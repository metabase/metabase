(ns metabase.driver.druid.query-processor-test
  "Some tests to make sure the Druid Query Processor is generating sane Druid queries when compiling MBQL."
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [java-time :as t]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [models :refer [Field Metric Table]]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver.druid.query-processor :as druid.qp]
            [metabase.timeseries-query-processor-test.util :as tqpt]
            [metabase.util.date-2 :as u.date]))

(defn- str->absolute-dt [s]
  [:absolute-datetime (u.date/parse s "UTC") :default])

(deftest filter-intervals-test
  (let [dt-field                 [:datetime-field [:field-id 1] :default]
        filter-clause->intervals (comp (var-get #'druid.qp/compile-intervals) (var-get #'druid.qp/filter-clause->intervals))]
    (testing :=
      (is (= ["2015-10-04T00:00:00Z/2015-10-04T00:00:00.001Z"]
             (filter-clause->intervals [:= dt-field (str->absolute-dt "2015-10-04T00:00:00Z")]))
          ":= filters should get converted to intervals like `v/v+1`")
      (is (= nil
             (filter-clause->intervals [:= [:field-id 1] "toucan"]))
          "Non-temporal filter clauses should return `nil` intervals"))
    (testing :<
      (is (= ["-5000/2015-10-11T00:00:00Z"]
             (filter-clause->intervals [:<  dt-field (str->absolute-dt "2015-10-11T00:00:00Z")]))
          ":<, :<=, :>, and :>= should return an interval with -5000 or 5000 as min or max"))
    (testing :between
      (is (= ["2015-10-04T00:00:00Z/2015-10-20T00:00:00.001Z"]
             (filter-clause->intervals
              [:between dt-field (str->absolute-dt "2015-10-04T00:00:00Z") (str->absolute-dt "2015-10-20T00:00:00Z")]))))
    (testing :and
      (is (= ["2015-10-04T00:00:00Z/2015-10-11T00:00:00Z"]
             (filter-clause->intervals
              [:and
               [:>= dt-field (str->absolute-dt "2015-10-04T00:00:00Z")]
               [:<  dt-field (str->absolute-dt "2015-10-11T00:00:00Z")]]))
          "The Druid QP should be able to combine compound `:and` filter clauses into a single datetime interval.")
      (is (= ["2015-10-06T00:00:00Z/2015-10-20T00:00:00.001Z"]
             (filter-clause->intervals
              [:and
               [:between dt-field (str->absolute-dt "2015-10-04T00:00:00Z") (str->absolute-dt "2015-10-20T00:00:00Z")]
               [:between dt-field (str->absolute-dt "2015-10-06T00:00:00Z") (str->absolute-dt "2015-10-21T00:00:00Z")]]))
          "When two filters have overlapping intervals it should generate a single logically equivalent interval")
      (is (= nil
             (filter-clause->intervals
              [:and [:= [:field-id 1] "toucan"] [:= [:field-id 2] "threecan"]]))
          ":and clause should ignore non-temporal filters")
      (is (= ["2015-10-04T00:00:00Z/2015-10-04T00:00:00.001Z"]
             (filter-clause->intervals
              [:and
               [:= [:field-id 1] "toucan"] [:= dt-field (str->absolute-dt "2015-10-04T00:00:00Z")]]))
          ":and clause with no temporal filters should be compiled to `nil` interval")
      (is (= ["2015-10-04T00:00:00Z/2015-10-04T00:00:00.001Z"]
             (filter-clause->intervals
              [:and
               [:= dt-field (str->absolute-dt "2015-10-04T00:00:00Z")]
               [:or
                [:>= dt-field (str->absolute-dt "2015-10-03T00:00:00Z")]
                [:<  dt-field (str->absolute-dt "2015-10-11T00:00:00Z")]]]))
          ":and clause should ignore nested `:or` filters, since they can't be combined into a single filter"))
    (testing :or
      (is (= ["2015-10-04T00:00:00Z/5000" "-5000/2015-10-11T00:00:00Z"]
             (filter-clause->intervals
              [:or
               [:>= dt-field (str->absolute-dt "2015-10-04T00:00:00Z")]
               [:<  dt-field (str->absolute-dt "2015-10-11T00:00:00Z")]]))
          ":or filters should be combined into multiple intervals")
      (is (= ["2015-10-04T00:00:00Z/5000"]
             (filter-clause->intervals
              [:or
               [:>= dt-field (str->absolute-dt "2015-10-04T00:00:00Z")]
               [:= [:field-id 1] "toucan"]]))
          ":or clauses should ignore non-temporal filters")
      (is (= nil
             (filter-clause->intervals
              [:or
               [:= [:field-id 1] "toucan"]
               [:= [:field-id 2] "threecan"]]))
          ":or filters with no temporal filters should return nil"))))

(defn- do-query->native [query]
  (driver/with-driver :druid
    (tqpt/with-flattened-dbdef
      (with-redefs [druid.qp/random-query-id (constantly "<Query ID>")]
        (qp/query->native
          query)))))

(defmacro ^:private query->native [query]
  `(do-query->native
    (mt/mbql-query ~'checkins
      ~query)))

(deftest compile-topN-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (is (= {:projections [:venue_price :__count_0 :expression]
              :query       {:queryType        :topN
                            :threshold        1000
                            :granularity      :all
                            :dataSource       "checkins"
                            :dimension        "venue_price"
                            :context          {:timeout 60000, :queryId "<Query ID>"}
                            :postAggregations [{:type   :arithmetic
                                                :name   "expression"
                                                :fn     :*
                                                :fields [{:type :fieldAccess, :fieldName "__count_0"}
                                                         {:type :constant, :name "10", :value 10}]}]
                            :intervals        ["1900-01-01/2100-01-01"]
                            :metric           {:type :alphaNumeric}
                            :aggregations
                            [{:type       :filtered
                              :filter     {:type  :not
                                           :field {:type :selector, :dimension "id", :value nil}}
                              :aggregator {:type :count, :name "__count_0"}}]}
              :query-type  ::druid.qp/topN
              :mbql?       true}
             (query->native
              {:aggregation [[:* [:count $id] 10]]
               :breakout    [$venue_price]}))))))

(deftest compile-topN-with-order-by-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (is (= {:projections [:venue_category_name :__count_0]
              :query       {:queryType    :topN
                            :threshold    1000
                            :granularity  :all
                            :dataSource   "checkins"
                            :dimension    "venue_category_name"
                            :context      {:timeout 60000, :queryId "<Query ID>"}
                            :intervals    ["1900-01-01/2100-01-01"]
                            :metric       "__count_0"
                            :aggregations [{:type       :cardinality
                                            :name       "__count_0"
                                            :fieldNames ["venue_name"]
                                            :byRow      true
                                            :round      true}]}
              :query-type  ::druid.qp/topN
              :mbql?       true}
             (query->native
              {:aggregation [[:aggregation-options [:distinct $checkins.venue_name] {:name "__count_0"}]]
               :breakout    [$venue_category_name]
               :order-by    [[:desc [:aggregation 0]] [:asc $checkins.venue_category_name]]}))))))

(deftest compile-groupBy-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (is (= {:projections [:venue_category_name :user_name :__count_0]
              :query       {:queryType    :groupBy
                            :granularity  :all
                            :dataSource   "checkins"
                            :dimensions   ["venue_category_name", "user_name"]
                            :context      {:timeout 60000, :queryId "<Query ID>"}
                            :intervals    ["1900-01-01/2100-01-01"]
                            :aggregations [{:type       :cardinality
                                            :name       "__count_0"
                                            :fieldNames ["venue_name"]
                                            :byRow      true
                                            :round      true}]
                            :limitSpec    {:type    :default
                                           :columns [{:dimension "__count_0", :direction :descending}
                                                     {:dimension "venue_category_name", :direction :ascending}
                                                     {:dimension "user_name", :direction :ascending}]}}
              :query-type  ::druid.qp/groupBy
              :mbql?       true}
             (query->native
              {:aggregation [[:aggregation-options [:distinct $checkins.venue_name] {:name "__count_0"}]]
               :breakout    [$venue_category_name $user_name]
               :order-by    [[:desc [:aggregation 0]] [:asc $checkins.venue_category_name]]}))))))

(deftest compile-groupBy-with-limit-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (is (= {:projections [:venue_category_name :user_name :__count_0]
              :query       {:queryType    :groupBy
                            :granularity  :all
                            :dataSource   "checkins"
                            :dimensions   ["venue_category_name", "user_name"]
                            :context      {:timeout 60000, :queryId "<Query ID>"}
                            :intervals    ["1900-01-01/2100-01-01"]
                            :aggregations [{:type       :cardinality
                                            :name       "__count_0"
                                            :fieldNames ["venue_name"]
                                            :byRow      true
                                            :round      true}]
                            :limitSpec    {:type    :default
                                           :columns [{:dimension "__count_0", :direction :descending}
                                                     {:dimension "venue_category_name", :direction :ascending}
                                                     {:dimension "user_name", :direction :ascending}]
                                           :limit   5}}
              :query-type  ::druid.qp/groupBy
              :mbql?       true}
             (query->native
              {:aggregation [[:aggregation-options [:distinct $checkins.venue_name] {:name "__count_0"}]]
               :breakout    [$venue_category_name $user_name]
               :order-by    [[:desc [:aggregation 0]] [:asc $checkins.venue_category_name]]
               :limit       5}))))))

(deftest finalizing-field-access-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (testing "`distinct` when used in post aggregations should have type `:finalizingFieldAccess`"
        (is (= {:projections [:__distinct_0 :expression]
                :query       {:queryType        :timeseries
                              :granularity      :all
                              :dataSource       "checkins"
                              :context          {:timeout 60000, :queryId "<Query ID>"}
                              :intervals        ["1900-01-01/2100-01-01"]
                              :aggregations     [{:type       :cardinality
                                                  :name       "__distinct_0"
                                                  :fieldNames ["venue_name"]
                                                  :byRow      true
                                                  :round      true}]
                              :postAggregations [{:type :arithmetic,
                                                  :name "expression",
                                                  :fn   :+,
                                                  :fields
                                                  [{:type :constant, :name "1", :value 1}
                                                   {:type :finalizingFieldAccess, :fieldName "__distinct_0"}]}]}
                :query-type  ::druid.qp/total
                :mbql?       true}
               (query->native
                {:aggregation [[:+ 1 [:aggregation-options [:distinct $checkins.venue_name] {:name "__distinct_0"}]]]})))))))

(defn- table-rows-sample []
  (->> (metadata-queries/table-rows-sample (Table (mt/id :checkins))
         [(Field (mt/id :checkins :id))
          (Field (mt/id :checkins :venue_name))
          (Field (mt/id :checkins :timestamp))])
       (sort-by first)
       (take 5)))

(deftest table-rows-sample-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (testing "Druid driver doesn't need to convert results to the expected timezone for us. QP middleware can handle that."
        (let [expected [["1" "The Misfit Restaurant + Bar" (t/instant "2014-04-07T07:00:00Z")]
                        ["10" "Dal Rae Restaurant" (t/instant "2015-08-22T07:00:00Z")]
                        ["100" "PizzaHacker" (t/instant "2014-07-26T07:00:00Z")]
                        ["1000" "Tito's Tacos" (t/instant "2014-06-03T07:00:00Z")]
                        ["101" "Golden Road Brewing" (t/instant "2015-09-04T07:00:00Z")]]]
          (testing "UTC timezone"
            (is (= expected
                   (table-rows-sample))))
          (mt/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
            (is (= expected
                   (table-rows-sample))))
          (mt/with-system-timezone-id "America/Chicago"
            (is (= expected
                   (table-rows-sample)))))))))

(def ^:private native-query-1
  (json/generate-string
   {:queryType   :scan
    :dataSource  :checkins
    :intervals   ["1900-01-01/2100-01-01"]
    :granularity :all
    :limit       2
    :columns     [:id
                  :user_name
                  :venue_price
                  :venue_name
                  :count]}))

(defn- process-native-query [query]
  (driver/with-driver :druid
    (tqpt/with-flattened-dbdef
      (-> (qp/process-query {:native   {:query query}
                             :type     :native
                             :database (mt/id)})
          (m/dissoc-in [:data :results_metadata])))))

(def ^:private col-defaults
  {:base_type :type/Text})

(deftest native-query-test
  (mt/test-driver :druid
    (is (= {:row_count 2
            :status    :completed
            :data      {:rows             [["931" "Simcha Yan" "1" "Kinaree Thai Bistro"       1]
                                           ["285" "Kfir Caj"   "2" "Ruen Pair Thai Restaurant" 1]]
                        :cols             (mapv #(merge col-defaults %)
                                                [{:name         "id"
                                                  :source       :native
                                                  :display_name "id"
                                                  :field_ref    [:field-literal "id" :type/Text]
                                                  :base_type    :type/Text}
                                                 {:name         "user_name"
                                                  :source       :native
                                                  :display_name "user_name"
                                                  :field_ref    [:field-literal "user_name" :type/Text]}
                                                 {:name         "venue_price"
                                                  :source       :native
                                                  :display_name "venue_price"
                                                  :base_type    :type/Text
                                                  :field_ref    [:field-literal "venue_price" :type/Text]}
                                                 {:name         "venue_name"
                                                  :source       :native
                                                  :display_name "venue_name"
                                                  :field_ref    [:field-literal "venue_name" :type/Text]}
                                                 {:name         "count"
                                                  :source       :native
                                                  :display_name "count"
                                                  :base_type    :type/Integer
                                                  :field_ref    [:field-literal "count" :type/Integer]}])
                        :native_form      {:query native-query-1}
                        :results_timezone "UTC"}}
           (-> (process-native-query native-query-1)
               (m/dissoc-in [:data :insights]))))))

(def ^:private native-query-2
  (json/generate-string
   {:intervals    ["1900-01-01/2100-01-01"]
    :granularity  {:type     :period
                   :period   :P1M
                   :timeZone :UTC}
    :queryType    :timeseries
    :dataSource   :checkins
    :aggregations [{:type :count
                    :name :count}]}))

(deftest native-query-test-2
  (testing "make sure we can run a native :timeseries query. This was throwing an Exception -- see #3409"
    (mt/test-driver :druid
      (is (= :completed
             (:status (process-native-query native-query-2)))))))

(defmacro ^:private druid-query {:style/indent 0} [& body]
  `(tqpt/with-flattened-dbdef
     (qp/process-query
      (mt/mbql-query ~'checkins
        ~@body))))

(defmacro ^:private druid-query-returning-rows {:style/indent 0} [& body]
  `(mt/rows (druid-query ~@body)))

(deftest start-of-week-test
  (mt/test-driver :druid
    (testing (str "Count the number of events in the given week. Metabase uses Sunday as the start of the week, Druid by "
                  "default will use Monday. All of the below events should happen in one week. Using Druid's default "
                  "grouping, 3 of the events would have counted for the previous week.")
      (is (= [["2015-10-04" 9]]
             (druid-query-returning-rows
               {:filter      [:between !day.timestamp "2015-10-04" "2015-10-10"]
                :aggregation [[:count $id]]
                :breakout    [!week.timestamp]}))))))

(deftest sum-aggregation-test
  (mt/test-driver :druid
    (testing "sum, *"
      (is (= [["1" 110688.0]
              ["2" 616708.0]
              ["3" 179661.0]
              ["4"  86284.0]]
             (druid-query-returning-rows
               {:aggregation [[:sum [:* $id $venue_price]]]
                :breakout    [$venue_price]}))))))

(deftest min-aggregation-test
  (mt/test-driver :druid
    (testing "min, +"
      (is (= [["1"  4.0]
              ["2"  3.0]
              ["3"  8.0]
              ["4" 12.0]]
             (druid-query-returning-rows
               {:aggregation [[:min [:+ $id $venue_price]]]
                :breakout    [$venue_price]}))))))

(deftest max-aggregation-test
  (mt/test-driver :druid
    (testing "max, /"
      (is (= [["1" 1000.0]
              ["2"  499.5]
              ["3"  332.0]
              ["4"  248.25]]
             (druid-query-returning-rows
               {:aggregation [[:max [:/ $id $venue_price]]]
                :breakout    [$venue_price]}))))))

(deftest avg-aggregation-test
  (mt/test-driver :druid
    (testing "avg, -"
      (is (= [["1" 500.85067873303166]
              ["2" 1002.7772357723577]
              ["3" 1562.2695652173913]
              ["4" 1760.8979591836735]]
             (druid-query-returning-rows
               {:aggregation [[:avg [:* $id $venue_price]]]
                :breakout    [$venue_price]}))))))

(deftest share-aggregation-test
  (mt/test-driver :druid
    (testing "share"
      (is (= [[0.951]]
             (druid-query-returning-rows
               {:aggregation [[:share [:< $venue_price 4]]]}))))))

(deftest count-where-aggregation-test
  (mt/test-driver :druid
    (testing "count-where"
      (is (= [[951]]
             (druid-query-returning-rows
               {:aggregation [[:count-where [:< $venue_price 4]]]}))))))

(deftest sum-where-aggregation-test
  (mt/test-driver :druid
    (testing "sum-where"
      (is (= [[1796.0]]
             (druid-query-returning-rows
               {:aggregation [[:sum-where $venue_price [:< $venue_price 4]]]}))))))

(deftest count-aggregation-test
  (mt/test-driver :druid
    (testing "aggregation w/o field"
      (is (= [["1" 222.0]
              ["2" 616.0]
              ["3" 116.0]
              ["4"  50.0]]
             (druid-query-returning-rows
               {:aggregation [[:+ 1 [:count]]]
                :breakout    [$venue_price]}))))))

(deftest expression-aggregations-test
  (mt/test-driver :druid
    (testing "post-aggregation math w/ 2 args: count + sum"
      (is (= [["1"  442.0]
              ["2" 1845.0]
              ["3"  460.0]
              ["4"  245.0]]
             (druid-query-returning-rows
               {:aggregation [[:+ [:count $id] [:sum $venue_price]]]
                :breakout    [$venue_price]}))))

    (testing "post-aggregation math w/ 3 args: count + sum + count"
      (is (= [["1"  663.0]
              ["2" 2460.0]
              ["3"  575.0]
              ["4"  294.0]]
             (druid-query-returning-rows
               {:aggregation [[:+
                               [:count $id]
                               [:sum $venue_price]
                               [:count $venue_price]]]
                :breakout    [$venue_price]}))))

    (testing "post-aggregation math w/ a constant: count * 10"
      (is (= [["1" 2210.0]
              ["2" 6150.0]
              ["3" 1150.0]
              ["4"  490.0]]
             (druid-query-returning-rows
               {:aggregation [[:* [:count $id] 10]]
                :breakout    [$venue_price]}))))

    (testing "nested post-aggregation math: count + (count * sum)"
      (is (= [["1"  49062.0]
              ["2" 757065.0]
              ["3"  39790.0]
              ["4"  9653.0]]
             (druid-query-returning-rows
               {:aggregation [[:+
                               [:count $id]
                               [:* [:count $id] [:sum $venue_price]]]]
                :breakout    [$venue_price]}))))

    (testing "post-aggregation math w/ avg: count + avg"
      (is (= [["1"  721.8506787330316]
              ["2" 1116.388617886179]
              ["3"  635.7565217391304]
              ["4"  489.2244897959184]]
             (druid-query-returning-rows
               {:aggregation [[:+ [:count $id] [:avg $id]]]
                :breakout    [$venue_price]}))))

    (testing "aggregation with math inside the aggregation :scream_cat:"
      (is (= [["1"  442.0]
              ["2" 1845.0]
              ["3"  460.0]
              ["4"  245.0]]
             (druid-query-returning-rows
               {:aggregation [[:sum [:+ $venue_price 1]]]
                :breakout    [$venue_price]}))))

    (testing "post aggregation math + math inside aggregations: max(venue_price) + min(venue_price - id)"
      (is (= [["1" -998.0]
              ["2" -995.0]
              ["3" -990.0]
              ["4" -985.0]]
             (druid-query-returning-rows
               {:aggregation [[:+
                               [:max $venue_price]
                               [:min [:- $venue_price $id]]]]
                :breakout    [$venue_price]}))))))

(deftest named-top-level-aggregation-test
  (mt/test-driver :druid
    (testing "check that we can name an expression aggregation w/ aggregation at top-level"
      (is (= [["1"  442.0]
              ["2" 1845.0]
              ["3"  460.0]
              ["4"  245.0]]
             (mt/rows
               (druid-query
                 {:aggregation [[:aggregation-options [:sum [:+ $venue_price 1]] {:name "New Price"}]]
                  :breakout    [$venue_price]})))))))

(deftest named-expression-aggregations-test
  (mt/test-driver :druid
    (testing "check that we can name an expression aggregation w/ expression at top-level"
      (is (= {:rows    [["1"  180.0]
                        ["2" 1189.0]
                        ["3"  304.0]
                        ["4"  155.0]]
              :columns ["venue_price" "Sum-41"]}
             (mt/rows+column-names
               (druid-query
                 {:aggregation [[:aggregation-options [:- [:sum $venue_price] 41] {:name "Sum-41"}]]
                  :breakout    [$venue_price]})))))))

(deftest distinct-count-of-two-dimensions-test
  (mt/test-driver :druid
    (is (= {:rows    [[98]]
            :columns ["count"]}
           (mt/rows+column-names
             (druid-query
               {:aggregation [[:distinct [:+ $checkins.venue_category_name $checkins.venue_name]]]}))))))

(deftest metrics-inside-aggregation-clauses-test
  (mt/test-driver :druid
    (testing "check that we can handle METRICS inside expression aggregation clauses"
      (tqpt/with-flattened-dbdef
        (mt/with-temp Metric [metric {:definition (mt/$ids checkins
                                                    {:aggregation [:sum $venue_price]
                                                     :filter      [:> $venue_price 1]})}]
          (is (= [["2" 1231.0]
                  ["3"  346.0]
                  ["4" 197.0]]
                 (mt/rows
                   (mt/run-mbql-query checkins
                     {:aggregation [:+ [:metric (u/get-id metric)] 1]
                      :breakout    [$venue_price]})))))))))

(deftest order-by-aggregation-test
  (mt/test-driver :druid
    (doseq [[direction expected-rows] {:desc [["Bar" "Felipinho Asklepios"      8]
                                              ["Bar" "Spiros Teofil"            8]
                                              ["Japanese" "Felipinho Asklepios" 7]
                                              ["Japanese" "Frans Hevel"         7]
                                              ["Mexican" "Shad Ferdynand"       7]]
                                       :asc  [["American" "Rüstem Hebel"    1]
                                              ["Artisan"  "Broen Olujimi"   1]
                                              ["Artisan"  "Conchúr Tihomir" 1]
                                              ["Artisan"  "Dwight Gresham"  1]
                                              ["Artisan"  "Plato Yeshua"    1]]}]
      (testing direction
        (is (= expected-rows
               (druid-query-returning-rows
                 {:aggregation [[:aggregation-options [:distinct $checkins.venue_name] {:name "__count_0"}]]
                  :breakout    [$venue_category_name $user_name]
                  :order-by    [[direction [:aggregation 0]] [:asc $checkins.venue_category_name]]
                  :limit       5})))))))

(deftest hll-count-test
  (mt/test-driver :druid
    (testing "Do we generate the correct count clause for HLL fields?"
      (is (= [["Bar"      "Szymon Theutrich"    13]
              ["Mexican"  "Dwight Gresham"      12]
              ["American" "Spiros Teofil"       10]
              ["Bar"      "Felipinho Asklepios" 10]
              ["Bar"      "Kaneonuskatew Eiran" 10]]
             (druid-query-returning-rows
               {:aggregation [[:aggregation-options [:count $checkins.user_name] {:name "unique_users"}]]
                :breakout   [$venue_category_name $user_name]
                :order-by   [[:desc [:aggregation 0]] [:asc $checkins.venue_category_name]]
                :limit      5}))))))

(deftest numeric-filter-test
  (mt/test-driver :druid
    (testing
        (tqpt/with-flattened-dbdef
          (letfn [(compiled [query]
                    (-> (qp/query->native query) :query (select-keys [:filter :queryType])))]
            (doseq [[message field] {"Make sure we can filter by numeric columns (#10935)" :venue_price
                                     "We should be able to filter by Metrics (#11823)"     :count}
                    :let            [field-clause [:field-id (mt/id :checkins field)]
                                     field-name   (name field)]]
              (testing message
                (testing "scan query"
                  (let [query (mt/mbql-query checkins
                                {:fields   [$id $venue_price $venue_name]
                                 :filter   [:= field-clause 1]
                                 :order-by [[:desc $id]]
                                 :limit    5})]
                    (is (= {:filter    {:type :selector, :dimension field-name, :value 1}
                            :queryType :scan}
                           (compiled query)))
                    (is (= ["931" "1" "Kinaree Thai Bistro"]
                           (mt/first-row (qp/process-query query))))))

                (testing "topN query"
                  (let [query (mt/mbql-query checkins
                                {:aggregation [[:count]]
                                 :breakout    [$venue_price]
                                 :filter      [:= field-clause 1]})]
                    (is (= {:filter    {:type :selector, :dimension field-name, :value 1}
                            :queryType :topN}
                           (compiled query)))
                    (is (= ["1" 221]
                           (mt/first-row (qp/process-query query))))))

                (testing "groupBy query"
                  (let [query (mt/mbql-query checkins
                                {:aggregation [[:aggregation-options [:distinct $checkins.venue_name] {:name "__count_0"}]]
                                 :breakout    [$venue_category_name $user_name]
                                 :order-by    [[:desc [:aggregation 0]] [:asc $checkins.venue_category_name]]
                                 :filter      [:= field-clause 1]})]
                    (is (= {:filter    {:type :selector, :dimension field-name, :value 1}
                            :queryType :groupBy}
                           (compiled query)))
                    (is (= (case field
                             :count       ["Bar" "Felipinho Asklepios" 8]
                             :venue_price ["Mexican" "Conchúr Tihomir" 4])
                           (mt/first-row (qp/process-query query))))))

                (testing "timeseries query"
                  (let [query (mt/mbql-query checkins
                                {:aggregation [[:count]]
                                 :filter      [:= field-clause 1]})]
                    (is (= {:queryType :timeseries
                            :filter    {:type :selector, :dimension field-name, :value 1}}
                           (compiled query)))
                    (is (= (case field
                             :count       [1000]
                             :venue_price [221])
                           (mt/first-row (qp/process-query query)))))))))))))
