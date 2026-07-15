(ns metabase.session.api
  "/api/session endpoints"
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.channel.email.messages :as messages]
   [metabase.channel.settings :as channel.settings]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.request.core :as request]
   [metabase.session.challenge :as session.challenge]
   [metabase.session.models.session :as session]
   [metabase.session.schema :as session.schema]
   [metabase.settings.core :as setting]
   [metabase.sso.core :as sso]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.password :as u.password]
   [throttle.core :as throttle]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ## API Endpoints

(def ^:private throttling-disabled? (config/config-bool :mb-disable-session-throttle))

(def ^:private login-throttlers
  {:username   (throttle/make-throttler :username)
   ;; IP Address doesn't have an actual UI field so just show error by username
   :ip-address (throttle/make-throttler :username, :attempts-threshold 50)})

(def ^:private verify-throttlers
  ;; Codes are 6 digits, so brute-force limits are load-bearing. Only failures count (see
  ;; `call-with-failure-throttling` below), so 5 wrong codes per user per hour, not 5 logins.
  {:user-id    (throttle/make-throttler :user-id, :attempts-threshold 5)
   :ip-address (throttle/make-throttler :ip-address, :attempts-threshold 50)})

(def ^:private email-otp-send-throttlers
  ;; sending is expensive and spammable — every send counts, much tighter than verification
  {:user-id    (throttle/make-throttler :user-id, :attempts-threshold 3)
   :ip-address (throttle/make-throttler :ip-address, :attempts-threshold 20)})

(defn- call-with-failure-throttling
  "Run `f` guarded by `pairs` of `[throttler throttle-key]`. Only a thrown exception counts as an
  attempt; successful calls are free. No-op when `MB_DISABLE_SESSION_THROTTLE` is set.
  The MFA management endpoints have their own throttling helpers (`mfa.throttling`); the two are
  kept separate deliberately — this one lives in OSS session code, that one in the EE module."
  [pairs f]
  (if throttling-disabled?
    (f)
    (try
      ((reduce (fn [g [thr key]]
                 (fn [] (throttle/do-with-throttling thr key g)))
               f
               pairs))
      (catch clojure.lang.ExceptionInfo e
        ;; `throttle/do-with-throttling`'s over-the-limit exception carries `:errors` but no
        ;; `:status-code` (unlike `throttle/check`'s), which would surface as a 500
        (let [data (ex-data e)]
          (if (and (:errors data) (nil? (:status-code data)))
            (throw (ex-info (ex-message e) (assoc data :status-code 400) e))
            (throw e)))))))

(def ^:private password-fail-message (deferred-tru "Password did not match stored password."))
(def ^:private password-fail-snippet (deferred-tru "did not match stored password"))

(mu/defn- ldap-login :- [:maybe [:or session.schema/SessionSchema [:map [:mfa/pending? [:= true]]]]]
  "If LDAP is enabled and a matching user exists return a new Session for them (or an MFA-pending
  result map when a second factor is required), or `nil` if they couldn't be authenticated."
  [username password device-info :- request/DeviceInfo]
  (when (sso/ldap-enabled)
    (let [result (auth-identity/login! :provider/ldap
                                       {:username username
                                        :password password
                                        :device-info device-info})]
      (cond
        ;; Fallback when the ldap operation fails
        (contains? #{:ldap-error :server-error} (:error result))
        nil

        (= (:error result) :invalid-credentials)
        (throw (ex-info (str password-fail-message)
                        {:status-code 401
                         :errors {:password password-fail-snippet}}))

        (:success? result)
        (if (:mfa/pending? result) result (:session result))

        :else
        (throw (ex-info (str (:message result)) {:errors {:_error (:error result)}
                                                 :status-code 401}))))))

(mu/defn- email-login :- [:maybe [:or session.schema/SessionSchema [:map [:mfa/pending? [:= true]]]]]
  "Find a matching `User` if one exists and return a new Session for them (or an MFA-pending result
  map when a second factor is required), or `nil` if they couldn't be authenticated."
  [username    :- ms/NonBlankString
   password    :- [:maybe ms/NonBlankString]
   device-info :- request/DeviceInfo]
  (let [result (auth-identity/login! :provider/password
                                     {:email username
                                      :password password
                                      :device-info device-info})]
    (cond
      (contains? #{:invalid-credentials :server-error :authentication-expired} (:error result)) nil
      (:success? result) (if (:mfa/pending? result) result (:session result))
      :else (throw (ex-info (str (:message result)) {:errors {:_error (:error result)}
                                                     :status-code 401})))))

(defn- throttle-check
  "Pass through to `throttle/check` but will not check if `throttling-disabled?` is true"
  [throttler throttle-key]
  (when-not throttling-disabled?
    (throttle/check throttler throttle-key)))

(mu/defn- login :- [:or session.schema/SessionSchema [:map [:mfa/pending? [:= true]]]]
  "Attempt to login with different available methods with `username` and `password`, returning a new Session (or an
  MFA-pending result map when a second factor is required) or throwing an Exception if login could not be completed."
  [username    :- ms/NonBlankString
   password    :- ms/NonBlankString
   device-info :- request/DeviceInfo]
  ;; Primitive "strategy implementation", should be reworked for modular providers in #3210
  (or (ldap-login username password device-info)  ; First try LDAP if it's enabled
      (email-login username password device-info) ; Then try local authentication
      ;; If nothing succeeded complain about it
      ;; Don't leak whether the account doesn't exist or the password was incorrect
      (throw
       (ex-info (str password-fail-message)
                {:status-code 401
                 :errors      {:password password-fail-snippet}}))))

