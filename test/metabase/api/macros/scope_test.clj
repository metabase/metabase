(ns metabase.api.macros.scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]))

(deftest ^:parallel parse-scopes-test
  (testing "nil input returns nil"
    (is (nil? (scope/parse-scopes nil))))
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
      (let [result (promise)]
        ((middleware ok-handler) {} result identity)
        (is (= {:status 200 :body "ok"} @result))))
    (testing "matching scope passes through"
      (let [result (promise)]
        ((middleware ok-handler) {:token-scopes #{"agent:workspaces"}} result identity)
        (is (= {:status 200 :body "ok"} @result))))
    (testing "wildcard scope passes through"
      (let [result (promise)]
        ((middleware ok-handler) {:token-scopes #{"agent:*"}} result identity)
        (is (= {:status 200 :body "ok"} @result))))
    (testing "insufficient scope returns 403"
      (let [result (promise)]
        ((middleware ok-handler) {:token-scopes #{"agent:queries"}} result identity)
        (is (= 403 (:status @result)))
        (is (= "insufficient_scope" (get-in @result [:body :error])))))
    (testing "empty scopes set returns 403"
      (let [result (promise)]
        ((middleware ok-handler) {:token-scopes #{}} result identity)
        (is (= 403 (:status @result))))))
  (testing "sets :token-scopes-checked on the request"
    (let [seen-request (promise)
          spy-handler  (fn [request respond _raise]
                         (deliver seen-request request)
                         (respond {:status 200}))
          middleware   (scope/enforce-scope "agent:workspaces")]
      ((middleware spy-handler) {:token-scopes #{"agent:workspaces"}} identity identity)
      (is (true? (:token-scopes-checked @seen-request))))))

(deftest ^:parallel ensure-scopes-checked-test
  (let [ok-handler (fn [_request respond _raise]
                     (respond {:status 200 :body "ok"}))]
    (testing "nil token-scopes (normal session auth) passes through"
      (let [result (promise)]
        ((scope/ensure-scopes-checked ok-handler) {} result identity)
        (is (= {:status 200 :body "ok"} @result))))
    (testing "scoped request without prior check is rejected with 403"
      (let [result (promise)]
        ((scope/ensure-scopes-checked ok-handler) {:token-scopes #{"agent:workspaces"}} result identity)
        (is (= 403 (:status @result)))
        (is (= "scope_not_permitted" (get-in @result [:body :error])))))
    (testing "scoped request with :token-scopes-checked passes through"
      (let [result (promise)]
        ((scope/ensure-scopes-checked ok-handler)
         {:token-scopes #{"agent:workspaces"} :token-scopes-checked true}
         result identity)
        (is (= {:status 200 :body "ok"} @result))))
    (testing "empty token-scopes set without prior check is rejected"
      (let [result (promise)]
        ((scope/ensure-scopes-checked ok-handler) {:token-scopes #{}} result identity)
        (is (= 403 (:status @result)))))))
