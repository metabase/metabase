(ns metabase.query-processor-test.binning-test
  "Tests for binning that aren't per se related to the [[metabase.query-processor.middleware.binning]] middleware
  itself. Tests for the middleware's behavior live in [[metabase.query-processor.middleware.binning-test]]."
  (:require [clojure.test :refer :all]
            [metabase.models.field :as field :refer [Field]]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]))

(deftest decimal-division-test
  (testing "Binning should use decimal division for bin ranges (#9228)"
    (mt/test-drivers (mt/normal-drivers-with-feature :binning)
      (mt/dataset sample-dataset
        (mt/with-temp-vals-in-db Field (mt/id :reviews :rating) {:fingerprint {:global {:distinct-count 5}
                                                                               :type   {:type/Number {:min 1.0, :max 5.0}}}}
          (let [query (mt/mbql-query reviews
                        {:aggregation [[:count]]
                         :breakout    [[:field %rating {:binning {:strategy :default}}]]})]
            (mt/with-native-query-testing-context query
              (is (= [[1 46]
                      [2 89]
                      [3 70]
                      [4 535]
                      [5 372]]
                     (mt/formatted-rows [int int] (qp/process-query query)))))))))))