(defn- session-response
  "Ring response that sets the session cookies for a freshly created `session`.
  Body shape: `{:id <session-key>}`. The body is the same as the `POST /api/session` success path."
  [session request]
  (let [response (vary-meta {:id (str (:key session))} assoc :metabase-user-id (:user_id session))]
    (request/set-session-cookies request response session (t/zoned-date-time (t/zone-id "GMT")))))

(defenterprise verify-second-factor!
  "Verify a second-factor code (TOTP, recovery, or emailed one-time code) for user-id, atomically
  consuming it plus the challenge jti. Returns boolean.

  OSS fallback returns false — OSS can never have issued a challenge token (the MFA gate lives in
  EE), so this is unreachable in practice."
  metabase-enterprise.mfa.core
  [_user-id _code _jti]
  false)

(defenterprise send-mfa-email-otp!
  "Generate + email a one-time fallback code for user-id's confirmed enrollment; rejects a jti that
  already minted a session.

  OSS fallback throws (unreachable, as above)."
  metabase-enterprise.mfa.core
  [_user-id _jti]
  (throw (ex-info (tru "Multi-factor authentication is not available.") {:status-code 400})))

(defn- do-http-401-on-error [f]
  (try
    (f)
    (catch clojure.lang.ExceptionInfo e
      (throw (ex-info (ex-message e)
                      (assoc (ex-data e) :status-code 401)
                      e)))))

