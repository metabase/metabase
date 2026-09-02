(ns metabase-enterprise.content-diagnostics.api-request-contract-test
  "The endpoints' request contract. The namespace declares `{:api/undeclared-keys :reject}`, so a query or body key
  no endpoint declares is a 400 naming it rather than a silent drop -- which is what a misspelled filter used to be,
  indistinguishable from one that matched nothing.

  Who may call these endpoints is a separate concern, covered by `api-test`; every request here is made as a
  superuser so the audience gate is never what answers.

  Every endpoint here declares a query schema, so the unbound-param-slot case lives in
  `metabase.api.macros.undeclared-keys-test` instead."
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private list-endpoints
  ["stale" "slow" "duplicated" "imbalanced"])

(defn- url [endpoint]
  (str "ee/content-diagnostics/" endpoint))

(deftest ^:parallel list-endpoints-reject-undeclared-query-params-test
  (mt/with-premium-features #{:content-diagnostics}
    (doseq [endpoint list-endpoints]
      (testing (url endpoint)
        (testing "a query param no endpoint declares is refused"
          (is (= {:whoops "unexpected key"}
                 (:errors (mt/user-http-request :crowberto :get 400 (url endpoint) :whoops "1")))))
        (testing "so is a misspelled one -- silently dropping it used to look like a filter that matched nothing"
          (is (= {:sort-colum "unexpected key"}
                 (:errors (mt/user-http-request :crowberto :get 400 (url endpoint) :sort-colum "asc")))))))))

(deftest ^:parallel undeclared-and-invalid-params-arrive-in-one-response-test
  (mt/with-premium-features #{:content-diagnostics}
    (testing "an undeclared param and a declared one that is out of range are both reported, so a caller sees the
             whole problem in one round trip"
      (is (= {:whoops         "unexpected key"
              :threshold-days "value must be an integer greater than zero."}
             (:errors (mt/user-http-request :crowberto :get 400 (url "stale")
                                            :whoops "1" :threshold-days 0)))))))

(deftest ^:parallel list-endpoints-still-accept-their-declared-params-test
  (mt/with-premium-features #{:content-diagnostics}
    (doseq [endpoint list-endpoints]
      (testing (url endpoint)
        (testing "the shared params are unaffected"
          (is (map? (mt/user-http-request :crowberto :get 200 (url endpoint)
                                          :query "nothing-matches-this"
                                          :sort-column "detected-at"
                                          :sort-direction "desc"
                                          :include-personal-collections false))))
        (testing "limit/offset are consumed by the paging middleware before decoding, so they are not undeclared"
          (let [response (mt/user-http-request :crowberto :get 200 (url endpoint) :limit 5 :offset 0)]
            (is (= 5 (:limit response)))
            (is (= 0 (:offset response)))))))))

(deftest ^:parallel endpoint-specific-params-are-declared-test
  (mt/with-premium-features #{:content-diagnostics}
    (testing "each endpoint accepts its own filter"
      (are [endpoint k v] (map? (mt/user-http-request :crowberto :get 200 (url endpoint) k v))
        "stale"      :threshold-days      30
        "slow"       :min-duration-ms     1000
        "duplicated" :min-duplicate-count 2
        "imbalanced" :finding-types       "empty"))
    (testing "and rejects one that belongs to a different endpoint"
      (are [endpoint k v] (= {k "unexpected key"}
                             (:errors (mt/user-http-request :crowberto :get 400 (url endpoint) k v)))
        "stale"      :min-duration-ms     1000
        "slow"       :threshold-days      30
        "duplicated" :finding-types       "empty"
        "imbalanced" :min-duplicate-count 2))))

(deftest ^:synchronous rejected-requests-are-counted-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-prometheus-system! [_ system]
      (letfn [(metric [labels]
                (mt/metric-value system :metabase-api/undeclared-request-keys labels))]
        (testing "a refused request is counted as a query rejection"
          (prometheus/clear! :metabase-api/undeclared-request-keys)
          (mt/user-http-request :crowberto :get 400 (url "stale") :whoops "1")
          (is (prometheus-test/approx= 1 (metric {:param-type "query", :outcome "rejected"})))
          (is (prometheus-test/approx= 0 (metric {:param-type "query", :outcome "dropped"}))))
        (testing "a request the endpoint accepts is not counted"
          (prometheus/clear! :metabase-api/undeclared-request-keys)
          (mt/user-http-request :crowberto :get 200 (url "stale"))
          (is (prometheus-test/approx= 0 (metric {:param-type "query", :outcome "rejected"}))))))))
