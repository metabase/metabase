(ns metabase.driver.sql-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [test :as mt]]))

(defn- sql-drivers []
  (filter #(isa? driver/hierarchy % :sql) (mt/normal-drivers)))

(deftest substitute-native-parameters-test
  (mt/test-drivers (sql-drivers)
    (testing "Make sure `:date/range` SQL field filters work correctly with UNIX timestamps (#11934)"
      (mt/dataset tupac-sightings
        (let [{native-query :query} (mt/dataset tupac-sightings (qp/query->native (mt/mbql-query sightings {:aggregation [[:count]]})))
              query                 (mt/query sightings
                                      {:type   :native
                                       :native {:query         (str native-query " WHERE {{timestamp}}")
                                                :template-tags {"timestamp" {:name         "timestamp"
                                                                             :display-name "Sighting Timestamp"
                                                                             :type         :dimension
                                                                             :dimension    $timestamp
                                                                             :widget-type  :date/range}}
                                                :parameters    [{:type   :date/range
                                                                 :target [:dimension [:template-tag "timestamp"]]
                                                                 :value  "2014-02-01~2015-02-29"}]}})]
          (is (= [[41]]
                 (mt/formatted-rows [int]
                   (qp/process-query query)))))))))
