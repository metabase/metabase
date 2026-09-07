(ns metabase.mcp.ui-surface-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.ui-surface :as mcp.ui-surface]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest off-surface-routes-are-not-authenticated-test
  (testing "GHY-4400: the general REST endpoints the iframe used to reach are off the surface"
    (are [method uri] (not (mcp.ui-surface/on-surface? method uri))
      :get "/api/user/current"
      :get "/api/session/properties"
      :get "/api/collection"
      :put "/api/user/1")))

(deftest request-surface-is-a-reviewed-allowlist-test
  (testing "GHY-4400: every route here is one the credential reaches but the bearer token that minted it could
            NOT — these endpoints declare no `:scope`, so `ensure-scopes-checked` 403s a scoped bearer on all of
            them. That delta is the whole point of the credential, and it is defensible only while this set stays
            small and reviewed. What the ticket removed was the part that was not: `/api/user/current` and
            `/api/session/properties`, which the set had accumulated because the SDK happened to call them.

            Adding a route here is a decision to widen that delta. Changing this test is how you make it."
    (is (= #{[:get  "/api/embed-mcp/bootstrap"]
             [:post "/api/embed-mcp/feedback"]
             [:post "/api/embed-mcp/drills"]
             [:post "/api/dataset"]
             [:post "/api/dataset/pivot"]
             [:post "/api/dataset/query_metadata"]
             [:post "/api/dataset/parameter/remapping"]}
           (set (keys mcp.ui-surface/request-surface))))))

(deftest scope-satisfied?-test
  (let [bootstrap #(mcp.ui-surface/scope-satisfied? :get "/api/embed-mcp/bootstrap" %)
        dataset   #(mcp.ui-surface/scope-satisfied? :post "/api/dataset" %)]
    (testing "a route off the surface is never satisfied"
      (is (nil? (mcp.ui-surface/scope-satisfied?
                 :get "/api/user/current" {:token-scopes #{::scope/unrestricted}}))))
    (testing "a route that costs no scope needs only a valid credential"
      (is (true? (bootstrap {:token-scopes #{}}))))
    (testing "a route that costs a scope needs the minting session to have held it"
      (is (false? (dataset {:token-scopes #{"agent:search"}})))
      (is (true? (dataset {:token-scopes #{"agent:query:run"}})))
      (is (true? (dataset {:token-scopes #{"agent:query:*"}})))
      (is (true? (dataset {:token-scopes #{::scope/unrestricted}}))))
    (testing "a v2 credential minted before the scope claim existed reaches only the free routes"
      (is (true? (bootstrap {})))
      (is (false? (dataset {}))))
    (testing "v1's frozen surface mints claimless credentials by design and keeps its reach"
      (is (true? (dataset {:legacy true}))))))

(defn- request-with-ui-credential
  [method expected-status url credential session-id]
  (client/client-full-response method expected-status url
                               {:request-options {:headers {"x-metabase-mcp-ui-auth" credential
                                                            "mcp-session-id" session-id}}}))

(deftest ui-credential-cannot-read-the-profile-test
  (testing "GHY-4400: `refresh_ui_credential` is not a scope-escalation primitive — the credential cannot read
            the endpoints a narrow agent token is refused"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          credential (mcp.session/issue-ui-credential session-id user-id #{"agent:query:run"})]
      (is (= 401 (:status (request-with-ui-credential
                           :get 401 "user/current" credential session-id))))
      (testing "`/api/session/properties` serves anonymous callers, so dropping it from the surface degrades the
                credential to the public payload rather than refusing it"
        (let [with-credential (:body (request-with-ui-credential
                                      :get 200 "session/properties" credential session-id))
              anonymous       (:body (client/client-full-response :get 200 "session/properties"))
              authenticated   (mt/user-http-request :rasta :get 200 "session/properties")]
          (is (= (set (keys anonymous)) (set (keys with-credential)))
              "the credential buys nothing here")
          (is (seq (remove (set (keys anonymous)) (keys authenticated)))
              "and a logged-in user really does see more, so the assertion above is not vacuous")))
      (is (= 200 (:status (request-with-ui-credential
                           :get 200 "embed-mcp/bootstrap" credential session-id)))
          "the purpose-built endpoint serves what the iframe actually needs"))))

(deftest drills-costs-the-query-scope-test
  (testing "GHY-4400: the scope gate covers the MCP module's own routes, not just the query endpoints"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          post!      (fn [scopes expected-status]
                       (client/client-full-response
                        :post expected-status "embed-mcp/drills"
                        {:request-options
                         {:headers {"x-metabase-mcp-ui-auth" (mcp.session/issue-ui-credential
                                                              session-id user-id scopes)
                                    "mcp-session-id" session-id}}}
                        {:encodedQuery "ZW5jb2RlZA=="}))]
      (is (= 403 (:status (post! #{"agent:search"} 403))))
      (is (= 200 (:status (post! #{"agent:query:run"} 200)))))))

(deftest dataset-routes-cost-the-query-scope-test
  (testing "GHY-4400: a route on the surface is refused unless the minting session's signed scopes cover it"
    (let [user-id    (mt/user->id :crowberto)
          session-id (mcp.session/create! user-id)
          query      (mt/mbql-query venues {:limit 1})
          post!      (fn [credential expected-status]
                       (client/client-full-response
                        :post expected-status "dataset"
                        {:request-options {:headers {"x-metabase-mcp-ui-auth" credential
                                                     "mcp-session-id" session-id}}}
                        query))]
      (is (= 403 (:status (post! (mcp.session/issue-ui-credential session-id user-id #{"agent:search"})
                                 403))))
      (is (= 202 (:status (post! (mcp.session/issue-ui-credential session-id user-id #{"agent:query:run"})
                                 202)))))))
