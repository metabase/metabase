(ns metabase.driver.druid-test
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver
             [druid :as druid]
             [util :as driver.u]]
            [metabase.models
             [field :refer [Field]]
             [metric :refer [Metric]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.util
             [log :as tu.log]
             [timezone :as tu.tz]]
            [metabase.timeseries-query-processor-test.util :as tqpt]
            [toucan.util.test :as tt]))

;;; table-rows-sample
(defn- table-rows-sample []
  (->> (metadata-queries/table-rows-sample (Table (data/id :checkins))
         [(Field (data/id :checkins :id))
          (Field (data/id :checkins :venue_name))
          (Field (data/id :checkins :timestamp))])
       (sort-by first)
       (take 5)))

(deftest table-rows-sample-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (testing "Druid driver doesn't need to convert results to the expected timezone for us. QP middleware can handle that."
        (let [expected [[1 "The Misfit Restaurant + Bar" #t "2014-04-07T00:00:00Z[UTC]"]
                        [2 "Bludso's BBQ"                #t "2014-09-18T00:00:00Z[UTC]"]
                        [3 "Philippe the Original"       #t "2014-09-15T00:00:00Z[UTC]"]
                        [4 "Wurstküche"                  #t "2014-03-11T00:00:00Z[UTC]"]
                        [5 "Hotel Biron"                 #t "2013-05-05T00:00:00Z[UTC]"]]]
          (testing "UTC timezone"
            (is (= expected
                   (table-rows-sample))))
          (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
            (is (= expected
                   (table-rows-sample))))
          (tu.tz/with-system-timezone-id "America/Chicago"
            (is (= expected
                   (table-rows-sample)))))))))

(def ^:private ^String native-query-1
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
                             :database (data/id)})
          (m/dissoc-in [:data :results_metadata])))))

(def ^:private col-defaults
  {:base_type :type/Text})

