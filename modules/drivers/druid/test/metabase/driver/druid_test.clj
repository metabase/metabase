(ns metabase.driver.druid-test
  (:require [cheshire.core :as json]
            [clj-time.core :as time]
            [expectations :refer [expect]]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
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
            [metabase.test.data.datasets :as datasets]
            [metabase.test.util
             [log :as tu.log]
             [timezone :as tu.tz]]
            [metabase.timeseries-query-processor-test.util :as tqpt]
            [toucan.util.test :as tt]))

;;; table-rows-sample
(defn table-rows-sample []
  (->> (metadata-queries/table-rows-sample (Table (data/id :checkins))
         [(Field (data/id :checkins :id))
          (Field (data/id :checkins :venue_name))
          (Field (data/id :checkins :timestamp))])
       (sort-by first)
       (take 5)))

(datasets/expect-with-driver :druid
  ;; druid returns a timestamp along with the query, but that shouldn't really matter here :D
  [["1"    "The Misfit Restaurant + Bar" #inst "2014-04-07T07:00:00.000Z"]
   ["10"   "Dal Rae Restaurant"          #inst "2015-08-22T07:00:00.000Z"]
   ["100"  "PizzaHacker"                 #inst "2014-07-26T07:00:00.000Z"]
   ["1000" "Tito's Tacos"                #inst "2014-06-03T07:00:00.000Z"]
   ["101"  "Golden Road Brewing"         #inst "2015-09-04T07:00:00.000Z"]]
  (table-rows-sample))

(datasets/expect-with-driver :druid
  ;; druid returns a timestamp along with the query, but that shouldn't really matter here :D
  [["1"    "The Misfit Restaurant + Bar" #inst "2014-04-07T00:00:00.000-07:00"]
   ["10"   "Dal Rae Restaurant"          #inst "2015-08-22T00:00:00.000-07:00"]
   ["100"  "PizzaHacker"                 #inst "2014-07-26T00:00:00.000-07:00"]
   ["1000" "Tito's Tacos"                #inst "2014-06-03T00:00:00.000-07:00"]
   ["101"  "Golden Road Brewing"         #inst "2015-09-04T00:00:00.000-07:00"]]
  (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
    (table-rows-sample)))

(datasets/expect-with-driver :druid
  ;; druid returns a timestamp along with the query, but that shouldn't really matter here :D
  [["1"    "The Misfit Restaurant + Bar" #inst "2014-04-07T02:00:00.000-05:00"]
   ["10"   "Dal Rae Restaurant"          #inst "2015-08-22T02:00:00.000-05:00"]
   ["100"  "PizzaHacker"                 #inst "2014-07-26T02:00:00.000-05:00"]
   ["1000" "Tito's Tacos"                #inst "2014-06-03T02:00:00.000-05:00"]
   ["101"  "Golden Road Brewing"         #inst "2015-09-04T02:00:00.000-05:00"]]
  (tu.tz/with-jvm-tz (time/time-zone-for-id "America/Chicago")
    (table-rows-sample)))

(def ^:private ^String native-query-1
  (json/generate-string
    {:intervals   ["1900-01-01/2100-01-01"]
     :granularity :all
     :queryType   :select
     :pagingSpec  {:threshold 2}
     :dataSource  :checkins
     :dimensions  [:id
                   :user_name
                   :venue_price
                   :venue_name]
     :metrics     [:count]}))

(defn- process-native-query [query]
  (driver/with-driver :druid
    (tqpt/with-flattened-dbdef
      (-> (qp/process-query {:native   {:query query}
                             :type     :native
                             :database (data/id)})
          (m/dissoc-in [:data :results_metadata])))))

(def ^:private col-defaults
  {:base_type :type/Text})

;; test druid native queries
(datasets/expect-with-driver :druid
  {:row_count 2
   :status    :completed
   :data      {:rows        [["2013-01-03T08:00:00.000Z" "931" "Simcha Yan" "1" "Kinaree Thai Bistro"       1]
                             ["2013-01-10T08:00:00.000Z" "285" "Kfir Caj"   "2" "Ruen Pair Thai Restaurant" 1]]
               :cols        (mapv #(merge col-defaults %)
                                  [{:name         "timestamp"
                                    :source       :native
                                    :display_name "timestamp"
                                    :field_ref    [:field-literal "timestamp" :type/Text]}
                                   {:name         "id"
                                    :source       :native
                                    :display_name "id"
                                    :field_ref    [:field-literal "id" :type/Text]}
                                   {:name         "user_name"
                                    :source       :native
                                    :display_name "user_name"
                                    :field_ref    [:field-literal "user_name" :type/Text]}
                                   {:name         "venue_price"
                                    :source       :native
                                    :display_name "venue_price"
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
               :native_form {:query native-query-1}}}
  (-> (process-native-query native-query-1)
      (m/dissoc-in [:data :insights])))


;; make sure we can run a native :timeseries query. This was throwing an Exception -- see #3409
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

(datasets/expect-with-driver :druid
  :completed
  (:status (process-native-query native-query-2)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            EXPRESSION AGGREGATIONS                                             |
;;; +----------------------------------------------------------------------------------------------------------------+


(defmacro ^:private druid-query {:style/indent 0} [& body]
  `(tqpt/with-flattened-dbdef
     (qp/process-query (data/mbql-query ~'checkins
                         ~@body))))

(defmacro ^:private druid-query-returning-rows {:style/indent 0} [& body]
  `(qp.test/rows (druid-query ~@body)))

;; Count the number of events in the given week. Metabase uses Sunday as the start of the week, Druid by default will
;; use Monday.All of the below events should happen in one week. Using Druid's default grouping, 3 of the events would
;; have counted for the previous week
(datasets/expect-with-driver :druid
  [["2015-10-04" 9]]
  (druid-query-returning-rows
    {:filter      [:between [:datetime-field $timestamp :day] "2015-10-04" "2015-10-10"]
     :aggregation [[:count $id]]
     :breakout    [[:datetime-field $timestamp :week]]}))

;; sum, *
(datasets/expect-with-driver :druid
  [["1" 110688.0]
   ["2" 616708.0]
   ["3" 179661.0]
   ["4"  86284.0]]
  (druid-query-returning-rows
    {:aggregation [[:sum [:* $id $venue_price]]]
     :breakout    [$venue_price]}))

;; min, +
(datasets/expect-with-driver :druid
  [["1"  4.0]
   ["2"  3.0]
   ["3"  8.0]
   ["4" 12.0]]
  (druid-query-returning-rows
    {:aggregation [[:min [:+ $id $venue_price]]]
     :breakout    [$venue_price]}))

;; max, /
(datasets/expect-with-driver :druid
  [["1" 1000.0]
   ["2"  499.5]
   ["3"  332.0]
   ["4"  248.25]]
  (druid-query-returning-rows
    {:aggregation [[:max [:/ $id $venue_price]]]
     :breakout    [$venue_price]}))

;; avg, -
(datasets/expect-with-driver :druid
  [["1" 500.85067873303166]
   ["2" 1002.7772357723577]
   ["3" 1562.2695652173913]
   ["4" 1760.8979591836735]]
  (druid-query-returning-rows
    {:aggregation [[:avg [:* $id $venue_price]]]
     :breakout    [$venue_price]}))

;; share
(datasets/expect-with-driver :druid
  [[0.951]]
  (druid-query-returning-rows
   {:aggregation [[:share [:< $venue_price 4]]]}))

;; count-where
(datasets/expect-with-driver :druid
  [[951]]
  (druid-query-returning-rows
   {:aggregation [[:count-where [:< $venue_price 4]]]}))

;; sum-where
(datasets/expect-with-driver :druid
  [[1796.0]]
  (druid-query-returning-rows
   {:aggregation [[:sum-where $venue_price [:< $venue_price 4]]]}))

;; post-aggregation math w/ 2 args: count + sum
(datasets/expect-with-driver :druid
  [["1"  442.0]
   ["2" 1845.0]
   ["3"  460.0]
   ["4"  245.0]]
  (druid-query-returning-rows
    {:aggregation [[:+ [:count $id] [:sum $venue_price]]]
     :breakout    [$venue_price]}))

;; post-aggregation math w/ 3 args: count + sum + count
(datasets/expect-with-driver :druid
  [["1"  663.0]
   ["2" 2460.0]
   ["3"  575.0]
   ["4"  294.0]]
  (druid-query-returning-rows
    {:aggregation [[:+
                    [:count $id]
                    [:sum $venue_price]
                    [:count $venue_price]]]
     :breakout    [$venue_price]}))

;; post-aggregation math w/ a constant: count * 10
(datasets/expect-with-driver :druid
  [["1" 2210.0]
   ["2" 6150.0]
   ["3" 1150.0]
   ["4"  490.0]]
  (druid-query-returning-rows
    {:aggregation [[:* [:count $id] 10]]
     :breakout    [$venue_price]}))

;; nested post-aggregation math: count + (count * sum)
(datasets/expect-with-driver :druid
  [["1"  49062.0]
   ["2" 757065.0]
   ["3"  39790.0]
   ["4"  9653.0]]
  (druid-query-returning-rows
    {:aggregation [[:+
                    [:count $id]
                    [:* [:count $id] [:sum $venue_price]]]]
     :breakout    [$venue_price]}))

;; post-aggregation math w/ avg: count + avg
(datasets/expect-with-driver :druid
  [["1"  721.8506787330316]
   ["2" 1116.388617886179]
   ["3"  635.7565217391304]
   ["4"  489.2244897959184]]
  (druid-query-returning-rows
    {:aggregation [[:+ [:count $id] [:avg $id]]]
     :breakout    [$venue_price]}))

;; post aggregation math + math inside aggregations: max(venue_price) + min(venue_price - id)
(datasets/expect-with-driver :druid
  [["1" -998.0]
   ["2" -995.0]
   ["3" -990.0]
   ["4" -985.0]]
  (druid-query-returning-rows
    {:aggregation [[:+
                    [:max $venue_price]
                    [:min [:- $venue_price $id]]]]
     :breakout    [$venue_price]}))

;; aggregation w/o field
(datasets/expect-with-driver :druid
  [["1" 222.0]
   ["2" 616.0]
   ["3" 116.0]
   ["4"  50.0]]
  (druid-query-returning-rows
    {:aggregation [[:+ 1 [:count]]]
     :breakout    [$venue_price]}))

;; aggregation with math inside the aggregation :scream_cat:
(datasets/expect-with-driver :druid
  [["1"  442.0]
   ["2" 1845.0]
   ["3"  460.0]
   ["4"  245.0]]
  (druid-query-returning-rows
    {:aggregation [[:sum [:+ $venue_price 1]]]
     :breakout    [$venue_price]}))

;; check that we can name an expression aggregation w/ aggregation at top-level
(datasets/expect-with-driver :druid
  [["1"  442.0]
   ["2" 1845.0]
   ["3"  460.0]
   ["4"  245.0]]
  (qp.test/rows
    (druid-query
      {:aggregation [[:aggregation-options [:sum [:+ $venue_price 1]] {:name "New Price"}]]
       :breakout    [$venue_price]})))

;; check that we can name an expression aggregation w/ expression at top-level
(datasets/expect-with-driver :druid
  {:rows    [["1"  180.0]
             ["2" 1189.0]
             ["3"  304.0]
             ["4"  155.0]]
   :columns ["venue_price" "Sum-41"]}
  (qp.test/rows+column-names
    (druid-query
      {:aggregation [[:aggregation-options [:- [:sum $venue_price] 41] {:name "Sum-41"}]]
       :breakout    [$venue_price]})))

;; distinct count of two dimensions
(datasets/expect-with-driver :druid
   {:rows [[98]]
    :columns ["count"]}
   (qp.test/rows+column-names
    (druid-query
     {:aggregation [[:distinct [:+  $checkins.venue_category_name
                                    $checkins.venue_name]]]})))

;; check that we can handle METRICS (ick) inside expression aggregation clauses
(datasets/expect-with-driver :druid
  [["2" 1231.0]
   ["3"  346.0]
   ["4" 197.0]]
  (tqpt/with-flattened-dbdef
    (tt/with-temp Metric [metric {:definition {:aggregation [:sum [:field-id (data/id :checkins :venue_price)]]
                                               :filter      [:> [:field-id (data/id :checkins :venue_price)] 1]}}]
      (qp.test/rows
        (data/run-mbql-query checkins
          {:aggregation [:+ [:metric (u/get-id metric)] 1]
           :breakout    [$venue_price]})))))

(expect
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
              e)
            (some-> (.getCause e) recur))))))

;; Query cancellation test, needs careful coordination between the query thread, cancellation thread to ensure
;; everything works correctly together
(datasets/expect-with-driver :druid
  ::tu/success
  ;; the `call-with-paused-query` helper is kind of wack and we need to redefine functions for the duration of the
  ;; test, and redefine them to operate on things that don't get bound unitl `call-with-paused-query` calls its fn
  ;;
  ;; that's why we're doing things this way
  (let [promises (atom nil)]
    (with-redefs [druid/do-query (fn [details query]
                                   (deliver (:called-query? @promises) true)
                                   @(:pause-query @promises))
                  druid/DELETE   (fn [url]
                                   (deliver (:called-cancel? @promises) true))]
      (tu/call-with-paused-query
       (fn [query-thunk called-query? called-cancel? pause-query]
         (reset! promises {:called-query?  called-query?
                           :called-cancel? called-cancel?
                           :pause-query    pause-query})
         (future
           (try
             (data/run-mbql-query checkins
               {:aggregation [[:count]]})
             (query-thunk)
             (catch Throwable e
               (println "Error running query:" e)
               (throw e)))))))))

;; Make sure Druid cols + columns come back in the same order and that that order is the expected MBQL columns order
;; (#9294)
(datasets/expect-with-driver :druid
  {:cols ["id"
          "timestamp"
          "count"
          "user_last_login"
          "user_name"
          "venue_category_name"
          "venue_latitude"
          "venue_longitude"
          "venue_name"
          "venue_price"]
   :rows [["931"
           "2013-01-03T08:00:00.000Z"
           1
           "2014-01-01T08:30:00.000Z"
           "Simcha Yan"
           "Thai"
           "34.094"
           "-118.344"
           "Kinaree Thai Bistro"
           "1"]]}
  (tqpt/with-flattened-dbdef
    (let [results (data/run-mbql-query checkins
                    {:limit 1})]
      (assert (= (:status results) :completed)
        (u/pprint-to-str 'red results))
      {:cols (->> results :data :cols (map :name))
       :rows (-> results :data :rows)})))

(datasets/expect-with-driver :druid
  [["Bar" "Felipinho Asklepios"      8]
   ["Bar" "Spiros Teofil"            8]
   ["Japanese" "Felipinho Asklepios" 7]
   ["Japanese" "Frans Hevel"         7]
   ["Mexican" "Shad Ferdynand"       7]]
  (druid-query-returning-rows
    {:aggregation [[:aggregation-options [:distinct $checkins.venue_name] {:name "__count_0"}]]
     :breakout    [$venue_category_name $user_name]
     :order-by    [[:desc [:aggregation 0]] [:asc $checkins.venue_category_name]]
     :limit       5}))

(datasets/expect-with-driver :druid
  [["American" "Rüstem Hebel"    1]
   ["Artisan"  "Broen Olujimi"   1]
   ["Artisan"  "Conchúr Tihomir" 1]
   ["Artisan"  "Dwight Gresham"  1]
   ["Artisan"  "Plato Yeshua"    1]]
  (druid-query-returning-rows
    {:aggregation [[:aggregation-options [:distinct $checkins.venue_name] {:name "__count_0"}]]
     :breakout   [$venue_category_name $user_name]
     :order-by   [[:asc [:aggregation 0]] [:asc $checkins.venue_category_name]]
     :limit      5}))
