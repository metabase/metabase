(ns metabase.mcp.ui-credential-liveness-test
  "A UI credential lives no longer than the OAuth access token behind the MCP session that minted it. Each iframe
  route looks the token up and refuses the credential once the token is revoked, expired, or no longer bound to
  MCP."
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.ui-test-util :as ui.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- bootstrap-status!
  [auth expected-status]
  (:status (ui.tu/ui-request! auth :get expected-status "embed-mcp/bootstrap")))

(defn- with-credential-for-token
  "`auth` with its credential reminted for the access token `token-id`."
  [{:keys [session-id user-id] :as auth} token-id]
  (assoc auth :credential (mcp.session/issue-ui-credential session-id user-id ui.tu/query-scopes token-id)))

(deftest revoked-token-test
  (testing "revoking the OAuth token refuses the credential on the next request"
    (let [{:keys [token-id] :as auth} (ui.tu/ui-auth! :rasta)]
      (is (= 200 (bootstrap-status! auth 200)) "control: the credential works while its token is live")
      (t2/update! :model/OAuthAccessToken token-id {:revoked_at :%now})
      (is (= 401 (bootstrap-status! auth 401))))))

(deftest expired-token-test
  (testing "a credential whose token has expired is refused, though the credential itself has not"
    (let [auth    (ui.tu/ui-auth! :rasta)
          expired (ui.tu/access-token-id! (:user-id auth) ui.tu/query-scopes
                                          :expiry (.toEpochMilli (.minusSeconds (java.time.Instant/now) 1)))]
      (is (= 401 (bootstrap-status! (with-credential-for-token auth expired) 401))))))

(deftest token-not-bound-to-mcp-test
  (testing "a credential minted from a token that is not bound to the MCP resource is refused"
    (let [auth (ui.tu/ui-auth! :rasta)
          rest-token (ui.tu/access-token-id! (:user-id auth) ui.tu/query-scopes :resource nil)]
      (is (= 401 (bootstrap-status! (with-credential-for-token auth rest-token) 401))))))

(deftest missing-or-unknown-token-test
  (let [auth (ui.tu/ui-auth! :rasta)]
    (testing "a credential carrying no token id is refused"
      (is (= 401 (bootstrap-status! (with-credential-for-token auth nil) 401))))
    (testing "a credential naming a token that does not exist is refused"
      (is (= 401 (bootstrap-status! (with-credential-for-token auth Integer/MAX_VALUE) 401))))
    (testing "a credential naming another user's token is refused"
      (let [crowberto-token (ui.tu/access-token-id! (mt/user->id :crowberto) ui.tu/query-scopes)]
        (is (= 401 (bootstrap-status! (with-credential-for-token auth crowberto-token) 401)))))))

(deftest every-route-checks-the-token-test
  (testing "every iframe route refuses a credential whose token is revoked"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [{:keys [user-id session-id token-id] :as auth} (ui.tu/ui-auth! :rasta)
            handle (mcp.session/store-handle! session-id user-id "ZW5jb2RlZA==")]
        (t2/update! :model/OAuthAccessToken token-id {:revoked_at :%now})
        (doseq [[method url] [[:get "embed-mcp/bootstrap"]
                              [:post "embed-mcp/feedback"]
                              [:post "embed-mcp/drills"]
                              [:get (str "embed-mcp/queries/" handle)]
                              [:post (str "embed-mcp/queries/" handle "/derive")]
                              [:post (str "embed-mcp/queries/" handle "/run")]
                              [:post (str "embed-mcp/queries/" handle "/pivot")]
                              [:post (str "embed-mcp/queries/" handle "/query_metadata")]
                              [:post (str "embed-mcp/queries/" handle "/parameter/remapping")]]]
          (testing (str method " " url)
            (is (= 401 (:status (ui.tu/ui-request! auth method 401 url (when (= :post method) {})))))))))))
