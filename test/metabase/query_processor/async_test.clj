(ns metabase.query-processor.async-test
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor :as qp]
             [test :as mt]]
            [metabase.query-processor.async :as qp.async]
            [metabase.test.data :as data]
            [metabase.test.util.async :as tu.async]
            [metabase.util.encryption :as encrypt]))

;; Metadata checksum might be encrypted if a encryption key is set on this system (to make it hard for bad
;; actors to forge one) in which case the checksums won't be equal.
(defn- maybe-decrypt-checksum [result]
  (some-> result (update-in [:data :results_metadata :checksum] encrypt/maybe-decrypt)))

(deftest run-async-test
  (testing "running a query async should give you the same results as running that query synchronously"
    (let [query (mt/mbql-query venues
                  {:fields [$name]
                   :limit  5})]
      (mt/with-open-channels [result-chan (qp.async/process-query query)]
        (is (= (maybe-decrypt-checksum (qp/process-query query))
               (maybe-decrypt-checksum (mt/wait-for-result result-chan 1000))))))))

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
