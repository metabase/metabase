(ns metabase.query-processor-test.unix-timestamp-test
  "Tests for UNIX timestamp support."
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]))

(deftest filter-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= 10
           ;; There's a race condition with this test. If we happen to grab a
           ;; connection that is in a session with the timezone set to pacific,
           ;; we'll get 9 results even when the above if statement is true. It
           ;; seems to be pretty rare, but explicitly specifying UTC will make
           ;; the issue go away
           (mt/with-temporary-setting-values [report-timezone "UTC"]
             (count (mt/rows (mt/dataset sad-toucan-incidents
                               (mt/run-mbql-query incidents
                                 {:filter   [:= [:datetime-field $timestamp :day] "2015-06-02"]
                                  :order-by [[:asc $timestamp]]}))))))
        "There were 10 'sad toucan incidents' on 2015-06-02 in UTC")))

(deftest results-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= (cond
             (= :sqlite driver/*driver*)
             [["2015-06-01"  6]
              ["2015-06-02" 10]
              ["2015-06-03"  4]
              ["2015-06-04"  9]
              ["2015-06-05"  9]
              ["2015-06-06"  8]
              ["2015-06-07"  8]
              ["2015-06-08"  9]
              ["2015-06-09"  7]
              ["2015-06-10"  9]]

             (qp.test/tz-shifted-driver-bug? driver/*driver*)
             [["2015-06-01T00:00:00-07:00" 6]
              ["2015-06-02T00:00:00-07:00" 10]
              ["2015-06-03T00:00:00-07:00" 4]
              ["2015-06-04T00:00:00-07:00" 9]
              ["2015-06-05T00:00:00-07:00" 9]
              ["2015-06-06T00:00:00-07:00" 8]
              ["2015-06-07T00:00:00-07:00" 8]
              ["2015-06-08T00:00:00-07:00" 9]
              ["2015-06-09T00:00:00-07:00" 7]
              ["2015-06-10T00:00:00-07:00" 9]]

             (qp.test/supports-report-timezone? driver/*driver*)
             [["2015-06-01T00:00:00-07:00" 8]
              ["2015-06-02T00:00:00-07:00" 9]
              ["2015-06-03T00:00:00-07:00" 9]
              ["2015-06-04T00:00:00-07:00" 4]
              ["2015-06-05T00:00:00-07:00" 11]
              ["2015-06-06T00:00:00-07:00" 8]
              ["2015-06-07T00:00:00-07:00" 6]
              ["2015-06-08T00:00:00-07:00" 10]
              ["2015-06-09T00:00:00-07:00" 6]
              ["2015-06-10T00:00:00-07:00" 10]]

             :else
             [["2015-06-01T00:00:00Z" 6]
              ["2015-06-02T00:00:00Z" 10]
              ["2015-06-03T00:00:00Z" 4]
              ["2015-06-04T00:00:00Z" 9]
              ["2015-06-05T00:00:00Z" 9]
              ["2015-06-06T00:00:00Z" 8]
              ["2015-06-07T00:00:00Z" 8]
              ["2015-06-08T00:00:00Z" 9]
              ["2015-06-09T00:00:00Z" 7]
              ["2015-06-10T00:00:00Z" 9]])
           (mt/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
             (->> (mt/dataset sad-toucan-incidents
                    (mt/run-mbql-query incidents
                      {:aggregation [[:count]]
                       :breakout    [$timestamp]
                       :limit       10}))
                  mt/rows (mt/format-rows-by [identity int])))))))

(deftest substitute-native-parameters-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
    (testing "Make sure `:date/range` SQL field filters work correctly with UNIX timestamps (#11934)"
      (mt/dataset tupac-sightings
        (let [query (mt/native-query
                      (merge (mt/count-with-field-filter-query driver/*driver* :sightings :timestamp)
                             (mt/$ids sightings
                               {:template-tags {"timestamp" {:name         "timestamp"
                                                             :display-name "Sighting Timestamp"
                                                             :type         :dimension
                                                             :dimension    $timestamp
                                                             :widget-type  :date/range}}
                                :parameters    [{:type   :date/range
                                                 :target [:dimension [:template-tag "timestamp"]]
                                                 :value  "2014-02-01~2015-02-29"}]})))]
          (testing (format "\nquery = %s" (u/pprint-to-str query))
            (is (= [[41]]
                   (mt/formatted-rows [int]
                     (qp/process-query query))))))))))
