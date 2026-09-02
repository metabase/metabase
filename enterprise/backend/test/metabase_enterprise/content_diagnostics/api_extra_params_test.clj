(ns metabase-enterprise.content-diagnostics.api-extra-params-test
  "Undeclared query params are rejected rather than silently stripped. `defendpoint` decodes before it
  validates, so without the namespace's `+reject-undeclared-query-params` middleware a typo like
  `sort-colum` is dropped and the caller gets a 200 with unsorted results. The audience gate lives in
  `api-test`; this suite only exercises param handling, always as an authorized caller."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(def ^:private endpoints
  ["ee/content-diagnostics/stale"
   "ee/content-diagnostics/slow"
   "ee/content-diagnostics/imbalanced"
   "ee/content-diagnostics/duplicated"])

(deftest ^:parallel undeclared-query-param-is-rejected-test
  (testing "a query param no endpoint declares 400s, and the error names the offending key"
    (mt/with-premium-features #{:content-diagnostics}
      (doseq [endpoint endpoints]
        (testing endpoint
          (is (= {:whoops "unexpected query parameter"}
                 (:errors (mt/user-http-request :crowberto :get 400 endpoint :whoops "1")))))))))

(deftest ^:parallel misspelled-query-param-is-rejected-test
  (testing "a misspelled param 400s instead of answering 200 with the param silently dropped"
    ;; The motivating case: `sort-colum` used to return an unsorted 200, indistinguishable from a filter
    ;; that legitimately matched nothing.
    (mt/with-premium-features #{:content-diagnostics}
      (doseq [endpoint endpoints]
        (testing endpoint
          (is (= {:sort-colum "unexpected query parameter"}
                 (:errors (mt/user-http-request :crowberto :get 400 endpoint :sort-colum "asc")))))))))

(deftest ^:parallel declared-shared-params-are-accepted-test
  (testing "the params every endpoint declares still answer 200"
    (mt/with-premium-features #{:content-diagnostics}
      (doseq [endpoint endpoints]
        (testing endpoint
          (is (some? (mt/user-http-request :crowberto :get 200 endpoint
                                           :query                        "abc"
                                           :sort-column                  "name"
                                           :sort-direction               "desc"
                                           :include-personal-collections "true"))))))))

(deftest ^:parallel endpoint-specific-filters-are-accepted-test
  (testing "each endpoint's own filter param still answers 200"
    (mt/with-premium-features #{:content-diagnostics}
      (doseq [[endpoint param value] [["ee/content-diagnostics/stale"      :threshold-days      "30"]
                                      ["ee/content-diagnostics/slow"       :min-duration-ms     "1000"]
                                      ["ee/content-diagnostics/duplicated" :min-duplicate-count "2"]
                                      ["ee/content-diagnostics/imbalanced" :finding-types       "empty"]]]
        (testing (str endpoint " " param)
          (is (some? (mt/user-http-request :crowberto :get 200 endpoint param value))))))))

(deftest ^:parallel well-formed-paging-params-are-accepted-test
  (testing "`limit`/`offset` answer 200 and are echoed back"
    ;; They are not in the allowlist. `handle-paging` strips them from `:query-params` before the check
    ;; runs, which is exactly why they get through -- pin that rather than assume it.
    (mt/with-premium-features #{:content-diagnostics}
      (doseq [endpoint endpoints]
        (testing endpoint
          (let [response (mt/user-http-request :crowberto :get 200 endpoint :limit "5" :offset "0")]
            (is (= {:limit 5 :offset 0}
                   (select-keys response [:limit :offset])))))))))

(deftest ^:parallel malformed-limit-is-rejected-test
  (testing "an unparseable `limit` 400s"
    ;; Deliberate behavior change. `parse-paging-params` returns nil when neither value parses as a long,
    ;; so `limit` survives into `:query-params` and hits the check. Previously it was a silent 200 with an
    ;; unpaged list.
    (mt/with-premium-features #{:content-diagnostics}
      (doseq [endpoint endpoints]
        (testing endpoint
          (is (= {:limit "unexpected query parameter"}
                 (:errors (mt/user-http-request :crowberto :get 400 endpoint :limit "abc")))))))))

(deftest ^:parallel union-allowlist-limitation-test
  (testing "a param declared by a sibling endpoint is accepted and silently stripped"
    ;; Pinned limitation, not an oversight: the allowlist is the union over the namespace's endpoints, so
    ;; `/stale` accepts `/slow`'s `min-duration-ms`. Narrowing it per endpoint would need route matching
    ;; the middleware does not do; catching typos is what it is for.
    (mt/with-premium-features #{:content-diagnostics}
      (is (some? (mt/user-http-request :crowberto :get 200 "ee/content-diagnostics/stale"
                                       :min-duration-ms "1000"))))))
