(ns metabase.driver.druid-test
  (:require [cheshire.core :as json]
            [expectations :refer :all]
            [metabase.query-processor :as qp]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :refer [expect-with-engine]]
            [metabase.timeseries-query-processor-test :as timeseries-qp-test]))

(def ^:const ^:private native-query
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
               :native_form {:query native-query}}}
  (metabase.test.data.datasets/with-engine :druid
    (timeseries-qp-test/with-flattened-dbdef
      (qp/process-query {:native   {:query native-query}
                         :type     :native
                         :database (data/id)}))))
