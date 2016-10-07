(ns metabase.driver.druid-test
  (:require [cheshire.core :as json]
            [expectations :refer :all]
            [metabase.query-processor :as qp]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets, :refer [expect-with-engine]]
            [metabase.timeseries-query-processor-test :as timeseries-qp-test]))

(def ^:const ^:private ^String native-query-1
  (json/generate-string
    {:intervals   ["1900-01-01/2100-01-01"]
     :granularity :all
     :queryType   :select
     :pagingSpec  {:threshold 2}
     :dataSource  :checkins
     :dimensions  [:venue_price
                   :venue_name
                   :user_name
                   :id]
     :metrics     [:count]}))

(defn- process-native-query [query]
  (datasets/with-engine :druid
    (timeseries-qp-test/with-flattened-dbdef
      (qp/process-query {:native   {:query query}
                         :type     :native
                         :database (data/id)}))))

;; test druid native queries
(expect-with-engine :druid
  {:row_count 2
   :status    :completed
   :data      {:columns     ["timestamp" "id" "user_name" "venue_price" "venue_name" "count"]
               :rows        [["2013-01-03T08:00:00.000Z" "931" "Simcha Yan" "1" "Kinaree Thai Bistro"       1]
                             ["2013-01-10T08:00:00.000Z" "285" "Kfir Caj"   "2" "Ruen Pair Thai Restaurant" 1]]
               :annotate?   nil
               :cols        [{:name "timestamp",   :base_type :type/Text}
                             {:name "id",          :base_type :type/Text}
                             {:name "user_name",   :base_type :type/Text}
                             {:name "venue_price", :base_type :type/Text}
                             {:name "venue_name",  :base_type :type/Text}
                             {:name "count",       :base_type :type/Integer}]
               :native_form {:query native-query-1}}}
  (process-native-query native-query-1))


;; make sure we can run a native :timeseries query. This was throwing an Exception -- see #3409
(def ^:const ^:private ^String native-query-2
  (json/generate-string
    {:intervals    ["1900-01-01/2100-01-01"]
     :granularity  {:type     :period
                    :period   :P1M
                    :timeZone :UTC}
     :queryType    :timeseries
     :dataSource   :checkins
     :aggregations [{:type :count
                     :name :count}]}))

(expect-with-engine :druid
  :completed
  (:status (process-native-query native-query-2)))
