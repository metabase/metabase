(ns metabase.oauth-server.revoke-test
  "Revoking a registered OAuth client, observed where its users would notice: the public `/oauth` endpoints and a
  bearer request to the general API. Nothing here reads `revoked_at` to prove a revocation happened — it presents
  the credential and watches it fail.

  The premium endpoints that drive this live in `metabase-enterprise.oauth-client-management`; what is asserted here
  is the OSS primitive and the checks every instance honors, licensed or not (OAuth ADR 0002)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.initialization-status.core :as init-status]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.db :as oauth-server.db]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.test :as mt]
   [oidc-provider.store :as oidc.store]))

(set! *warn-on-reflection* true)

;; The bearer path is gated on initialization being complete (like the session and API-key paths); the isolated test
;; runner never boots the web server, so mark it complete as the bearer-bridge test does.
(init-status/set-complete!)

;; reset-provider! is safe here — it resets a local atom, no global side effects.
(use-fixtures :each (fn [thunk]
                      (oauth-server/reset-provider!)
                      (thunk)
                      (oauth-server/reset-provider!)))

(def ^:private full-access
  "The scope a bearer token needs to reach the general REST API, which is where these tests watch one stop working."
  ["mb:full"])

(defmacro ^:private with-registration-enabled
  "Run `body` with a Site URL and dynamic client registration on, removing the OAuth rows it created afterwards.
  Rows are cleaned up rather than rolled back: a rollback-only transaction cannot be held open across the HTTP
  round-trips the authorization flow makes."
  [& body]
  `(mt/with-temporary-setting-values [site-url                                  "http://localhost:3000"
                                      oauth-server-dynamic-registration-enabled true]
     (mt/with-model-cleanup [:model/OAuthClient :model/OAuthClientEvent :model/OAuthAccessToken
                             :model/OAuthRefreshToken :model/OAuthAuthorizationCode]
       ~@body)))

(defn- revoke!
  "Revoke `client-ids` as crowberto, through the OSS primitive the premium endpoint calls."
  [& client-ids]
  (oauth-server/revoke-clients! (vec client-ids) (mt/user->id :crowberto)))

(defn- authorization-events
  "`GET /api/oauth/authorizations` for `client-id`, optionally narrowed to `event-type`."
  [client-id & {:as params}]
  (apply mt/user-http-request :crowberto :get 200 "oauth/authorizations"
         (mapcat identity (merge {:client-id client-id} params))))

;;; --------------------------------------- Every door a revoked client had -------------------------------------------

(deftest revoked-client-bearer-stops-authenticating-test
  (testing "a bearer token issued to a revoked client no longer authenticates a request"
    (with-registration-enabled
      (let [client (oauth-server.tu/register-client! full-access)
            tokens (oauth-server.tu/grant! :rasta client full-access)]
        (testing "before the revoke the bearer acts as the consenting user"
          (is (= (mt/user->id :rasta)
                 (:id (oauth-server.tu/current-user-with-bearer (:access_token tokens))))))
        (revoke! (:client_id client))
        (testing "afterwards it is refused"
          (oauth-server.tu/current-user-with-bearer (:access_token tokens) :expected-status 401))))))

(deftest revoked-client-cannot-obtain-consent-test
  (testing "a revoked client can no longer put a consent page in front of a user"
    (with-registration-enabled
      (let [client (oauth-server.tu/register-client! full-access)]
        (testing "before the revoke the consent page is served"
          (is (= 200 (:status (oauth-server.tu/consent-page :rasta (:client_id client) full-access)))))
        (revoke! (:client_id client))
        (testing "afterwards the client is unknown to the authorization server"
          (let [response (oauth-server.tu/consent-page :rasta (:client_id client) full-access)]
            (is (= 400 (:status response)))
            (is (= "invalid_request" (:error (:body response))))))))))

(deftest revoked-client-cannot-refresh-test
  (testing "a revoked client cannot trade its refresh token for a new bearer"
    (with-registration-enabled
      ;; refresh tokens rotate, so the one to present after the revoke is the one the *last* refresh handed back —
      ;; presenting the spent one would fail whether or not the client was revoked, and prove nothing
      (let [client    (oauth-server.tu/register-client! full-access)
            refreshed (oauth-server.tu/refresh! client (:refresh_token (oauth-server.tu/grant! :rasta client
                                                                                               full-access)))]
        (testing "before the revoke the refresh token mints a new bearer and a new refresh token"
          (is (string? (:access_token refreshed)))
          (is (string? (:refresh_token refreshed))))
        (revoke! (:client_id client))
        (testing "afterwards the token endpoint refuses the live refresh token"
          ;; the library's own refusal for a client it cannot read, which is what hiding a revoked client buys
          (is (= "invalid_request"
                 (:error (oauth-server.tu/refresh! client (:refresh_token refreshed)
                                                   :expected-status 400)))))))))

(deftest revoked-client-cannot-read-its-registration-test
  (testing "a revoked client cannot read its own registration back (RFC 7592)"
    (with-registration-enabled
      (let [client (oauth-server.tu/register-client! full-access)]
        (testing "before the revoke the registration access token reads it"
          (is (= (:client_id client) (:client_id (oauth-server.tu/read-registration client)))))
        (revoke! (:client_id client))
        (testing "afterwards it is refused"
          (oauth-server.tu/read-registration client :expected-status 401))))))

(defn- mint-access-token!
  "Write an unrevoked, unexpired access token for `user-id` on `client-id` straight into the provider's token store,
  the way the token endpoint does. Returns the token string."
  [user-id client-id]
  (let [token (str (random-uuid))]
    (oidc.store/save-access-token (:token-store (oauth-server/get-provider))
                                  token (str user-id) client-id full-access
                                  (+ (inst-ms (java.util.Date.)) 3600000) nil)
    token))

(deftest revoked-client-fails-closed-on-an-unstamped-token-test
  (testing "a bearer token on a revoked client is refused even when nothing ever stamped the token row itself —
            the resolver fails closed on the client, as it already does for a client that is gone"
    (with-registration-enabled
      (let [client  (oauth-server.tu/register-client! full-access)
            user-id (mt/user->id :rasta)]
        (testing "a token minted this way on an active client does authenticate"
          (is (= user-id (:id (oauth-server.tu/current-user-with-bearer
                               (mint-access-token! user-id (:client_id client)))))))
        (revoke! (:client_id client))
        (testing "the same token, minted after the revoke so the stamp never touched it, is refused"
          (oauth-server.tu/current-user-with-bearer (mint-access-token! user-id (:client_id client))
                                                    :expected-status 401))))))

;;; ------------------------------------------- The record it leaves behind -------------------------------------------

(deftest revoke-is-recorded-in-the-client-event-history-test
  (testing "a revoke joins the client's own event history, stamped with the admin who did it"
    (with-registration-enabled
      (let [client (oauth-server.tu/register-client! full-access)]
        (oauth-server.tu/grant! :rasta client full-access)
        (revoke! (:client_id client))
        (let [events (:data (authorization-events (:client_id client)))]
          (testing "newest first, alongside the registration and the user's approval"
            (is (= ["revoked" "approved" "registered"] (mapv :event_type events))))
          (testing "carrying the revoking admin rather than the consenting user"
            (is (=? {:event_type "revoked"
                     :user_id    (mt/user->id :crowberto)
                     :user_email "crowberto@metabase.com"}
                    (first events)))))
        (testing "`event-type=revoked` narrows the timeline to it"
          (let [response (authorization-events (:client_id client) :event-type "revoked")]
            (is (= 1 (:total response)))
            (is (= ["revoked"] (mapv :event_type (:data response))))))))))

;;; ----------------------------------------------- What it does not do ----------------------------------------------

(deftest revoke-is-all-or-nothing-test
  (testing "a revoke is one transaction: when stamping the tokens fails, no client is left stamped and the grant
            it would have ended still works"
    (with-registration-enabled
      (let [client (oauth-server.tu/register-client! full-access)
            tokens (oauth-server.tu/grant! :rasta client full-access)]
        (mt/with-dynamic-fn-redefs [oauth-server.db/revoke-tokens-for-clients!
                                    (fn [& _] (throw (ex-info "token update failed" {})))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"token update failed"
                                (revoke! (:client_id client)))))
        (testing "the bearer still authenticates"
          (is (= (mt/user->id :rasta)
                 (:id (oauth-server.tu/current-user-with-bearer (:access_token tokens))))))
        (testing "the client can still obtain consent, so its row was not stamped"
          (is (= 200 (:status (oauth-server.tu/consent-page :rasta (:client_id client) full-access)))))
        (testing "and nothing was written to its event history"
          (is (= [] (:data (authorization-events (:client_id client) :event-type "revoked")))))))))

(deftest revoke-leaves-other-grants-alone-test
  (testing "revoking one client ends that client's grants and nothing else"
    (with-registration-enabled
      (let [revoked       (oauth-server.tu/register-client! full-access)
            kept          (oauth-server.tu/register-client! full-access :client_name "Kept Client")
            revoked-token (oauth-server.tu/grant! :rasta revoked full-access)
            kept-token    (oauth-server.tu/grant! :rasta kept full-access)]
        (revoke! (:client_id revoked))
        (testing "the revoked client's bearer is refused"
          (oauth-server.tu/current-user-with-bearer (:access_token revoked-token) :expected-status 401))
        (testing "the same user's bearer on another client still works"
          (is (= (mt/user->id :rasta)
                 (:id (oauth-server.tu/current-user-with-bearer (:access_token kept-token))))))
        (testing "and their own session is untouched"
          (is (= (mt/user->id :rasta) (:id (mt/user-http-request :rasta :get 200 "user/current")))))))))

(deftest revoking-a-revoked-client-adds-no-second-event-test
  (testing "a repeat revoke matches nothing, so the first revocation's record stands alone"
    (with-registration-enabled
      (let [client (oauth-server.tu/register-client! full-access)]
        (oauth-server.tu/grant! :rasta client full-access)
        (is (= 1 (:revoked (revoke! (:client_id client)))))
        (is (= 0 (:revoked (revoke! (:client_id client)))))
        (is (= 1 (:total (authorization-events (:client_id client) :event-type "revoked"))))))))
