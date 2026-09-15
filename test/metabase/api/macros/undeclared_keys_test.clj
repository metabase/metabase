(ns metabase.api.macros.undeclared-keys-test
  "The `:api/undeclared-keys` policy: what an endpoint does with request keys its schema does not declare. `:strip`,
  which drops them silently, is still the default. This namespace opts in at `:reject`, so the endpoints below
  inherit that unless they say otherwise."
  {:api/undeclared-keys :reject}
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.api.macros :as api.macros]
   [metabase.test :as mt]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;;;; endpoints

(api.macros/defendpoint :get "/inherits"
  "Inherits the namespace's `:reject`."
  [_route-params
   {:keys [n]} :- [:map
                   [:n {:optional true} ms/PositiveInt]]]
  {:n n})

(api.macros/defendpoint :get "/overrides-strip"
  "Opts back out to the historical strip behaviour."
  {:api/undeclared-keys :strip}
  [_route-params
   {:keys [n]} :- [:map
                   [:n {:optional true} ms/PositiveInt]]]
  {:n n})

(api.macros/defendpoint :get "/overrides-report"
  "Drops undeclared keys like `:strip`, but counts and logs the request."
  {:api/undeclared-keys :report}
  [_route-params
   {:keys [n]} :- [:map
                   [:n {:optional true} ms/PositiveInt]]]
  {:n n})

(api.macros/defendpoint :post "/binds-nothing"
  "Binds no params, so a strict policy has to supply the empty closed map itself."
  []
  {:ok true})

;;;; helpers

