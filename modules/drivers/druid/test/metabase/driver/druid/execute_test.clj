(ns metabase.driver.druid.execute-test
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.driver.druid.execute :as druid.execute]
            [metabase.timeseries-query-processor-test.util :as tqpt]))

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
            (is (=  ["timestamp"
                     "venue_name"
                     "venue_longitude"
                     "venue_latitude"
                     "venue_price"
                     "venue_category_name"
                     "id"
                     "count"
                     "user_name"
                     "user_last_login"]
                   (->> results :data :cols (map :name)))))
          (testing "rows"
            (is (=  [["2013-01-03T08:00:00Z"
                      "Kinaree Thai Bistro"
                      "-118.344"
                      "34.094"
                      "1"
                      "Thai"
                      "931"
                      1
                      "Simcha Yan"
                      "2014-01-01T08:30:00.000Z"]]
                   (-> results :data :rows)))))))))

(deftest post-process-select-query-test
  (testing "Test that we can still return results from native :select queries, even if we no longer generate them"
    ;; example results adapted from https://github.com/apache/druid/blob/d00747774208dbbfcb272ee7d1c30cf879887838/docs/querying/select-query.md
    (let [results (with-open [r (io/reader "modules/drivers/druid/test/metabase/driver/druid/execute_test/select_results.json")]
                    (json/parse-stream r true))]
      (is (= {:projections [:a :b :c]
              :results     [{:timestamp #t "2013-01-01T00:00Z[UTC]", :robot "1", :namespace "article", :page "11._korpus_(NOVJ)"}
                            {:timestamp #t "2013-01-01T00:00Z[UTC]", :robot "0", :namespace "article", :page "112_U.S._580"}
                            {:timestamp #t "2013-01-01T00:00Z[UTC]", :robot "0", :namespace "article", :page "113_U.S._243"}
                            {:timestamp #t "2013-01-01T00:00Z[UTC]", :robot "0", :namespace "article", :page "113_U.S._73"}
                            {:timestamp #t "2013-01-01T00:00Z[UTC]", :robot "0", :namespace "article", :page "113_U.S._756"}]}
             (#'druid.execute/post-process :metabase.driver.druid.query-processor/select [:a :b :c] nil results))))))
