(ns metabase.session.api
  "/api/session endpoints"
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.request.core :as request]
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
   [throttle.core :as throttle]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ## API Endpoints

(def ^:private login-throttlers
  {:username   (throttle/make-throttler :username)
   ;; IP Address doesn't have an actual UI field so just show error by username
   :ip-address (throttle/make-throttler :username, :attempts-threshold 50)})

(def ^:private password-fail-message (deferred-tru "Password did not match stored password."))
(def ^:private password-fail-snippet (deferred-tru "did not match stored password"))

(mu/defn- ldap-login :- [:maybe [:map [:key ms/UUIDString]]]
  "If LDAP is enabled and a matching user exists return a new Session for them, or `nil` if they couldn't be
  authenticated."
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
        (:session result)

        :else
        (throw (ex-info (str (:message result)) {:errors {:_error (:error result)}
                                                 :status-code 401}))))))

(mu/defn- email-login :- [:maybe [:map [:key ms/UUIDString]]]
  "Find a matching `User` if one exists and return a new Session for them, or `nil` if they couldn't be authenticated."
  [username    :- ms/NonBlankString
   password    :- [:maybe ms/NonBlankString]
   device-info :- request/DeviceInfo]
  (let [result (auth-identity/login! :provider/password
                                     {:email username
                                      :password password
                                      :device-info device-info})]
    (cond
      (contains? #{:invalid-credentials :server-error :authentication-expired} (:error result)) nil
      (:success? result) (:session result)
      :else (throw (ex-info (str (:message result)) {:errors {:_error (:error result)}
                                                     :status-code 401})))))

(def ^:private throttling-disabled? (config/config-bool :mb-disable-session-throttle))

(defn- throttle-check
  "Pass through to `throttle/check` but will not check if `throttling-disabled?` is true"
  [throttler throttle-key]
  (when-not throttling-disabled?
    (throttle/check throttler throttle-key)))

(mu/defn- login :- session.schema/SessionSchema
  "Attempt to login with different available methods with `username` and `password`, returning new Session ID or
  throwing an Exception if login could not be completed."
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
  (let [ip-address   (request/ip-address request)
        request-time (t/zoned-date-time (t/zone-id "GMT"))
        do-login     (fn []
                       (let [{session-key :key, :as session} (login username password (request/device-info request))
                             response                        {:id (str session-key)}]
                         (request/set-session-cookies request response session request-time)))]
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

(defn- password-reset-disabled?
  "Disable password reset for all users created with SSO logins, unless those Users were created with Google SSO
  in which case disable reset for them as long as the Google SSO feature is enabled.

  Disable password reset for any support users -- users with a auth-identity of type `support-access-request`."
  [user-id sso-source]
  (cond
    (t2/exists? :model/AuthIdentity :user_id user-id :provider "support-access-grant") true
    (and (= sso-source :google) (not (sso/sso-enabled?))) (sso/google-auth-enabled)
    :else (some? sso-source)))

(defn- forgot-password-impl
  [email]
  (future
    (when-let [{user-id    :id
                sso-source :sso_source
                is-active? :is_active :as user}
               (t2/select-one [:model/User :id :sso_source :is_active]
                              :%lower.email
                              (u/lower-case-en email))]
      (if (password-reset-disabled? user-id sso-source)
        ;; If user uses any SSO method to log in, no need to generate a reset token. Some cases for Google SSO
        ;; are exempted see `password-reset-allowed?`
        (events/publish-event! :event/email.password-reset
                               {:email              email
                                :sso-source         sso-source
                                :password-reset-url nil
                                :is-active?         is-active?})
        (let [reset-token        (auth-identity/create-password-reset! user-id)
              password-reset-url (str (system/site-url) "/auth/reset_password/" reset-token)]
          (log/info password-reset-url)
          (events/publish-event! :event/email.password-reset
                                 {:email              email
                                  :sso-source         nil
                                  :password-reset-url password-reset-url
                                  :is-active?         is-active?})))
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
    (if (:success? auth-result)
      (request/set-session-cookies request
                                   {:success true :session_id (get-in auth-result [:session :key])}
                                   (:session auth-result)
                                   (t/zoned-date-time (t/zone-id "GMT")))
      (api/throw-invalid-param-exception :password (tru "Invalid reset token")))))

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
                (let [session (:session login-result)
                      response {:id (str (:key session))}]
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
