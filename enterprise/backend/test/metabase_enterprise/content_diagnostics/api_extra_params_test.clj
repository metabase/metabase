(ns metabase-enterprise.content-diagnostics.api-extra-params-test
  "Undeclared query and body params are rejected rather than silently stripped. `defendpoint` decodes
  before it validates, so without the namespace's `+reject-undeclared-params` middleware a typo like
  `sort-colum` is dropped and the caller gets a 200 with unsorted results. The audience gate lives in
  `api-test`; this suite only exercises param handling, always as an authorized caller."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.api :as cd.api]
   [metabase.test :as mt]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io ByteArrayInputStream)))

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

(deftest ^:parallel undeclared-body-param-is-rejected-test
  (testing "a body param 400s: no endpoint here declares a body, so its body allowlist is empty"
    ;; These are GETs, but the stack parses a JSON body on any method, so the body arm is reachable
    ;; end-to-end. `+auth` and the audience gate both run outside this check, so a 400 here means the
    ;; caller got past them.
    (mt/with-premium-features #{:content-diagnostics}
      (doseq [endpoint endpoints]
        (testing endpoint
          (is (= {:whoops "unexpected body parameter"}
                 (:errors (mt/user-http-request :crowberto :get 400 endpoint {:whoops 1}))))))))
  (testing "query and body params are reported together"
    (mt/with-premium-features #{:content-diagnostics}
      (is (= {:oops   "unexpected query parameter"
              :whoops "unexpected body parameter"}
             (:errors (mt/user-http-request :crowberto :get 400 "ee/content-diagnostics/stale"
                                            {:whoops 1} :oops "1"))))))
  (testing "a key undeclared in both places is reported once, as the body's"
    ;; `merge` puts the body errors last, so they win. Pinned because nothing else states which source
    ;; arbitrates, and a later reordering would drop the query occurrence silently.
    (mt/with-premium-features #{:content-diagnostics}
      (is (= {:whoops "unexpected body parameter"}
             (:errors (mt/user-http-request :crowberto :get 400 "ee/content-diagnostics/stale"
                                            {:whoops 1} :whoops "1"))))))
  (testing "an empty body carries no params and is accepted"
    (mt/with-premium-features #{:content-diagnostics}
      (is (some? (mt/user-http-request :crowberto :get 200 "ee/content-diagnostics/stale" {}))))))

;;; ---------------------------------------------- unit coverage ----------------------------------------
;;; The route matcher and the body extractor, exercised directly against synthetic requests.

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
          (is (contains? (:query spec) (name param)))
          (testing "no endpoint here declares a body, so its body schema is the closed-empty fallback"
            (is (= [:map] (:body spec))))))))
  (testing "`:compojure/path` wins over `:path-info` when set, as in `api.macros/find-matching-handler`"
    (is (contains? (:query (#'cd.api/matching-endpoint {:request-method :get
                                                        :path-info      "/stale"
                                                        :compojure/path "/slow"}))
                   "min-duration-ms")))
  (testing "an unmatched path returns nil, so the request passes through unchecked to the router's 404"
    (is (nil? (#'cd.api/matching-endpoint {:request-method :get, :path-info "/nope"}))))
  (testing "the method has to match too"
    (is (nil? (#'cd.api/matching-endpoint {:request-method :post, :path-info "/stale"})))))

(deftest ^:parallel body-params-test
  (testing "a parsed JSON body map is already keywordized"
    (is (= {:a 1, :b 2} (#'cd.api/body-params {:body {:a 1, :b 2}}))))
  (testing "form params win over the body and are keywordized, mirroring `api.macros/request-body`"
    (is (= {:form 1} (#'cd.api/body-params {:form-params {"form" 1}, :body {:json 2}}))))
  (testing "empty form params fall through to the body"
    (is (= {:json 2} (#'cd.api/body-params {:form-params {}, :body {:json 2}}))))
  (testing "an unparsed InputStream body is not a param map"
    (with-open [body (ByteArrayInputStream. (.getBytes "{\"a\":1}" "UTF-8"))]
      (is (nil? (#'cd.api/body-params {:body body})))))
  (testing "a JSON array body is not a param map"
    (is (nil? (#'cd.api/body-params {:body [{:a 1}]}))))
  (testing "no body at all"
    (is (nil? (#'cd.api/body-params {})))))

(deftest ^:parallel undeclared-query-params-test
  (testing "the query param keys `declared` does not contain"
    (is (= {:c "unexpected query parameter"}
           (#'cd.api/undeclared-query-params #{"a" "b"} ["a" "c"]))))
  (testing "nothing undeclared"
    (is (= {} (#'cd.api/undeclared-query-params #{"a"} ["a"])))
    (is (= {} (#'cd.api/undeclared-query-params #{"a"} nil)))))

;;; ------------------------------------------ nested body checking -------------------------------------
;;; No endpoint in this namespace declares a body schema, so every case below is unit-level, against
;;; synthetic schemas. The end-to-end body coverage above only exercises the no-declared-body-schema
;;; fallback (`[:map]`, which rejects every key).

(def ^:private nested-schema
  [:map
   [:a :int]
   [:xs [:sequential [:map
                      [:b :int]
                      [:deep [:map [:c :int]]]]]]])

(deftest ^:parallel undeclared-body-keys-test
  (testing "a top-level undeclared key"
    (is (= {:zz "unexpected body parameter"}
           (#'cd.api/undeclared-body-keys nested-schema {:a 1, :zz 2, :xs []}))))
  (testing "an undeclared key inside a sequence element is reported at its path, index dropped"
    (is (= {:xs {:zz "unexpected body parameter"}}
           (#'cd.api/undeclared-body-keys nested-schema {:a 1, :xs [{:b 1, :zz 2, :deep {:c 1}}]}))))
  (testing "an undeclared key several levels down"
    (is (= {:xs {:deep {:zz "unexpected body parameter"}}}
           (#'cd.api/undeclared-body-keys nested-schema
                                          {:a 1, :xs [{:b 1, :deep {:c 1, :zz 2}}]}))))
  (testing "a fully declared body has no errors"
    (is (= {} (#'cd.api/undeclared-body-keys nested-schema
                                             {:a 1, :xs [{:b 1, :deep {:c 1}}]}))))
  (testing "a wrong-typed declared value is left to the endpoint's own validation, not rejected here"
    ;; Only `:malli.core/extra-key` errors are kept; everything else passes through so `defendpoint`
    ;; produces its normal 400 in its normal shape.
    (is (= {} (#'cd.api/undeclared-body-keys nested-schema {:a "not-an-int", :xs []}))))
  (testing "an explicitly open sub-map passes an arbitrary bag of keys through"
    ;; `mut/closed-schema` leaves `{:closed false}` maps alone, which is how `ms/Map` opts out.
    (is (= {} (#'cd.api/undeclared-body-keys
               [:map [:a :int] [:settings ms/Map]]
               {:a 1, :settings {:anything 1, :at-all 2}}))))
  (testing "no declared body schema means every key is undeclared, and an empty body is fine"
    (is (= {:zz "unexpected body parameter"} (#'cd.api/undeclared-body-keys [:map] {:zz 1})))
    (is (= {} (#'cd.api/undeclared-body-keys [:map] {}))))
  (testing "a declared key survives the lenient decode rather than being reported as undeclared"
    ;; The decode step keeps undeclared keys but must still recognize declared ones; a string "1" for an
    ;; `:int` is decoded, not flagged.
    (is (= {} (#'cd.api/undeclared-body-keys [:map [:a :int]] {:a "1"})))))
