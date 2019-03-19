(ns metabase.query-processor.async-test
  (:require [clojure.core.async :as a]
            [expectations :refer [expect]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.async :as qp.async]
            [metabase.test.data :as data]
            [metabase.test.util.async :as tu.async]
            [metabase.util.encryption :as encrypt]))

;; running a query async should give you the same results as running that query synchronously
(let [query
      {:database (data/id)
       :type     :query
       :query    {:source-table (data/id :venues)
                  :fields       [[:field-id (data/id :venues :name)]]
                  :limit        5}}
      ;; Metadata checksum might be encrypted if a encryption key is set on this system (to make it hard for bad
      ;; actors to forge one) in which case the checksums won't be equal.
      maybe-decrypt-checksum
      #(some-> % (update-in [:data :results_metadata :checksum] encrypt/maybe-decrypt))]
  (expect
    (maybe-decrypt-checksum
     (qp/process-query query))
    (maybe-decrypt-checksum
     (tu.async/with-open-channels [result-chan (qp.async/process-query query)]
       (first (a/alts!! [result-chan (a/timeout 1000)]))))))

(expect
  [{:name         "NAME"
    :display_name "Name"
    :base_type    :type/Text
    :special_type :type/Name
    :fingerprint  {:global {:distinct-count 100, :nil% 0.0},
                   :type   #:type {:Text
                                   {:percent-json   0.0,
                                    :percent-url    0.0,
                                    :percent-email  0.0,
                                    :average-length 15.63}}}}]
  (tu.async/with-open-channels [result-chan (qp.async/result-metadata-for-query-async
                                             {:database (data/id)
                                              :type     :query
                                              :query    {:source-table (data/id :venues)
                                                         :fields       [[:field-id (data/id :venues :name)]]}})]
    (first (a/alts!! [result-chan (a/timeout 1000)]))))
