(ns metabase.api.macros.scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]))

(defn- invoke-handler
  "Invoke an async Ring handler and return the response, with a generous timeout in case things go wrong."
  [handler request]
  (let [result (promise)]
    (handler request result identity)
    (let [response (deref result 10000 ::timeout)]
      (is (not= ::timeout response) "Handler did not respond within 1000ms")
      response)))

(deftest ^:parallel parse-scopes-test
  (testing "nil input returns nil"
    (is (nil? (scope/parse-scopes nil))))
  (testing "empty string returns nil"
    (is (nil? (scope/parse-scopes ""))))
  (testing "blank string returns nil"
    (is (nil? (scope/parse-scopes "   "))))
  (testing "single scope"
    (is (= #{"agent:workspaces"}
           (scope/parse-scopes "agent:workspaces"))))
  (testing "multiple scopes"
    (is (= #{"agent:workspaces" "agent:queries" "read:users"}
           (scope/parse-scopes "agent:workspaces agent:queries read:users"))))
  (testing "trims whitespace"
    (is (= #{"agent:workspaces"}
           (scope/parse-scopes "  agent:workspaces  "))))
  (testing "wildcard scope"
    (is (= #{"*"}
           (scope/parse-scopes "*")))))

(deftest ^:parallel scope-satisfied?-test
  (testing "exact match"
    (is (scope/scope-satisfied? #{"agent:workspaces"} "agent:workspaces"))
    (is (not (scope/scope-satisfied? #{"agent:queries"} "agent:workspaces"))))
  (testing "global wildcard"
    (is (scope/scope-satisfied? #{"*"} "agent:workspaces"))
    (is (scope/scope-satisfied? #{"*"} "anything")))
  (testing "hierarchical wildcard"
    (is (scope/scope-satisfied? #{"agent:*"} "agent:workspaces"))
    (is (scope/scope-satisfied? #{"agent:*"} "agent:queries"))
    (is (not (scope/scope-satisfied? #{"agent:*"} "read:users"))))
  (testing "deeper hierarchy"
    (is (scope/scope-satisfied? #{"a:*"} "a:b:c"))
    (is (scope/scope-satisfied? #{"a:b:*"} "a:b:c"))
    (is (not (scope/scope-satisfied? #{"a:b:*"} "a:x:c"))))
  (testing "empty scopes set never satisfies"
    (is (not (scope/scope-satisfied? #{} "agent:workspaces"))))
  (testing "multiple scopes in set"
    (is (scope/scope-satisfied? #{"read:users" "agent:workspaces"} "agent:workspaces"))
    (is (not (scope/scope-satisfied? #{"read:users" "agent:queries"} "agent:workspaces")))))

(deftest ^:parallel enforce-scope-test
  (let [ok-handler (fn [_request respond _raise]
                     (respond {:status 200 :body "ok"}))
        middleware (scope/enforce-scope "agent:workspaces")]
    (testing "nil token-scopes (normal session auth) passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (middleware ok-handler) {}))))
    (testing "matching scope passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (middleware ok-handler) {:token-scopes #{"agent:workspaces"}}))))
    (testing "wildcard scope passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (middleware ok-handler) {:token-scopes #{"agent:*"}}))))
    (testing "insufficient scope returns 403"
      (let [response (invoke-handler (middleware ok-handler) {:token-scopes #{"agent:queries"}})]
        (is (= 403 (:status response)))
        (is (= "insufficient_scope" (get-in response [:body :error])))))
    (testing "empty scopes set returns 403"
      (is (= 403 (:status (invoke-handler (middleware ok-handler) {:token-scopes #{}}))))))
  (testing "sets :token-scopes-checked on the request"
    (let [seen-request (promise)
          spy-handler  (fn [request respond _raise]
                         (deliver seen-request request)
                         (respond {:status 200}))
          middleware   (scope/enforce-scope "agent:workspaces")]
      (invoke-handler (middleware spy-handler) {:token-scopes #{"agent:workspaces"}})
      (is (true? (:token-scopes-checked (deref seen-request 1000 ::timeout)))))))

(deftest ^:parallel ensure-scopes-checked-test
  (let [ok-handler (fn [_request respond _raise]
                     (respond {:status 200 :body "ok"}))]
    (testing "nil token-scopes (not in scope context) passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (scope/ensure-scopes-checked ok-handler) {}))))
    (testing "unrestricted token passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (scope/ensure-scopes-checked ok-handler) {:token-scopes #{scope/unrestricted}}))))
    (testing "wildcard string scope does NOT pass through (must use sentinel)"
      (is (= 403
             (:status (invoke-handler (scope/ensure-scopes-checked ok-handler) {:token-scopes #{"*"}})))))
    (testing "scoped request without prior check is rejected with 403"
      (let [response (invoke-handler (scope/ensure-scopes-checked ok-handler) {:token-scopes #{"agent:workspaces"}})]
        (is (= 403 (:status response)))
        (is (= "scope_not_permitted" (get-in response [:body :error])))))
    (testing "scoped request with :token-scopes-checked passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (scope/ensure-scopes-checked ok-handler)
                             {:token-scopes #{"agent:workspaces"} :token-scopes-checked true}))))
    (testing "empty token-scopes set without prior check is rejected"
      (is (= 403
             (:status (invoke-handler (scope/ensure-scopes-checked ok-handler) {:token-scopes #{}})))))))
