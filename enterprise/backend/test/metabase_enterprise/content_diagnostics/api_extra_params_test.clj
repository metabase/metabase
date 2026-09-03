(ns metabase-enterprise.content-diagnostics.api-extra-params-test
  "Undeclared query params are rejected rather than silently stripped. `defendpoint` decodes
  before it validates, so without the namespace's `+reject-undeclared-params` middleware a typo like
  `sort-colum` is dropped and the caller gets a 200 with unsorted results. The audience gate lives in
  `api-test`; this suite only exercises param handling, always as an authorized caller."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.api :as cd.api]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private own-filter-param
  "Each endpoint's own filter param. Every one of them is undeclared on the other three, which is what
  makes the per-endpoint allowlist observable from outside."
  {"ee/content-diagnostics/stale"      [:threshold-days      "30"]
   "ee/content-diagnostics/slow"       [:min-duration-ms     "1000"]
   "ee/content-diagnostics/duplicated" [:min-duplicate-count "2"]
   "ee/content-diagnostics/imbalanced" [:finding-types       "empty"]})

(def ^:private endpoints
  "Derived from [[own-filter-param]] so a fifth endpoint cannot be added to one and forgotten in the other."
  (vec (keys own-filter-param)))

;;; ------------------------------------------- end-to-end behavior -------------------------------------

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

(deftest ^:parallel sibling-endpoint-param-is-rejected-test
  (testing "a filter param belonging to a sibling endpoint 400s on the endpoints that do not declare it"
    ;; This is also the permanent guard against the middleware silently failing open. It can only pass if
    ;; `matching-endpoint` actually resolved a route: if Clout matching broke, nothing would match, every
    ;; request would pass through unchecked, and every assertion here would see a 200 instead.
    (mt/with-premium-features #{:content-diagnostics}
      (doseq [[owner [param value]] own-filter-param
              endpoint              (keys own-filter-param)
              :when                 (not= endpoint owner)]
        (testing (str endpoint " rejects " param ", which only " owner " declares")
          (is (= {param "unexpected query parameter"}
                 (:errors (mt/user-http-request :crowberto :get 400 endpoint param value)))))))))

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
      (doseq [[endpoint [param value]] own-filter-param]
        (testing (str endpoint " " param)
          (is (some? (mt/user-http-request :crowberto :get 200 endpoint param value))))))))

(deftest ^:parallel well-formed-paging-params-are-accepted-test
  (testing "`limit`/`offset` answer 200 and are echoed back"
    ;; They are in no allowlist. `handle-paging` strips them from `:query-params` before the check runs,
    ;; which is exactly why they get through -- pin that rather than assume it.
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

;;; ---------------------------------------------- unit coverage ----------------------------------------
;;; The route matcher, exercised directly against synthetic requests.

(deftest ^:parallel declared-query-param-names-test
  (testing "the top-level declared keys, as strings"
    (is (= #{"a" "b"}
           (#'cd.api/declared-query-param-names [:map [:a :int] [:b {:optional true} :string]]))))
  (testing "a nil schema yields an empty allowlist, so every query param is undeclared"
    (is (= #{} (#'cd.api/declared-query-param-names nil)))))

(deftest ^:parallel matching-endpoint-test
  (testing "matches on the `:path-info` compojure's `context` sets, and carries that route's allowlist"
    (doseq [[endpoint [param _value]] own-filter-param
            :let                      [path (str "/" (last (str/split endpoint #"/")))]]
      (testing path
        (let [spec (#'cd.api/matching-endpoint {:request-method :get, :path-info path})]
          (is (contains? (:query spec) (name param)))))))
  (testing "`:compojure/path` wins over `:path-info` when set, as in `api.macros/find-matching-handler`"
    (is (contains? (:query (#'cd.api/matching-endpoint {:request-method :get
                                                        :path-info      "/stale"
                                                        :compojure/path "/slow"}))
                   "min-duration-ms")))
  (testing "an unmatched path returns nil, so the request passes through unchecked to the router's 404"
    (is (nil? (#'cd.api/matching-endpoint {:request-method :get, :path-info "/nope"}))))
  (testing "the method has to match too"
    (is (nil? (#'cd.api/matching-endpoint {:request-method :post, :path-info "/stale"})))))

(deftest ^:parallel undeclared-query-params-test
  (testing "the query param keys `declared` does not contain"
    (is (= {:c "unexpected query parameter"}
           (#'cd.api/undeclared-query-params #{"a" "b"} ["a" "c"]))))
  (testing "nothing undeclared"
    (is (= {} (#'cd.api/undeclared-query-params #{"a"} ["a"])))
    (is (= {} (#'cd.api/undeclared-query-params #{"a"} nil)))))
