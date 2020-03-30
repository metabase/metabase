(ns metabase.query-processor.async-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.async :as qp.async]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.test.util.async :as tu.async]))

(deftest async-result-metadata-test
  (testing "Should be able to get result metadata async"
    (tu.async/with-open-channels [result-chan (qp.async/result-metadata-for-query-async
                                               {:database (data/id)
                                                :type     :query
                                                :query    {:source-table (data/id :venues)
                                                           :fields       [[:field-id (data/id :venues :name)]]}})]
      (is (= [{:name         "NAME"
               :display_name "Name"
               :base_type    :type/Text
               :special_type :type/Name
               :fingerprint  {:global {:distinct-count 100, :nil% 0.0},
                              :type   #:type {:Text
                                              {:percent-json   0.0,
                                               :percent-url    0.0,
                                               :percent-email  0.0,
                                               :average-length 15.63}}}}]
             (mt/wait-for-result result-chan 1000))))))