(defmacro http-401-on-error
  "Add `{:status-code 401}` to exception data thrown by `body`."
  {:style/indent 0}
  [& body]
  `(do-http-401-on-error (fn [] ~@body)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Login."
  [_route-params
   _query-params
   {:keys [username password]} :- [:map
                                   [:username ms/NonBlankString]
                                   [:password ms/NonBlankString]]
   request]
  (let [ip-address (request/ip-address request)
        do-login   (fn []
                     (let [result (login username password (request/device-info request))]
                       (if (:mfa/pending? result)
                         ;; First factor OK, but a second factor is required: build and sign a
                         ;; challenge token here (OSS session machinery) and return it instead of
                         ;; a session. No cookies are set yet.
                         {:status 200
                          :body   {:mfa_required    true
                                   :methods         (:mfa/methods result)
                                   :challenge_token (session.challenge/issue-challenge-token
                                                     (get-in result [:user :id])
                                                     (:mfa/first-factor result))}}
                         (session-response result request))))]
    (if throttling-disabled?
      (do-login)
      (http-401-on-error
        (throttle/with-throttling [(login-throttlers :ip-address) ip-address
                                   (login-throttlers :username)   username]
          (do-login))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/"
  "Logout."
  ;; `metabase-session-key` gets added automatically by the [[metabase.server.middleware.session]] middleware
  [_route-params _query-params _body {:keys [metabase-session-key], :as _request}]
  (api/check-404 (not-empty metabase-session-key))
  (let [session-key-hashed (session/hash-session-key metabase-session-key)
        rows-deleted (t2/delete! :model/Session {:where [:or [:= :key_hashed session-key-hashed] [:= :id metabase-session-key]]})]
    (api/check-404 (> rows-deleted 0))
    (request/clear-session-cookie api/generic-204-no-content)))

;; Reset tokens: We need some way to match a plaintext token with the a user since the token stored in the DB is
;; hashed. So we'll make the plaintext token in the format USER-ID_RANDOM-UUID, e.g.
;; "100_8a266560-e3a8-4dc1-9cd1-b4471dcd56d7", before hashing it. "Leaking" the ID this way is ok because the
;; plaintext token is only sent in the password reset email to the user in question.
;;
;; There's also no need to salt the token because it's already random <3

(def ^:private forgot-password-throttlers
  {:email      (throttle/make-throttler :email :attempts-threshold 3 :attempt-ttl-ms 1000)
   :ip-address (throttle/make-throttler :email :attempts-threshold 50)})

(defn- sso-password-reset-disabled?
  "Disable password reset for users whose SSO provider is still active — they should use SSO.
   When a provider is no longer available (e.g., after license downgrade), allow password reset
   so users aren't locked out."
  [sso-source]
  (and (some? sso-source)
       (sso/sso-source-enabled? sso-source)))

(defn- refresh-support-access-token!
  "Refresh the reset token on an existing support-access-grant AuthIdentity, preserving the grant
   binding. Returns the new plaintext token, or nil if the grant has expired."
  [user-id]
  (when-let [auth-identity (t2/select-one :model/AuthIdentity
                                          :user_id user-id
                                          :provider "support-access-grant")]
    (let [grant-ends-at (get-in auth-identity [:credentials :grant_ends_at])]
      (when (and grant-ends-at (t/before? (t/instant) (t/instant grant-ends-at)))
        (let [token (auth-identity/generate-reset-token user-id)]
          (t2/update! :model/AuthIdentity (:id auth-identity)
                      {:credentials {:token_hash   (u.password/hash-bcrypt token)
                                     :expires_at   (t/plus (t/instant) (t/hours 48))
                                     :grant_ends_at grant-ends-at
                                     :consumed_at  nil}})
          token)))))

(defn- forgot-password-impl
  [email]
  (future
    (when-let [{user-id      :id
                sso-source   :sso_source
                is-active?   :is_active :as user}
               (t2/select-one [:model/User :id :sso_source :is_active]
                              :%lower.email
                              (u/lower-case-en email))]
      (cond
        ;; SSO users should use their SSO provider, not password reset.
        (sso-password-reset-disabled? sso-source)
        (messages/send-password-reset-email! email sso-source nil is-active?)

        ;; Support-access users get a refreshed token bound to the grant.
        ;; If the grant has expired, refresh-support-access-token! returns nil and we silently
        ;; do nothing (same as a nonexistent account).
        (t2/exists? :model/AuthIdentity :user_id user-id :provider "support-access-grant")
        (when-let [reset-token (refresh-support-access-token! user-id)]
          (let [password-reset-url (str (system/site-url) "/auth/reset_password/" reset-token)]
            (messages/send-password-reset-email! email nil password-reset-url is-active?)))

        ;; Normal password reset.
        :else
        (let [reset-token        (auth-identity/create-password-reset! user-id)
              password-reset-url (str (system/site-url) "/auth/reset_password/" reset-token)]
          (messages/send-password-reset-email! email nil password-reset-url is-active?)))
      (events/publish-event! :event/password-reset-initiated
                             {:object (assoc user :token (t2/select-one-fn :reset_token :model/User :id user-id))}))))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/forgot_password"
  "Send a reset email when user has forgotten their password."
  [_route-params
   _query-params
   {:keys [email]} :- [:map
                       [:email ms/Email]]
   request]
  ;; Don't leak whether the account doesn't exist, just pretend everything is ok
  (let [request-source (request/ip-address request)]
    (throttle-check (forgot-password-throttlers :ip-address) request-source))
  (throttle-check (forgot-password-throttlers :email) email)
  (forgot-password-impl email)
  api/generic-204-no-content)

(def reset-password-throttler
  "Throttler for password_reset. There's no good field to mark so use password as a default."
  (throttle/make-throttler :password :attempts-threshold 10))

(defn reset-throttlers-for-testing!
  "Clear the accumulated state of every login/verification throttler in this namespace. Throttler
  state is in-memory with an hour-long `:attempt-ttl-ms`, so failed attempts survive an app-db
  snapshot restore; the testing API (see [[metabase.testing-api.api]]) exposes this so E2E runs
  can start from a clean slate."
  []
  (doseq [throttler (concat (vals login-throttlers)
                            (vals verify-throttlers)
                            (vals email-otp-send-throttlers)
                            (vals forgot-password-throttlers)
                            [reset-password-throttler])]
    (reset! (:attempts throttler) nil)))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/reset_password"
  "Reset password with a reset token."
  [_route-params
   _query-params
   request-body :- [:map
                    [:token    ms/NonBlankString]
                    [:password ms/ValidPassword]]
   request]
  (let [request-source (request/ip-address request)]
    (throttle-check reset-password-throttler request-source))
  (let [auth-result (auth-identity/with-fallback auth-identity/login!
                      [:provider/support-access-grant
                       :provider/emailed-secret-password-reset]
                      request-body)]
    (cond
      (not (:success? auth-result))
      (api/throw-invalid-param-exception :password (tru "Invalid reset token"))

      ;; The password change succeeded, but the user is MFA-enrolled: issue no session, or anyone
      ;; who can trigger a reset email routes around the second factor. They log in normally (and
      ;; get challenged) with the new password.
      (:mfa/pending? auth-result)
      {:success true}

      :else
      (let [session  (:session auth-result)
            response (vary-meta {:success true :session_id (str (:key session))}
                                assoc :metabase-user-id (:user_id session))]
        (request/set-session-cookies request response session
                                     (t/zoned-date-time (t/zone-id "GMT")))))))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/password_reset_token_valid"
  "Check if a password reset token is valid and isn't expired."
  [_route-params
   {:keys [token]} :- [:map
                       [:token ms/NonBlankString]]]
  (let [auth-result (auth-identity/with-fallback auth-identity/authenticate
                      [:provider/support-access-grant
                       :provider/emailed-secret-password-reset]
                      {:token token})]
    {:valid (:success? auth-result)}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/properties"
  "Get all properties and their values. These are the specific `Settings` that are readable by the current user, or are
  public if no user is logged in."
  ;; :unchecked, not a scope tag: this endpoint already serves anonymous callers (public
  ;; settings subset), so a scoped token must never be rejected where no token succeeds.
  ;; Setting visibility filtering handles authorization; clients (e.g. the CLI's version
  ;; probe) hit this with narrow tokens before any scoped call.
  {:scope :unchecked}
  []
  (setting/user-readable-values-map (setting/current-user-readable-visibilities)))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/google_auth"
  "Login with Google Auth."
  [_route-params
   _query-params
   {:keys [token]} :- [:map
                       [:token ms/NonBlankString]]
   request]
  (when-not (sso/google-auth-client-id)
    (throw (ex-info "Google Auth is disabled." {:status-code 400})))
  (letfn [(do-login []
            (let [login-result (auth-identity/login! :provider/google
                                                     {:token token
                                                      :device-info (request/device-info request)})]
              (cond
                ;; Login succeeded
                (:success? login-result)
                (let [session  (:session login-result)
                      response (vary-meta {:id (str (:key session))}
                                          assoc :metabase-user-id (:user_id session))]
                  (request/set-session-cookies request
                                               response
                                               session
                                               (t/zoned-date-time (t/zone-id "GMT"))))

                ;; Login failed
                :else
                (throw (ex-info (or (str (:message login-result)) "Authentication failed")
                                {:status-code 401
                                 :errors {:_error (or (:error login-result) "Authentication failed")}})))))]
    (http-401-on-error
      (if throttling-disabled?
        (do-login)
        (throttle/with-throttling [(login-throttlers :ip-address) (request/ip-address request)]
          (do-login))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/password-check"
  "Endpoint that checks if the supplied password meets the currently configured password complexity rules."
  [_route-params
   _query-params
   _body :- [:map
             [:password ms/ValidPassword]]]
  ;; if we pass the [[ms/ValidPassword]] test we're g2g
  {:valid true})

;; No response schema: the success path returns a full ring response (session cookies must be set),
;; which the response-schema machinery would validate as the body. Same constraint as
;; `POST /api/session`. Body shape: `{:id <session-key>}`.
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/mfa/verify"
  "Complete a two-step login by verifying a one-time code. Takes the `challenge_token` returned by
  `POST /api/session` and either the 6-digit `code` from the user's authenticator app, one of
  their single-use recovery codes, or an emailed one-time code; on success sets the session cookie."
  [_route-params
   _query-params
   ;; `:remember` is not bound here but is part of the contract: `request/set-session-cookies`
   ;; reads it from the raw body to decide session-vs-permanent cookie, exactly as on
   ;; `POST /api/session` — for MFA users THIS request is the one that creates the session.
   {challenge-token :challenge_token, code :code} :- [:map
                                                      [:challenge_token ms/NonBlankString]
                                                      [:code            ms/NonBlankString]
                                                      [:remember        {:optional true} :boolean]]
   request]
  (let [claims (or (session.challenge/verify-challenge-token challenge-token)
                   (throw (ex-info (tru "Authentication session expired. Please log in again.")
                                   {:status-code 401})))
        {:keys [jti]} claims
        _ (when-not jti
            (throw (ex-info (tru "Authentication session expired. Please log in again.")
                            {:status-code 401})))
        user-id      (:user-id claims)
        first-factor (auth-identity/provider-string->keyword (:provider claims))]
    ;; Throttle only failed attempts — counting successes would lock out a legitimately busy user.
    ;; The inner fn throws on failure so call-with-failure-throttling records the attempt.
    (call-with-failure-throttling
     [[(verify-throttlers :ip-address) (request/ip-address request)]
      [(verify-throttlers :user-id) user-id]]
     (fn []
       (when-not (verify-second-factor! user-id code jti)
         (events/publish-event! :event/mfa-verification-failed
                                {:object (t2/select-one :model/User :id user-id)})
         (throw (ex-info (tru "Invalid authentication code.") {:status-code 401})))))
    (let [user (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :id user-id)]
      ;; the account can be deactivated (or deleted) between the password step and here; a
      ;; challenge token must not outlive the account. Same 401 as a bad token — no oracle.
      (when-not (:is_active user)
        (throw (ex-info (tru "Authentication session expired. Please log in again.")
                        {:status-code 401})))
      (session-response (auth-identity/create-session-with-auth-tracking! user (request/device-info request) first-factor)
                        request))))

(api.macros/defendpoint :post "/mfa/send-email-otp" :- [:map [:success [:= true]]]
  "Email a one-time code as a fallback second factor (for a user who lost their authenticator but
  still has recovery codes disabled or unavailable). Requires a valid challenge token from
  `POST /api/session`; the code is single-use with a 10-minute expiry and is accepted by
  `POST /mfa/verify` like any other code."
  [_route-params
   _query-params
   {challenge-token :challenge_token} :- [:map [:challenge_token ms/NonBlankString]]
   request]
  (let [claims (or (session.challenge/verify-challenge-token challenge-token)
                   (throw (ex-info (tru "Authentication session expired. Please log in again.")
                                   {:status-code 401})))
        {:keys [jti]} claims
        _ (when-not jti
            (throw (ex-info (tru "Authentication session expired. Please log in again.")
                            {:status-code 401})))
        user-id (:user-id claims)
        ip      (request/ip-address request)]
    ;; sending is expensive and spammable — every send counts, not failure-only
    (when-not throttling-disabled?
      (throttle/check (email-otp-send-throttlers :ip-address) ip)
      (throttle/check (email-otp-send-throttlers :user-id) user-id))
    (when-not (channel.settings/email-configured?)
      (throw (ex-info (tru "Email is not configured on this instance.") {:status-code 400})))
    (send-mfa-email-otp! user-id jti))
  {:success true})

(defn- +log-all-request-failures [handler]
  (open-api/handler-with-open-api-spec
   (fn [request respond raise]
     (letfn [(raise' [e]
               (log/error e "Authentication endpoint error")
               (raise e))]
       (handler request respond raise')))
   (fn [prefix]
     (open-api/open-api-spec handler prefix))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/session` routes."
  (api.macros/ns-handler *ns* +log-all-request-failures))
