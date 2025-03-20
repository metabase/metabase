(ns metabase.session.api
  "/api/session endpoints"
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.channel.email.messages :as messages]
   [metabase.config :as config]
   [metabase.events :as events]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.models.user :as user]
   [metabase.public-settings :as public-settings]
   [metabase.request.core :as request]
   [metabase.session.models.session :as session]
   [metabase.sso.core :as sso]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.password :as u.password]
   [throttle.core :as throttle]
   [toucan2.core :as t2])
  (:import
   (com.unboundid.util LDAPSDKException)))

(set! *warn-on-reflection* true)

;;; ## API Endpoints

(def ^:private login-throttlers
  {:username   (throttle/make-throttler :username)
   ;; IP Address doesn't have an actual UI field so just show error by username
   :ip-address (throttle/make-throttler :username, :attempts-threshold 50)})

(def ^:private password-fail-message (deferred-tru "Password did not match stored password."))
(def ^:private password-fail-snippet (deferred-tru "did not match stored password"))

(def ^:private disabled-account-message (deferred-tru "Your account is disabled. Please contact your administrator."))
(def ^:private disabled-account-snippet (deferred-tru "Your account is disabled."))

;; Fake salt & hash used to run bcrypt hash if user doesn't exist, to avoid timing attacks (Metaboat #134)
(def ^:private fake-salt "ee169694-5eb6-4010-a145-3557252d7807")
(def ^:private fake-hashed-password "$2a$10$owKjTym0ZGEEZOpxM0UyjekSvt66y1VvmOJddkAaMB37e0VAIVOX2")

(mu/defn- ldap-login :- [:maybe [:map [:key ms/UUIDString]]]
  "If LDAP is enabled and a matching user exists return a new Session for them, or `nil` if they couldn't be
  authenticated."
  [username password device-info :- request/DeviceInfo]
  (when (sso/ldap-enabled)
    (try
      (when-let [user-info (sso/find-ldap-user username)]
        (when-not (sso/verify-ldap-password user-info password)
          ;; Since LDAP knows about the user, fail here to prevent the local strategy to be tried with a possibly
          ;; outdated password
          (throw (ex-info (str password-fail-message)
                          {:status-code 401
                           :errors      {:password password-fail-snippet}})))
        ;; password is ok, return new session if user is not deactivated
        (let [user (sso/fetch-or-create-ldap-user! user-info)]
          (if (:is_active user)
            (session/create-session! :sso user device-info)
            (throw (ex-info (str disabled-account-message)
                            {:status-code 401
                             :errors      {:_error disabled-account-snippet}})))))
      (catch LDAPSDKException e
        (log/error e "Problem connecting to LDAP server, will fall back to local authentication")))))

(mu/defn- email-login :- [:maybe [:map [:key ms/UUIDString]]]
  "Find a matching `User` if one exists and return a new Session for them, or `nil` if they couldn't be authenticated."
  [username    :- ms/NonBlankString
   password    :- [:maybe ms/NonBlankString]
   device-info :- request/DeviceInfo]
  (if-let [user (t2/select-one [:model/User :id :password_salt :password :last_login :is_active], :%lower.email (u/lower-case-en username))]
    (when (u.password/verify-password password (:password_salt user) (:password user))
      (if (:is_active user)
        (session/create-session! :password user device-info)
        (throw (ex-info (str disabled-account-message)
                        {:status-code 401
                         :errors      {:_error disabled-account-snippet}}))))
    (do
      ;; User doesn't exist; run bcrypt hash anyway to avoid leaking account existence in request timing
      (u.password/verify-password password fake-salt fake-hashed-password)
      nil)))

(def ^:private throttling-disabled? (config/config-bool :mb-disable-session-throttle))

(defn- throttle-check
  "Pass through to `throttle/check` but will not check if `throttling-disabled?` is true"
  [throttler throttle-key]
  (when-not throttling-disabled?
    (throttle/check throttler throttle-key)))

(mu/defn- login :- session/SessionSchema
  "Attempt to login with different avaialable methods with `username` and `password`, returning new Session ID or
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
                      (assoc (ex-data e) :status-code 401))))))

