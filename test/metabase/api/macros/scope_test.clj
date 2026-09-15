(ns metabase.api.macros.scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]))

(defn- invoke-handler
  "Invoke an async Ring handler and return the response, with a generous timeout in case things go wrong.
   Note: Clojure promises implement IFn via `deliver`, so they work directly as Ring `respond` callbacks."
  [handler request]
  (let [result (promise)]
    (handler request result identity)
    (let [response (deref result 10000 ::timeout)]
      (is (not= ::timeout response) "Handler did not respond within 10s")
      response)))

(deftest ^:parallel parse-scopes-test
  (testing "nil input returns nil"
    (is (nil? (scope/parse-scopes nil))))
  (testing "empty string returns nil"
    (is (nil? (scope/parse-scopes ""))))
  (testing "blank string returns nil"
    (is (nil? (scope/parse-scopes "   "))))
  (testing "single scope"
    (is (= #{"agent:reports"}
           (scope/parse-scopes "agent:reports"))))
  (testing "multiple scopes"
    (is (= #{"agent:reports" "agent:queries" "read:users"}
           (scope/parse-scopes "agent:reports agent:queries read:users"))))
  (testing "trims whitespace"
    (is (= #{"agent:reports"}
           (scope/parse-scopes "  agent:reports  "))))
  (testing "wildcard scope"
    (is (= #{"*"}
           (scope/parse-scopes "*")))))

