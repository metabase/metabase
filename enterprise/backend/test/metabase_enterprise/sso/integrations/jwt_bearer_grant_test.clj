(ns metabase-enterprise.sso.integrations.jwt-bearer-grant-test
  (:require
   [buddy.sign.jwt :as jwt]
   [buddy.sign.util :as buddy-util]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.mcp.test-util :as mcp.tu]
   [metabase-enterprise.sso.test-setup :as sso.test-setup]
   [metabase.config.core :as config]
   [metabase.mcp.core :as mcp]
   [metabase.mcp.v2.test-util]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [oidc-provider.util :as oidc-util]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(defmacro ^:private with-jwt-bearer-setup!
  "Run `body` with JWT authentication set up, deleting the tokens and audit rows it creates."
  [& body]
  `(sso.test-setup/with-jwt-default-setup!
     (mt/with-model-cleanup [:model/OAuthAccessToken :model/AuditLog]
       ~@body)))

(defn- assertion
  "Return a JWT carrying `claims`, signed with the JWT authentication secret.

  Unless `claims` says otherwise, it's issued now and expires in a minute."
  [claims]
  (let [now (buddy-util/now)]
    (jwt/sign (merge {:iat now, :exp (+ now 60)} claims) sso.test-setup/default-jwt-secret)))

(defn- token-response
  "POST a JWT bearer grant request with `params` to the token endpoint and return the response.

  The response must have `status`."
  [status params]
  (binding [client/*url-prefix* ""]
    (client/client-full-response :post status "oauth/token"
                                 {:request-options {:headers {"content-type" "application/x-www-form-urlencoded"}}}
                                 (merge {:grant_type "urn:ietf:params:oauth:grant-type:jwt-bearer"} params))))

(defn- token!
  "Exchange a JWT naming `email` for a token, with the extra request `params`, and return the token response."
  [email & {:as params}]
  (:body (token-response 200 (merge {:assertion (assertion {:email email})} params))))

(defn- mcp-request
  "Send the JSON-RPC `method` with `params` to the MCP endpoint and return the response.

  Use the bearer `access-token` and, if non-nil, the MCP session `session-id`.
  The response must have `status`."
  [status access-token session-id method params]
  (client/client-full-response :post status "metabase-mcp"
                               {:request-options {:headers (cond-> {"authorization" (str "Bearer " access-token)}
                                                             session-id (assoc "mcp-session-id" session-id))}}
                               {:jsonrpc "2.0" :id 1 :method method :params params}))

(defn- mcp-session
  "Open an MCP session with the bearer `access-token` and return its ID."
  [access-token]
  (get-in (mcp-request 200 access-token nil "initialize" {:capabilities {}}) [:headers "Mcp-Session-Id"]))

(defn- mcp-url []
  (str (system/site-url) "/api/metabase-mcp"))

(defn- discovered-grant-types []
  (binding [client/*url-prefix* ""]
    (:grant_types_supported (client/client :get 200 ".well-known/oauth-authorization-server"))))

(deftest exchange-test
  (testing "the exchange returns an MCP token and provisions the user named in the JWT as JWT login does"
    (with-jwt-bearer-setup!
      (let [response (token-response 200 {:assertion (assertion {:email      "jwt-bearer@metabase.com"
                                                                 :first_name "Jay"
                                                                 :last_name  "Bird"
                                                                 :plan       "pro"})})
            user     (t2/select-one [:model/User :id :type :first_name :last_name :sso_source :jwt_attributes]
                                    :email "jwt-bearer@metabase.com")]
        (testing "every MCP scope, for an hour, bound to the MCP endpoint, with no refresh token"
          (is (= {:token_type "Bearer"
                  :expires_in 3600
                  :scope      (str/join " " (mcp/v2-scopes))
                  :resource   [(mcp-url)]}
                 (dissoc (:body response) :access_token)))
          (is (= "no-store" (get-in response [:headers "Cache-Control"]))))
        (testing "a personal user with the JWT's names and attributes"
          (is (=? {:type           :personal
                   :first_name     "Jay"
                   :last_name      "Bird"
                   :sso_source     :jwt
                   :jwt_attributes {"plan" "pro"}}
                  user)))
        (testing "the stored token belongs to that user and the built-in client"
          (is (=? {:user_id   (:id user)
                   :client_id "metabase-jwt-bearer"
                   :scope     (mcp/v2-scopes)
                   :resource  [(mcp-url)]}
                  (t2/select-one :model/OAuthAccessToken
                                 :token (oidc-util/hash-token (get-in response [:body :access_token]))))))
        (testing "no session and no login history"
          (is (not (t2/exists? :model/Session :user_id (:id user))))
          (is (not (t2/exists? :model/LoginHistory :user_id (:id user)))))))))

(deftest exchange-group-sync-test
  (testing "the exchange syncs the user's groups from the JWT, as JWT login does"
    (with-jwt-bearer-setup!
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "jwt-bearer-group"}]
        (mt/with-temporary-setting-values [jwt-group-sync       true
                                           jwt-group-mappings   {"analysts" [group-id]}
                                           jwt-attribute-groups "groups"]
          (let [email "jwt-bearer-groups@metabase.com"]
            (token-response 200 {:assertion (assertion {:email email, :groups ["analysts"]})})
            (is (t2/exists? :model/PermissionsGroupMembership
                            :user_id (t2/select-one-pk :model/User :email email), :group_id group-id))))))))

(deftest exchange-scope-test
  (with-jwt-bearer-setup!
    (let [email "jwt-bearer-scope@metabase.com"]
      (testing "the token carries the requested scopes, each once, in the order requested"
        (let [{:keys [access_token scope]} (token! email :scope "agent:query:run agent:sql:run agent:query:run")]
          (is (= "agent:query:run agent:sql:run" scope))
          (testing "and MCP refuses a tool that needs another scope"
            (is (re-find #"Requires \"agent:content:read\""
                         (get-in (mcp-request 403 access_token (mcp-session access_token)
                                              "tools/call" {:name "test_echo" :arguments {}})
                                 [:body :error :message]))))))
      (testing "both MCP paths are accepted as resources and bind the token to the canonical endpoint"
        (doseq [resource [(mcp-url) (str (mcp-url) "/") (str (system/site-url) "/api/mcp")]]
          (testing resource
            (is (= [(mcp-url)] (:resource (token! email :resource resource))))))))))

(deftest exchange-provisioning-test
  (with-jwt-bearer-setup!
    (let [email   "jwt-bearer-provisioning@metabase.com"
          refused (fn []
                    (mt/with-temporary-setting-values [jwt-user-provisioning-enabled? false]
                      (:body (token-response 400 {:assertion (assertion {:email email})}))))]
      (testing "a JWT for an unknown user is refused without provisioning when provisioning is off"
        (is (=? {:error "invalid_grant"} (refused)))
        (is (not (t2/exists? :model/User :email email))))
      (token! email)
      (let [user-id (t2/select-one-pk :model/User :email email)]
        (testing "an existing user gets a token with provisioning off"
          (mt/with-temporary-setting-values [jwt-user-provisioning-enabled? false]
            (is (=? {:access_token string?} (token! email)))))
        (t2/update! :model/User user-id {:is_active false})
        (testing "a deactivated user is refused with provisioning off, and reactivated with it on"
          (is (=? {:error "invalid_grant"} (refused)))
          (is (=? {:access_token string?} (token! email)))
          (is (true? (t2/select-one-fn :is_active :model/User user-id))))))))

(deftest exchange-non-personal-user-test
  (testing "a JWT naming an API key's user or the internal user is refused, and leaves that user as it was"
    (with-jwt-bearer-setup!
      (mt/with-model-cleanup [:model/ApiKey]
        (let [api-key  (mt/user-http-request :crowberto :post 200 "api-key"
                                             {:name     (mt/random-name)
                                              :group_id (t2/select-one-pk :model/PermissionsGroup :name "All Users")})
              key-user (:body (client/client-full-response :get 200 "user/current"
                                                           {:request-options {:headers {"x-api-key"
                                                                                        (:unmasked_key api-key)}}}))
              state    (fn [user-id]
                         [(t2/select-one :core_user :id user-id)
                          (t2/select :auth_identity :user_id user-id {:order-by [:id]})])]
          (doseq [{:keys [id email]} [key-user
                                      (t2/select-one [:model/User :id :email] :id config/internal-mb-user-id)]]
            (testing email
              (let [before (state id)]
                (is (=? {:error "invalid_grant"}
                        (:body (token-response 400 {:assertion (assertion {:email      email
                                                                           :first_name "Mallard"
                                                                           :last_name  "Duck"
                                                                           :plan       "pro"})}))))
                (is (= before (state id)))
                (is (not (t2/exists? :model/OAuthAccessToken :user_id id)))))))))))

(deftest exchange-refusal-test
  (with-jwt-bearer-setup!
    (let [email  "jwt-bearer-refused@metabase.com"
          signed (assertion {:email email})]
      (doseq [[description error params]
              [["no assertion"           "invalid_request" {}]
               ["the wrong secret"       "invalid_grant"   {:assertion (jwt/sign {:email email} "not-the-secret")}]
               ["an algorithm not HS256" "invalid_grant"   {:assertion (jwt/sign {:email email}
                                                                                 sso.test-setup/default-jwt-secret
                                                                                 {:alg :hs512})}]
               ["a stale iat"            "invalid_grant"   {:assertion (assertion {:email email
                                                                                   :iat   (- (buddy-util/now) 300)})}]
               ["an expired exp"         "invalid_grant"   {:assertion (assertion {:email email
                                                                                   :exp   (- (buddy-util/now) 60)})}]
               ["no email claim"         "invalid_grant"   {:assertion (assertion {:first_name "Jay"})}]
               ["mb:full"                "invalid_scope"   {:assertion signed, :scope "mb:full"}]
               ["an unknown scope"       "invalid_scope"   {:assertion signed, :scope "agent:query:run agent:all"}]
               ["an empty scope"         "invalid_scope"   {:assertion signed, :scope ""}]
               ["a whitespace scope"     "invalid_scope"   {:assertion signed, :scope "   "}]
               ["another resource"       "invalid_target"  {:assertion signed, :resource "https://example.com/api/mcp"}]
               ["a malformed resource"   "invalid_target"  {:assertion signed, :resource "not a uri"}]]]
        (testing description
          (is (=? {:error error, :error_description string?}
                  (:body (token-response 400 params))))))
      (testing "refused requests don't provision the user or issue a token"
        (is (not (t2/exists? :model/User :email email)))
        (is (not (t2/exists? :model/OAuthAccessToken :client_id "metabase-jwt-bearer")))))))

(deftest exchange-assertion-times-test
  (with-jwt-bearer-setup!
    (let [email "jwt-bearer-times@metabase.com"
          now   (buddy-util/now)
          sign  #(jwt/sign (assoc % :email email) sso.test-setup/default-jwt-secret)]
      (doseq [[description claims error-description]
              [["no exp"               {:iat now}                           "The JWT must have exp and iat claims."]
               ["no iat"               {:exp (+ now 60)}                    "The JWT must have exp and iat claims."]
               ["an iat in the future" {:iat (+ now 120), :exp (+ now 180)} "The JWT has an iat claim in the future."]]]
        (testing (str "an assertion with " description " is refused without provisioning anyone")
          (is (= {:error "invalid_grant", :error_description error-description}
                 (:body (token-response 400 {:assertion (sign claims)}))))
          (is (not (t2/exists? :model/User :email email)))))
      (testing "an iat less than a minute ahead of Metabase's clock is accepted"
        (is (=? {:access_token string?}
                (:body (token-response 200 {:assertion (sign {:iat (+ now 30), :exp (+ now 90)})}))))))))

(deftest exchange-refusal-reason-test
  (testing "a refused login tells the caller why in `error_description`"
    (with-jwt-bearer-setup!
      (is (=? {:error "invalid_grant", :error_description "This login is only for personal accounts."}
              (:body (token-response 400 {:assertion (assertion {:email (t2/select-one-fn :email :model/User
                                                                                          :id config/internal-mb-user-id)})})))))))

(deftest exchange-refusal-withheld-reason-test
  (with-jwt-bearer-setup!
    (let [email   "jwt-bearer-withheld@metabase.com"
          refusal (fn [claims]
                    (:body (token-response 400 {:assertion (assertion (assoc claims :email email))})))]
      (testing "a JWT that fails verification gets a fixed description instead of the verifier's message"
        (is (= {:error "invalid_grant", :error_description "The JWT could not be verified."}
               (refusal {:exp (- (buddy-util/now) 60)}))))
      (testing "an error message not written by Metabase gets the generic description without database details"
        (is (= {:error "invalid_grant", :error_description "The token request is invalid."}
               (refusal {:first_name (apply str (repeat 255 "x"))})))))))

(deftest discovery-test
  (testing "discovery lists the grant while the token endpoint accepts it"
    (with-jwt-bearer-setup!
      (is (= ["authorization_code" "refresh_token" "urn:ietf:params:oauth:grant-type:jwt-bearer"]
             (discovered-grant-types))))))

(deftest exchange-unsupported-test
  (with-jwt-bearer-setup!
    (let [email   "jwt-bearer-unsupported@metabase.com"
          refused (fn []
                    (is (=? {:error "unsupported_grant_type"}
                            (:body (token-response 400 {:assertion (assertion {:email email})}))))
                    (is (not (t2/exists? :model/User :email email)))
                    (is (not (t2/exists? :model/OAuthAccessToken :client_id "metabase-jwt-bearer")))
                    (is (not (t2/exists? :model/AuditLog :topic "mcp-jwt-token-issued")))
                    (is (= ["authorization_code" "refresh_token"] (discovered-grant-types))))]
      (testing "without the sso-jwt feature"
        (mt/with-premium-features #{}
          (refused)))
      (testing "with JWT authentication off"
        (mt/with-temporary-setting-values [jwt-enabled false]
          (refused)))
      (testing "with the MCP server off"
        (mt/with-temporary-setting-values [mcp-enabled? false]
          (refused))))))

(deftest exchange-mcp-group-access-test
  (with-jwt-bearer-setup!
    (mcp.tu/with-group-level-mode
      (mt/with-temp [:model/PermissionsGroup   {group-id :id} {:name "jwt-bearer-mcp-group"}
                     :model/McpGroupPermission _              {:group_id group-id, :mcp_enabled true, :tool_access {}}]
        (mt/with-temporary-setting-values [jwt-group-sync     true
                                           jwt-group-mappings {"agents" [group-id]}]
          (let [email "jwt-bearer-mcp-groups@metabase.com"]
            (testing "a user whose groups don't allow MCP is refused, and gets an account but no token or audit row"
              (is (= {:error             "unsupported_grant_type"
                      :error_description "MCP access is not enabled for this user's groups."}
                     (:body (token-response 400 {:assertion (assertion {:email email})}))))
              (let [user-id (t2/select-one-pk :model/User :email email)]
                (is (some? user-id))
                (is (not (t2/exists? :model/OAuthAccessToken :user_id user-id)))
                (is (not (t2/exists? :model/AuditLog :topic "mcp-jwt-token-issued" :user_id user-id)))))
            (testing "once the JWT syncs the user into a group that allows MCP, they get a token that MCP accepts"
              (let [{:keys [access_token]} (:body (token-response 200 {:assertion (assertion {:email  email
                                                                                              :groups ["agents"]})}))]
                (is (some? (mcp-session access_token)))))))))))

(deftest token-drives-mcp-test
  (testing "MCP calls run as the user named in the JWT, and usage and audit rows belong to that user"
    (with-jwt-bearer-setup!
      (let [{:keys [access_token scope]} (token! "jwt-bearer-mcp@metabase.com")
            user-id    (t2/select-one-pk :model/User :email "jwt-bearer-mcp@metabase.com")
            session-id (mcp-session access_token)]
        (is (= {:ok true :message "pong"}
               (get-in (mcp-request 200 access_token session-id "tools/call" {:name "test_echo" :arguments {}})
                       [:body :result :structuredContent])))
        (is (= user-id (t2/select-one-fn :user_id :model/McpSessionLog :id session-id)))
        (is (=? [{:tool_name "test_echo" :status "success"}]
                (t2/select :model/McpToolCallLog :user_id user-id)))
        (is (=? {:user_id user-id :details {:scope scope}}
                (mt/latest-audit-log-entry :mcp-jwt-token-issued)))))))

(deftest token-reach-test
  (with-jwt-bearer-setup!
    (let [email        "jwt-bearer-reach@metabase.com"
          access-token (:access_token (token! email))]
      (testing "the REST API refuses the token"
        (is (= 403 (:status (client/client-full-response :get "user/current"
                                                         {:request-options {:headers {"authorization"
                                                                                      (str "Bearer " access-token)}}})))))
      (testing "deactivating the user revokes the token"
        (is (some? (mcp-session access-token)))
        (t2/update! :model/User (t2/select-one-pk :model/User :email email) {:is_active false})
        (is (=? {:error {:message "Invalid bearer token"}}
                (:body (mcp-request 401 access-token nil "initialize" {:capabilities {}}))))))))