(defmacro http-401-on-error
  "Add `{:status-code 401}` to exception data thrown by `body`."
  {:style/indent 0}
  [& body]
  `(do-http-401-on-error (fn [] ~@body)))

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

(api.macros/defendpoint :delete "/"
  "Logout."
  ;; `metabase-session-key` gets added automatically by the [[metabase.server.middleware.session]] middleware
  [_route-params _query-params _body {:keys [metabase-session-key], :as _request}]
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
  in which case disable reset for them as long as the Google SSO feature is enabled."
  [sso-source]
  (if (and (= sso-source :google) (not (public-settings/sso-enabled?)))
    (public-settings/google-auth-enabled?)
    (some? sso-source)))

(defn- forgot-password-impl
  [email]
  (future
    (when-let [{user-id      :id
                sso-source   :sso_source
                is-active?   :is_active :as user}
               (t2/select-one [:model/User :id :sso_source :is_active]
                              :%lower.email
                              (u/lower-case-en email))]
      (if (password-reset-disabled? sso-source)
        ;; If user uses any SSO method to log in, no need to generate a reset token. Some cases for Google SSO
        ;; are exempted see `password-reset-allowed?`
        (messages/send-password-reset-email! email sso-source nil is-active?)
        (let [reset-token        (user/set-password-reset-token! user-id)
              password-reset-url (str (public-settings/site-url) "/auth/reset_password/" reset-token)]
          (log/info password-reset-url)
          (messages/send-password-reset-email! email nil password-reset-url is-active?)))
      (events/publish-event! :event/password-reset-initiated
                             {:object (assoc user :token (t2/select-one-fn :reset_token :model/User :id user-id))}))))

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

(defsetting reset-token-ttl-hours
  (deferred-tru "Number of hours a password reset is considered valid.")
  :visibility :internal
  :type       :integer
  :default    48
  :audit      :getter)

(defn reset-token-ttl-ms
  "number of milliseconds a password reset is considered valid."
  []
  (* (reset-token-ttl-hours) 60 60 1000))

(defn- valid-reset-token->user
  "Check if a password reset token is valid. If so, return the `User` ID it corresponds to."
  [^String token]
  (when-let [[_ user-id] (re-matches #"(^\d+)_.+$" token)]
    (let [user-id (Integer/parseInt user-id)]
      (when-let [{:keys [reset_token reset_triggered], :as user} (t2/select-one [:model/User :id :last_login :reset_triggered
                                                                                 :reset_token]
                                                                                :id user-id, :is_active true)]
        ;; Make sure the plaintext token matches up with the hashed one for this user
        (when (u/ignore-exceptions
                (u.password/bcrypt-verify token reset_token))
          ;; check that the reset was triggered within the last 48 HOURS, after that the token is considered expired
          (let [token-age (- (System/currentTimeMillis) reset_triggered)]
            (when (< token-age (reset-token-ttl-ms))
              user)))))))

(def reset-password-throttler
  "Throttler for password_reset. There's no good field to mark so use password as a default."
  (throttle/make-throttler :password :attempts-threshold 10))

(api.macros/defendpoint :post "/reset_password"
  "Reset password with a reset token."
  [_route-params
   _query-params
   {:keys [token password]} :- [:map
                                [:token    ms/NonBlankString]
                                [:password ms/ValidPassword]]
   request]
  (let [request-source (request/ip-address request)]
    (throttle-check reset-password-throttler request-source))
  (or (when-let [{user-id :id, :as user} (valid-reset-token->user token)]
        (let [reset-token (t2/select-one-fn :reset_token :model/User :id user-id)]
          (user/set-password! user-id password)
          ;; if this is the first time the user has logged in it means that they're just accepted their Metabase invite.
          ;; Otherwise, send audit log event that a user reset their password.
          (if (:last_login user)
            (events/publish-event! :event/password-reset-successful {:object (assoc user :token reset-token)})
            ;; Send all the active admins an email :D
            (messages/send-user-joined-admin-notification-email! (t2/select-one :model/User :id user-id)))
          ;; after a successful password update go ahead and offer the client a new session that they can use
          (let [{session-key :key, :as session} (session/create-session! :password user (request/device-info request))
                response                        {:success    true
                                                 :session_id (str session-key)}]
            (request/set-session-cookies request response session (t/zoned-date-time (t/zone-id "GMT"))))))
      (api/throw-invalid-param-exception :password (tru "Invalid reset token"))))

(api.macros/defendpoint :get "/password_reset_token_valid"
  "Check if a password reset token is valid and isn't expired."
  [_route-params
   {:keys [token]} :- [:map
                       [:token ms/NonBlankString]]]
  {:valid (boolean (valid-reset-token->user token))})

(api.macros/defendpoint :get "/properties"
  "Get all properties and their values. These are the specific `Settings` that are readable by the current user, or are
  public if no user is logged in."
  []
  (setting/user-readable-values-map (setting/current-user-readable-visibilities)))

(api.macros/defendpoint :post "/google_auth"
  "Login with Google Auth."
  [_route-params
   _query-params
   _body :- [:map
             [:token ms/NonBlankString]]
   request]
  (when-not (sso/google-auth-client-id)
    (throw (ex-info "Google Auth is disabled." {:status-code 400})))
  ;; Verify the token is valid with Google
  (letfn [(do-login []
            (let [user (sso/do-google-auth request)
                  {session-key :key, :as session} (session/create-session! :sso user (request/device-info request))
                  response {:id (str session-key)}
                  user (t2/select-one [:model/User :id :is_active], :email (:email user))]
              (if (and user (:is_active user))
                (request/set-session-cookies request
                                             response
                                             session
                                             (t/zoned-date-time (t/zone-id "GMT")))
                (throw (ex-info (str disabled-account-message)
                                {:status-code 401
                                 :errors      {:account disabled-account-snippet}})))))]
    (http-401-on-error
      (if throttling-disabled?
        (do-login)
        (throttle/with-throttling [(login-throttlers :ip-address) (request/ip-address request)]
          (do-login))))))

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