(deftest ^:parallel scope-satisfied?-test
  (testing "exact match"
    (is (scope/scope-satisfied? #{"agent:reports"} "agent:reports"))
    (is (not (scope/scope-satisfied? #{"agent:queries"} "agent:reports"))))
  (testing "global wildcard"
    (is (scope/scope-satisfied? #{"*"} "agent:reports"))
    (is (scope/scope-satisfied? #{"*"} "anything")))
  (testing "hierarchical wildcard"
    (is (scope/scope-satisfied? #{"agent:*"} "agent:reports"))
    (is (scope/scope-satisfied? #{"agent:*"} "agent:queries"))
    (is (not (scope/scope-satisfied? #{"agent:*"} "read:users"))))
  (testing "deeper hierarchy"
    (is (scope/scope-satisfied? #{"a:*"} "a:b:c"))
    (is (scope/scope-satisfied? #{"a:b:*"} "a:b:c"))
    (is (not (scope/scope-satisfied? #{"a:b:*"} "a:x:c"))))
  (testing "empty scopes set never satisfies"
    (is (not (scope/scope-satisfied? #{} "agent:reports"))))
  (testing "multiple scopes in set"
    (is (scope/scope-satisfied? #{"read:users" "agent:reports"} "agent:reports"))
    (is (not (scope/scope-satisfied? #{"read:users" "agent:queries"} "agent:reports")))))

(deftest ^:parallel enforce-scope-test
  (let [ok-handler (fn [_request respond _raise]
                     (respond {:status 200 :body "ok"}))
        middleware (scope/enforce-scope "agent:reports")]
    (testing "nil token-scopes (normal session auth) passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (middleware ok-handler) {}))))
    (testing "matching scope passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (middleware ok-handler) {:token-scopes #{"agent:reports"}}))))
    (testing "wildcard scope passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (middleware ok-handler) {:token-scopes #{"agent:*"}}))))
    (testing "insufficient scope returns 403"
      (let [response (invoke-handler (middleware ok-handler) {:token-scopes #{"agent:queries"}})]
        (is (= 403 (:status response)))
        (is (= "unsupported_scope" (get-in response [:body :error])))))
    (testing "empty scopes set returns 403"
      (is (= 403 (:status (invoke-handler (middleware ok-handler) {:token-scopes #{}}))))))
  (testing "sets :token-scopes-checked on the request"
    (let [seen-request (promise)
          spy-handler  (fn [request respond _raise]
                         (deliver seen-request request)
                         (respond {:status 200}))
          middleware   (scope/enforce-scope "agent:reports")]
      (invoke-handler (middleware spy-handler) {:token-scopes #{"agent:reports"}})
      (is (true? (:token-scopes-checked (deref seen-request 1000 ::timeout)))))))

(deftest ^:parallel enforce-scope-defers-to-the-mcp-ui-gate-test
  (let [ok-handler (fn [_request respond _raise]
                     (respond {:status 200 :body "ok"}))
        middleware (scope/enforce-scope "agent:reports")
        invoke     #(invoke-handler (middleware ok-handler) %)]
    (testing "an MCP Apps UI credential already cleared by its own route gate passes a declared scope it
              does not hold — `metabase.mcp.ui-surface/request-surface` is what confines that credential,
              and it is strictly narrower than any endpoint scope"
      (is (= {:status 200 :body "ok"}
             (invoke {:token-scopes #{::scope/mcp-ui} :token-scopes-checked true}))))
    (testing "without the stamp it is refused — the carve-out defers to the gate's decision, it does not
              exempt the credential from having one"
      (is (= 403 (:status (invoke {:token-scopes #{::scope/mcp-ui}}))))
      (is (= 403 (:status (invoke {:token-scopes #{::scope/mcp-ui} :token-scopes-checked false})))))
    (testing "and the carve-out does not leak to ordinary scoped tokens. `enforce-scope` stamps
              `:token-scopes-checked` itself on success, so trusting the stamp alone would make every
              per-endpoint `:scope` a no-op underneath a namespace-level `enforce-scope`"
      (is (= 403 (:status (invoke {:token-scopes #{"agent:queries"} :token-scopes-checked true}))))
      (is (= 403 (:status (invoke {:token-scopes #{} :token-scopes-checked true})))))))

(deftest ^:parallel oauth-request-without-token-scopes-fails-closed-test
  (testing "GHY-4542: nil `:token-scopes` means scope-unaware auth (a session or API key), so both middlewares
            let it through. An OAuth-authenticated request always carries its granted scopes; one that arrives
            without any must be refused, not treated as unrestricted. The auth method the session middleware
            records decides which case it is, not the presence of a bearer header."
    (let [ok-handler (fn [_request respond _raise]
                       (respond {:status 200 :body "ok"}))
          middleware (scope/enforce-scope "agent:reports")]
      (doseq [[label wrapped] {"enforce-scope"         (middleware ok-handler)
                               "ensure-scopes-checked" (scope/ensure-scopes-checked ok-handler)}]
        (testing label
          (doseq [token-scopes [nil #{}]]
            (testing (str "OAuth-authenticated with token-scopes " (pr-str token-scopes) " is refused")
              (let [response (invoke-handler wrapped {:authenticated-via-oauth? true
                                                      :token-scopes             token-scopes})]
                (is (= 403 (:status response)))
                (is (contains? #{"unsupported_scope" "scope_not_permitted"} (get-in response [:body :error])))))
            (testing (str "even when already stamped :token-scopes-checked, with token-scopes " (pr-str token-scopes))
              (is (= 403 (:status (invoke-handler wrapped {:authenticated-via-oauth? true
                                                           :token-scopes             token-scopes
                                                           :token-scopes-checked     true}))))))
          (testing "the same request without the OAuth marker is session or API-key auth and passes"
            (is (= {:status 200 :body "ok"}
                   (invoke-handler wrapped {:token-scopes nil}))))
          (testing "an OAuth request carrying a full-access grant still passes"
            (is (= {:status 200 :body "ok"}
                   (invoke-handler wrapped {:authenticated-via-oauth? true
                                            :token-scopes             #{::scope/unrestricted}})))))))))

(def ^:private rfc-6750-auth-param-value
  "RFC 6750 section 3: the characters allowed inside the quoted `scope` and `error_description` values."
  #"[\x20-\x21\x23-\x5B\x5D-\x7E]*")

(defn- challenge-params
  "The quoted auth-param values of a `Bearer` `WWW-Authenticate` challenge, keyed by name."
  [challenge]
  (into {} (map (fn [[_ k v]] [k v])) (re-seq #"([a-z_]+)=\"([^\"]*)\"" challenge)))

(deftest ^:parallel scope-denial-carries-insufficient-scope-challenge-test
  (testing "GHY-4542: RFC 6750 section 3 requires a resource server to answer a bearer token that does not grant
            access with a `WWW-Authenticate` challenge. `insufficient_scope` tells an OAuth client to re-authorize
            for more scope instead of treating the 403 as final; `scope` names what `enforce-scope` requires, and
            is omitted where the endpoint declares no scope to ask for."
    (let [ok-handler (fn [_request respond _raise]
                       (respond {:status 200 :body "ok"}))
          enforced   ((scope/enforce-scope "agent:reports") ok-handler)
          unchecked  (scope/ensure-scopes-checked ok-handler)]
      (doseq [[label wrapped request expected]
              [["enforce-scope, insufficient scope"
                enforced {:token-scopes #{"agent:queries"}}
                (str "Bearer error=\"insufficient_scope\", scope=\"agent:reports\", "
                     "error_description=\"Insufficient scope for this operation.\"")]
               ["enforce-scope, OAuth request without token-scopes"
                enforced {:authenticated-via-oauth? true}
                (str "Bearer error=\"insufficient_scope\", scope=\"agent:reports\", "
                     "error_description=\"Insufficient scope for this operation.\"")]
               ["ensure-scopes-checked, scoped token on an endpoint without a scope"
                unchecked {:token-scopes #{"agent:reports"}}
                "Bearer error=\"insufficient_scope\", error_description=\"Scoped tokens cannot access this endpoint.\""]
               ["ensure-scopes-checked, OAuth request without token-scopes"
                unchecked {:authenticated-via-oauth? true :token-scopes-checked true}
                "Bearer error=\"insufficient_scope\", error_description=\"Scoped tokens cannot access this endpoint.\""]]]
        (testing label
          (let [response  (invoke-handler wrapped request)
                challenge (get-in response [:headers "WWW-Authenticate"])]
            (is (= 403 (:status response)))
            (is (= expected challenge))
            (is (every? #(re-matches rfc-6750-auth-param-value %) (vals (challenge-params (str challenge))))
                "every auth-param value stays within the RFC 6750 character set")
            (testing "the JSON body is unchanged"
              (is (= "application/json" (get-in response [:headers "Content-Type"])))
              (is (contains? #{"unsupported_scope" "scope_not_permitted"} (get-in response [:body :error]))))))))))

(deftest ^:parallel ensure-scopes-checked-test
  (let [ok-handler (fn [_request respond _raise]
                     (respond {:status 200 :body "ok"}))]
    (testing "nil token-scopes (not in scope context) passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (scope/ensure-scopes-checked ok-handler) {}))))
    (testing "unrestricted token passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (scope/ensure-scopes-checked ok-handler) {:token-scopes #{::scope/unrestricted}}))))
    (testing "wildcard string scope does NOT pass through (must use sentinel)"
      (is (= 403
             (:status (invoke-handler (scope/ensure-scopes-checked ok-handler) {:token-scopes #{"*"}})))))
    (testing "scoped request without prior check is rejected with 403"
      (let [response (invoke-handler (scope/ensure-scopes-checked ok-handler) {:token-scopes #{"agent:reports"}})]
        (is (= 403 (:status response)))
        (is (= "scope_not_permitted" (get-in response [:body :error])))))
    (testing "scoped request with :token-scopes-checked passes through"
      (is (= {:status 200 :body "ok"}
             (invoke-handler (scope/ensure-scopes-checked ok-handler)
                             {:token-scopes #{"agent:reports"} :token-scopes-checked true}))))
    (testing "empty token-scopes set without prior check is rejected"
      (is (= 403
             (:status (invoke-handler (scope/ensure-scopes-checked ok-handler) {:token-scopes #{}})))))))