(deftest native-query-test
  (mt/test-driver :druid
    (is (= {:row_count 2
            :status    :completed
            :data      {:rows             [[931 "Simcha Yan" 1 "Kinaree Thai Bistro"       1]
                                           [285 "Kfir Caj"   2 "Ruen Pair Thai Restaurant" 1]]
                        :cols             (mapv #(merge col-defaults %)
                                                [{:name         "id"
                                                  :source       :native
                                                  :display_name "id"
                                                  :field_ref    [:field-literal "id" :type/Integer]
                                                  :base_type    :type/Integer}
                                                 {:name         "user_name"
                                                  :source       :native
                                                  :display_name "user_name"
                                                  :field_ref    [:field-literal "user_name" :type/Text]}
                                                 {:name         "venue_price"
                                                  :source       :native
                                                  :display_name "venue_price"
                                                  :base_type    :type/Integer
                                                  :field_ref    [:field-literal "venue_price" :type/Integer]}
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


(def ^:private ^String native-query-2
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
     (qp/process-query (data/mbql-query ~'checkins
                         ~@body))))

(defmacro ^:private druid-query-returning-rows {:style/indent 0} [& body]
  `(mt/rows (druid-query ~@body)))

(deftest start-of-week-test
  (mt/test-driver :druid
    (is (= [["2015-10-04" 9]]
           (druid-query-returning-rows
             {:filter      [:between [:datetime-field $timestamp :day] "2015-10-04" "2015-10-10"]
              :aggregation [[:count $id]]
              :breakout    [[:datetime-field $timestamp :week]]}))
        (str "Count the number of events in the given week. Metabase uses Sunday as the start of the week, Druid by "
             "default will use Monday. All of the below events should happen in one week. Using Druid's default "
             "grouping, 3 of the events would have counted for the previous week."))))

(deftest aggregation-test
  (mt/test-driver :druid
    (testing "sum, *"
      (is (= [["1" 110688.0]
              ["2" 616708.0]
              ["3" 179661.0]
              ["4"  86284.0]]
             (druid-query-returning-rows
               {:aggregation [[:sum [:* $id $venue_price]]]
                :breakout    [$venue_price]}))))

    (testing "min, +"
      (is (= [["1"  4.0]
              ["2"  3.0]
              ["3"  8.0]
              ["4" 12.0]]
             (druid-query-returning-rows
               {:aggregation [[:min [:+ $id $venue_price]]]
                :breakout    [$venue_price]}))))

    (testing "max, /"
      (is (= [["1" 1000.0]
              ["2"  499.5]
              ["3"  332.0]
              ["4"  248.25]]
             (druid-query-returning-rows
               {:aggregation [[:max [:/ $id $venue_price]]]
                :breakout    [$venue_price]}))))

    (testing "avg, -"
      (is (= [["1" 500.85067873303166]
              ["2" 1002.7772357723577]
              ["3" 1562.2695652173913]
              ["4" 1760.8979591836735]]
             (druid-query-returning-rows
               {:aggregation [[:avg [:* $id $venue_price]]]
                :breakout    [$venue_price]}))))

    (testing "share"
      (is (= [[0.951]]
             (druid-query-returning-rows
               {:aggregation [[:share [:< $venue_price 4]]]}))))

    (testing "count-where"
      (is (= [[951]]
             (druid-query-returning-rows
               {:aggregation [[:count-where [:< $venue_price 4]]]}))))

    (testing "sum-where"
      (is (= [[1796.0]]
             (druid-query-returning-rows
               {:aggregation [[:sum-where $venue_price [:< $venue_price 4]]]}))))))

(deftest post-aggregation-math-test
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

    (testing "post aggregation math + math inside aggregations: max(venue_price) + min(venue_price - id)"
      (is (= [["1" -998.0]
              ["2" -995.0]
              ["3" -990.0]
              ["4" -985.0]]
             (druid-query-returning-rows
               {:aggregation [[:+
                               [:max $venue_price]
                               [:min [:- $venue_price $id]]]]
                :breakout    [$venue_price]}))))

    (testing "aggregation w/o field"
      (is (= [["1" 222.0]
              ["2" 616.0]
              ["3" 116.0]
              ["4"  50.0]]
             (druid-query-returning-rows
               {:aggregation [[:+ 1 [:count]]]
                :breakout    [$venue_price]}))))

    (testing "aggregation with math inside the aggregation :scream_cat:"
      (is (= [["1"  442.0]
              ["2" 1845.0]
              ["3"  460.0]
              ["4"  245.0]]
             (druid-query-returning-rows
               {:aggregation [[:sum [:+ $venue_price 1]]]
                :breakout    [$venue_price]}))))

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
        (tt/with-temp Metric [metric {:definition (mt/$ids checkins
                                                    {:aggregation [:sum $venue_price]
                                                     :filter      [:> $venue_price 1]})}]
          (is (= [["2" 1231.0]
                  ["3"  346.0]
                  ["4" 197.0]]
                 (mt/rows
                   (mt/run-mbql-query checkins
                     {:aggregation [:+ [:metric (u/get-id metric)] 1]
                      :breakout    [$venue_price]})))))))))

(deftest ssh-tunnel-test
  (is (thrown?
       com.jcraft.jsch.JSchException
       (try
         (let [engine  :druid
               details {:ssl            false
                        :password       "changeme"
                        :tunnel-host    "localhost"
                        :tunnel-pass    "BOGUS-BOGUS"
                        :port           5432
                        :dbname         "test"
                        :host           "http://localhost"
                        :tunnel-enabled true
                        :tunnel-port    22
                        :tunnel-user    "bogus"}]
           (tu.log/suppress-output
             (driver.u/can-connect-with-details? engine details :throw-exceptions)))
         (catch Throwable e
           (loop [^Throwable e e]
             (or (when (instance? com.jcraft.jsch.JSchException e)
                   (throw e)
                   e)
                 (some-> (.getCause e) recur))))))))

(deftest query-cancelation-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (let [query (mt/mbql-query checkins)]
        (mt/with-open-channels [running-chan (a/promise-chan)
                                cancel-chan  (a/promise-chan)]
          (with-redefs [druid/DELETE   (fn [& _]
                                         (a/>!! cancel-chan ::cancel))
                        druid/do-query (fn [& _]
                                         (a/>!! running-chan ::running)
                                         (Thread/sleep 5000)
                                         (throw (Exception. "Don't actually run!")))]

            (let [out-chan (qp/process-query-async query)]
              ;; wait for query to start running, then close `out-chan`
              (a/go
                (a/<! running-chan)
                (a/close! out-chan)))
            (is (= ::cancel
                   (mt/wait-for-result cancel-chan 2000)))))))))

(deftest results-order-test
  (mt/test-driver :druid
    (testing (str "Make sure Druid cols + columns come back in the same order and that that order is the expected MBQL "
                  "columns order (#9294)")
      (tqpt/with-flattened-dbdef
        (let [results (mt/run-mbql-query checkins
                        {:limit 1})]
          (assert (= (:status results) :completed)
            (u/pprint-to-str 'red results))
          (testing "cols"
            (is (= ["id"
                    "timestamp"
                    "count"
                    "user_last_login"
                    "user_name"
                    "venue_category_name"
                    "venue_latitude"
                    "venue_longitude"
                    "venue_name"
                    "venue_price"]
                   (->> results :data :cols (map :name)))))
          (testing "rows"
            (is (= [[931
                     "2013-01-03T08:00:00Z"
                     1
                     "2014-01-01T08:30:00.000Z"
                     "Simcha Yan"
                     "Thai"
                     "34.094"
                     "-118.344"
                     "Kinaree Thai Bistro"
                     "1"]]
                   (-> results :data :rows)))))))))

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

(deftest sync-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (testing "describe-database"
        (is (= {:tables #{{:schema nil, :name "checkins"}}}
               (driver/describe-database :druid (data/db)))))

      (testing "describe-table"
        (is (= {:schema nil
                :name "checkins"
                :fields
                #{{:name "unique_users",        :base-type :type/DruidHyperUnique, :database-type "hyperUnique"}
                  {:name "count",               :base-type :type/Integer, :database-type "LONG"}
                  {:name "id",                  :base-type :type/Integer, :database-type "LONG"}
                  {:name "timestamp",           :base-type :type/Instant, :database-type "timestamp", :pk? true}
                  {:name "user_last_login",     :base-type :type/Text,    :database-type "STRING"}
                  {:name "user_name",           :base-type :type/Text,    :database-type "STRING"}
                  {:name "user_password",       :base-type :type/Text,    :database-type "STRING"}
                  {:name "venue_category_name", :base-type :type/Text,    :database-type "STRING"}
                  {:name "venue_latitude",      :base-type :type/Float,   :database-type "DOUBLE"}
                  {:name "venue_longitude",     :base-type :type/Float,   :database-type "DOUBLE"}
                  {:name "venue_name",          :base-type :type/Text,    :database-type "STRING"}
                  {:name "venue_price",         :base-type :type/Integer, :database-type "LONG"}}}
               (driver/describe-table :druid (data/db) {:name "checkins"})))))))