(def ^:private this-ns 'metabase.api.macros.undeclared-keys-test)

(defn- call-endpoint
  "Invoke one of the endpoints above, returning its response, or the relevant `ex-data` of the 400 it threw. Uses the
  3-arity core fn so the response is the handler's own value rather than a rendered Ring response."
  [method route & [query-params body-params]]
  (try
    ((api.macros/find-route-fn this-ns method route) nil query-params body-params)
    (catch clojure.lang.ExceptionInfo e
      (select-keys (ex-data e) [:status-code :errors]))))

(defn- decode
  "[[api.macros/decode-and-validate-params]] on a body, returning the decoded value or the 400's `ex-data`."
  [schema params & [opts]]
  (try
    (api.macros/decode-and-validate-params :body schema params opts)
    (catch clojure.lang.ExceptionInfo e
      (select-keys (ex-data e) [:status-code :errors]))))

;;;; tests

(deftest ^:parallel namespace-policy-applies-to-its-endpoints-test
  (testing "a query key the schema does not declare is a 400 naming it, not a silent drop"
    (is (= {:status-code 400, :errors {:whoops "unexpected key"}}
           (call-endpoint :get "/inherits" {:whoops "x"}))))
  (testing "declared keys still decode and coerce exactly as before"
    (is (= {:n 3}
           (call-endpoint :get "/inherits" {:n "3"}))))
  (testing "a request with nothing to complain about is untouched"
    (is (= {:n nil}
           (call-endpoint :get "/inherits" {})))))

(deftest ^:parallel undeclared-and-invalid-keys-arrive-in-one-response-test
  (testing "an undeclared key and a wrong-typed declared one are both reported, so a caller fixes them in one pass"
    (is (= {:status-code 400
            :errors      {:whoops "unexpected key"
                          :n      "value must be an integer greater than zero."}}
           (call-endpoint :get "/inherits" {:whoops "x", :n "0"})))))

(deftest ^:parallel endpoint-metadata-overrides-the-namespace-policy-test
  (testing ":strip -- the historical behaviour: the undeclared key vanishes and the request succeeds"
    (is (= {:n 3}
           (call-endpoint :get "/overrides-strip" {:whoops "x", :n "3"}))))
  (testing ":report -- the undeclared key is dropped too, but the request is counted and logged"
    (is (= {:n 3}
           (call-endpoint :get "/overrides-report" {:whoops "x", :n "3"}))))
  (testing ":report still fails a request whose declared params are wrong, with the undeclared keys left out of it"
    (is (= {:status-code 400, :errors {:n "value must be an integer greater than zero."}}
           (call-endpoint :get "/overrides-report" {:whoops "x", :n "0"})))))

(deftest ^:parallel unbound-param-slots-are-checked-too-test
  (testing "an endpoint that binds no params still refuses a query key"
    (is (= {:status-code 400, :errors {:whoops "unexpected key"}}
           (call-endpoint :post "/binds-nothing" {:whoops "1"}))))
  (testing "...and a body key"
    (is (= {:status-code 400, :errors {:whoops "unexpected key"}}
           (call-endpoint :post "/binds-nothing" nil {:whoops 1}))))
  (testing "...and succeeds when the caller sends neither"
    (is (= {:ok true}
           (call-endpoint :post "/binds-nothing")))))

(deftest ^:parallel three-arity-still-strips-test
  (testing "the 3-arity is what every endpoint that has not opted in still calls, and it must not change"
    (is (= {:a 1}
           (decode [:map [:a {:optional true} :int]] {:a 1, :b 2})))))

(deftest ^:parallel rejection-recurses-into-nested-maps-test
  (testing "a key undeclared several levels down is caught, the same way stripping reaches it"
    (is (= 400
           (:status-code (decode [:map [:xs [:sequential [:map [:a :int]]]]]
                                 {:xs [{:a 1, :zz 2}]}
                                 {:undeclared-keys :reject}))))))

(deftest ^:parallel explicitly-open-maps-still-pass-everything-through-test
  (testing "`ms/Map` opts out of stripping, so it must opt out of rejection too -- a query or settings bag is meant
           to arrive as it was sent"
    (is (= {:details {:anything 1}, :a 2}
           (decode [:map
                    [:details {:optional true} ms/Map]
                    [:a       {:optional true} :int]]
                   {:details {:anything 1}, :a 2}
                   {:undeclared-keys :reject})))))

(deftest ^:parallel invalid-policy-is-rejected-when-the-endpoint-is-expanded-test
  (testing "a typo in the policy fails loudly at macroexpansion rather than silently doing nothing"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid :api/undeclared-keys policy :nope"
         (#'api.macros/undeclared-keys-policy
          (#'api.macros/parse-args '(:get "/x" {:api/undeclared-keys :nope} [] :ok)))))))

(deftest ^:parallel unknown-policy-is-rejected-at-call-time-test
  (testing "here and in dev, the arg schema refuses a bad policy before the impl sees it"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid input"
         (api.macros/decode-and-validate-params :body [:map] {} {:undeclared-keys :repot}))))
  (testing "that schema is compiled out in prod, so the policy dispatch carries its own default -- which names the
           bad value rather than throwing `No matching clause`"
    (is (= "Invalid :api/undeclared-keys policy :repot: must be :strip, :report, or :reject"
           (ex-message (#'api.macros/invalid-policy-ex :repot {}))))))

(deftest ^:synchronous undeclared-keys-are-counted-test
  (mt/with-prometheus-system! [_ system]
    (letfn [(metric [labels]
              (mt/metric-value system :metabase-api/undeclared-request-keys labels))]
      (testing "a rejected request counts once, as a query rejection"
        (prometheus/clear! :metabase-api/undeclared-request-keys)
        (call-endpoint :get "/inherits" {:whoops "x"})
        (is (prometheus-test/approx= 1 (metric {:param-type "query", :outcome "rejected"})))
        (is (prometheus-test/approx= 0 (metric {:param-type "query", :outcome "dropped"}))))
      (testing "a reported request counts once, as a query drop"
        (prometheus/clear! :metabase-api/undeclared-request-keys)
        (call-endpoint :get "/overrides-report" {:whoops "x"})
        (is (prometheus-test/approx= 1 (metric {:param-type "query", :outcome "dropped"})))
        (is (prometheus-test/approx= 0 (metric {:param-type "query", :outcome "rejected"}))))
      (testing "but a reported request that fails for an unrelated reason was never served, so it is a rejection --
               otherwise a rollout reading `dropped` as `requests we let through` overcounts by the 400 rate"
        (prometheus/clear! :metabase-api/undeclared-request-keys)
        (call-endpoint :get "/overrides-report" {:whoops "x", :n "0"})
        (is (prometheus-test/approx= 1 (metric {:param-type "query", :outcome "rejected"})))
        (is (prometheus-test/approx= 0 (metric {:param-type "query", :outcome "dropped"}))))
      (testing "an undeclared body key is counted against the body, not the query"
        (prometheus/clear! :metabase-api/undeclared-request-keys)
        (call-endpoint :post "/binds-nothing" nil {:whoops 1})
        (is (prometheus-test/approx= 1 (metric {:param-type "body", :outcome "rejected"})))
        (is (prometheus-test/approx= 0 (metric {:param-type "query", :outcome "rejected"}))))
      (testing "a request with no undeclared keys counts nothing at all"
        (prometheus/clear! :metabase-api/undeclared-request-keys)
        (call-endpoint :get "/inherits" {:n "3"})
        (is (prometheus-test/approx= 0 (metric {:param-type "query", :outcome "rejected"})))
        (is (prometheus-test/approx= 0 (metric {:param-type "query", :outcome "dropped"}))))
      (testing "neither does a request that is invalid for some other reason"
        (prometheus/clear! :metabase-api/undeclared-request-keys)
        (call-endpoint :get "/inherits" {:n "0"})
        (is (prometheus-test/approx= 0 (metric {:param-type "query", :outcome "rejected"})))
        (is (prometheus-test/approx= 0 (metric {:param-type "query", :outcome "dropped"})))))))
