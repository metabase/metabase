(ns metabase-enterprise.impersonation.result-metadata-test
  "Tests that query results served under a connection-impersonation policy carry no column fingerprint, since the
  stored fingerprint was computed over rows the impersonated role may not see (BOT-2115)."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.impersonation.result-metadata-test]}}}}}}
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.cache-test :as cache-test]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- col-fingerprints
  "`{col-name fingerprint}` for every col in a query `result`."
  [result]
  (into {} (map (juxt :name :fingerprint)) (mt/cols result)))

(defn- impersonation-def []
  {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
   :attributes     {"impersonation_attr" "impersonation_role"}})

(deftest impersonated-results-omit-fingerprints-test
  (mt/with-premium-features #{:advanced-permissions}
    (testing "BOT-2115: result cols for a user under an impersonation policy carry no fingerprint"
      (let [query (mt/mbql-query venues)]
        (impersonation.util-test/with-impersonations! (impersonation-def)
          (let [result (mt/user-http-request :rasta :post 202 "dataset" query)]
            (is (seq (mt/rows result)))
            (is (every? nil? (vals (col-fingerprints result)))))
          (testing "an admin is never impersonated and still gets the fingerprint"
            (is (=? {"PRICE" {:global {:distinct-count 4}}}
                    (col-fingerprints (mt/user-http-request :crowberto :post 202 "dataset" query))))))
        (testing "the same user without a policy still gets the fingerprint"
          (is (=? {"PRICE" {:global {:distinct-count 4}}}
                  (col-fingerprints (mt/user-http-request :rasta :post 202 "dataset" query)))))))))

(deftest impersonated-card-results-omit-fingerprints-test
  (mt/with-premium-features #{:advanced-permissions}
    (testing "BOT-2115: saved card results for a user under an impersonation policy carry no fingerprint"
      (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
        (impersonation.util-test/with-impersonations! (impersonation-def)
          (let [result (mt/user-http-request :rasta :post 202 (format "card/%d/query" (u/the-id card)))]
            (is (seq (mt/cols result)))
            (is (every? nil? (vals (col-fingerprints result))))))))))

(deftest impersonated-cached-results-omit-fingerprints-test
  (mt/with-premium-features #{:advanced-permissions}
    (testing "BOT-2115: a cached result replayed to a user under an impersonation policy carries no fingerprint"
      (cache-test/with-mock-cache! [save-chan]
        (impersonation.util-test/with-impersonations! (impersonation-def)
          (letfn [(run-query []
                    (qp/process-query (assoc (mt/mbql-query venues)
                                             :cache-strategy {:type             :ttl
                                                              :multiplier       60
                                                              :avg-execution-ms 10
                                                              :min_duration_ms  0})))]
            (let [result (run-query)]
              (is (nil? (:cached (:cache/details result))))
              (is (every? nil? (vals (col-fingerprints result)))))
            (testing "cache entry should be saved within 5 seconds"
              (let [[_ chan] (a/alts!! [save-chan (a/timeout 5000)])]
                (is (= save-chan chan))))
            (let [result (run-query)]
              (is (true? (:cached (:cache/details result))))
              (is (every? nil? (vals (col-fingerprints result)))))))))))
