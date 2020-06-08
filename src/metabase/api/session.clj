(ns metabase.api.session
  "/api/session endpoints"
  (:require [cemerick.friend.credentials :as creds]
            [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE GET POST]]
            [metabase
             [config :as config]
             [events :as events]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.email.messages :as email]
            [metabase.integrations.ldap :as ldap]
            [metabase.middleware.session :as mw.session]
            [metabase.models
             [session :refer [Session]]
             [setting :as setting :refer [defsetting]]
             [user :as user :refer [User]]]
            [metabase.util
             [i18n :as ui18n :refer [deferred-tru trs tru]]
             [password :as pass]
             [schema :as su]]
            [schema.core :as s]
            [throttle.core :as throttle]
            [toucan.db :as db])
  (:import com.unboundid.util.LDAPSDKException
           java.util.UUID))

(defmulti create-session!
  "Generate a new Session for a User. `session-type` is the currently either `:password` (for email + password login) or
  `:sso` (for other login types). Returns the newly generated session `UUID`."
  {:arglists '(^java.util.UUID [session-type user])}
  (fn [session-type & _]
    session-type))

(def ^:private CreateSessionUserInfo
  {:id         su/IntGreaterThanZero
   :last_login s/Any
   s/Keyword   s/Any})

(s/defmethod create-session! :sso
  [_, user :- CreateSessionUserInfo]
  (u/prog1 (UUID/randomUUID)
    (db/insert! Session
      :id      (str <>)
      :user_id (u/get-id user))
    (events/publish-event! :user-login
      {:user_id (:id user), :session_id (str <>), :first_login (nil? (:last_login user))})))

(s/defmethod create-session! :password
  [session-type, user :- CreateSessionUserInfo]
  ;; this is actually the same as `create-session!` for `:sso` for CE. Resist the urge to refactor this multimethod
  ;; out impl is a little different in EE.
  ((get-method create-session! :sso) session-type user))


;;; ## API Endpoints

(def ^:private login-throttlers
  {:username   (throttle/make-throttler :username)
   ;; IP Address doesn't have an actual UI field so just show error by username
   :ip-address (throttle/make-throttler :username, :attempts-threshold 50)})

(def ^:private password-fail-message (deferred-tru "Password did not match stored password."))
(def ^:private password-fail-snippet (deferred-tru "did not match stored password"))

(s/defn ^:private ldap-login :- (s/maybe UUID)
  "If LDAP is enabled and a matching user exists return a new Session for them, or `nil` if they couldn't be
  authenticated."
  [username password]
  (when (ldap/ldap-configured?)
    (try
      (when-let [user-info (ldap/find-user username)]
        (when-not (ldap/verify-password user-info password)
          ;; Since LDAP knows about the user, fail here to prevent the local strategy to be tried with a possibly
          ;; outdated password
          (throw (ex-info (str password-fail-message)
                   {:status-code 400
                    :errors      {:password password-fail-snippet}})))
        ;; password is ok, return new session
        (create-session! :sso (ldap/fetch-or-create-user! user-info)))
      (catch LDAPSDKException e
        (log/error e (trs "Problem connecting to LDAP server, will fall back to local authentication"))))))

(s/defn ^:private email-login :- (s/maybe UUID)
  "Find a matching `User` if one exists and return a new Session for them, or `nil` if they couldn't be authenticated."
  [username password]
  (when-let [user (db/select-one [User :id :password_salt :password :last_login], :email username, :is_active true)]
    (when (pass/verify-password password (:password_salt user) (:password user))
      (create-session! :password user))))

(def ^:private throttling-disabled? (config/config-bool :mb-disable-session-throttle))

(defn- throttle-check
  "Pass through to `throttle/check` but will not check if `throttling-disabled?` is true"
  [throttler throttle-key]
  (when-not throttling-disabled?
    (throttle/check throttler throttle-key)))

(s/defn ^:private login :- UUID
  "Attempt to login with different avaialable methods with `username` and `password`, returning new Session ID or
  throwing an Exception if login could not be completed."
  [username :- su/NonBlankString, password :- su/NonBlankString]
  ;; Primitive "strategy implementation", should be reworked for modular providers in #3210
  (or (ldap-login username password)    ; First try LDAP if it's enabled
      (email-login username password)   ; Then try local authentication
      ;; If nothing succeeded complain about it
      ;; Don't leak whether the account doesn't exist or the password was incorrect
      (throw
       (ex-info (str password-fail-message)
         {:status-code 400
          :errors      {:password password-fail-snippet}}))))

(defn- source-address
  "The `public-settings/source-address-header` header's value, or the `(:remote-addr request)` if not set."
  [{:keys [headers remote-addr]}]
  (or (some->> (public-settings/source-address-header) (get headers))
      remote-addr))

(defn- do-login
  "Logs user in and creates an appropriate Ring response containing the newly created session's ID."
  [username password request]
  (let [session-id (login username password)
        response   {:id session-id}]
    (mw.session/set-session-cookie request response session-id)))

(defn- do-http-400-on-error [f]
  (try
    (f)
    (catch clojure.lang.ExceptionInfo e
      (throw (ex-info (ex-message e)
                      (assoc (ex-data e) :status-code 400))))))

(defmacro http-400-on-error
  "Add `{:status-code 400}` to exception data thrown by `body`."
  [& body]
  `(do-http-400-on-error (fn [] ~@body)))

(api/defendpoint POST "/"
  "Login."
  [:as {{:keys [username password]} :body, :as request}]
  {username su/NonBlankString
   password su/NonBlankString}
  (let [request-source (source-address request)]
    (if throttling-disabled?
      (do-login username password request)
      (http-400-on-error
        (throttle/with-throttling [(login-throttlers :ip-address) request-source
                                   (login-throttlers :username)   username]
          (do-login username password request))))))


(api/defendpoint DELETE "/"
  "Logout."
  [:as {:keys [metabase-session-id]}]
  (api/check-exists? Session metabase-session-id)
  (db/delete! Session :id metabase-session-id)
  (mw.session/clear-session-cookie api/generic-204-no-content))

;; Reset tokens: We need some way to match a plaintext token with the a user since the token stored in the DB is
;; hashed. So we'll make the plaintext token in the format USER-ID_RANDOM-UUID, e.g.
;; "100_8a266560-e3a8-4dc1-9cd1-b4471dcd56d7", before hashing it. "Leaking" the ID this way is ok because the
;; plaintext token is only sent in the password reset email to the user in question.
;;
;; There's also no need to salt the token because it's already random <3

(def ^:private forgot-password-throttlers
  {:email      (throttle/make-throttler :email)
   :ip-address (throttle/make-throttler :email, :attempts-threshold 50)})

(api/defendpoint POST "/forgot_password"
  "Send a reset email when user has forgotten their password."
  [:as {:keys [server-name] {:keys [email]} :body, :as request}]
  {email su/Email}
  ;; Don't leak whether the account doesn't exist, just pretend everything is ok
  (let [request-source (source-address request)]
    (throttle-check (forgot-password-throttlers :ip-address) source-address)
    (throttle-check (forgot-password-throttlers :email)      email)
    (when-let [{user-id :id, google-auth? :google_auth} (db/select-one [User :id :google_auth]
                                                                       :email email, :is_active true)]
      (let [reset-token        (user/set-password-reset-token! user-id)
            password-reset-url (str (public-settings/site-url) "/auth/reset_password/" reset-token)]
        (email/send-password-reset-email! email google-auth? server-name password-reset-url)
        (log/info password-reset-url))))
  api/generic-204-no-content)


(def ^:private ^:const reset-token-ttl-ms
  "Number of milliseconds a password reset is considered valid."
  (* 48 60 60 1000)) ; token considered valid for 48 hours

(defn- valid-reset-token->user
  "Check if a password reset token is valid. If so, return the `User` ID it corresponds to."
  [^String token]
  (when-let [[_ user-id] (re-matches #"(^\d+)_.+$" token)]
    (let [user-id (Integer/parseInt user-id)]
      (when-let [{:keys [reset_token reset_triggered], :as user} (db/select-one [User :id :last_login :reset_triggered
                                                                                 :reset_token]
                                                                   :id user-id, :is_active true)]
        ;; Make sure the plaintext token matches up with the hashed one for this user
        (when (u/ignore-exceptions
                (creds/bcrypt-verify token reset_token))
          ;; check that the reset was triggered within the last 48 HOURS, after that the token is considered expired
          (let [token-age (- (System/currentTimeMillis) reset_triggered)]
            (when (< token-age reset-token-ttl-ms)
              user)))))))

(api/defendpoint POST "/reset_password"
  "Reset password with a reset token."
  [:as {{:keys [token password]} :body, :as request}]
  {token    su/NonBlankString
   password su/ComplexPassword}
  (or (when-let [{user-id :id, :as user} (valid-reset-token->user token)]
        (user/set-password! user-id password)
        ;; if this is the first time the user has logged in it means that they're just accepted their Metabase invite.
        ;; Send all the active admins an email :D
        (when-not (:last_login user)
          (email/send-user-joined-admin-notification-email! (User user-id)))
        ;; after a successful password update go ahead and offer the client a new session that they can use
        (let [session-id (create-session! :password user)]
          (mw.session/set-session-cookie
           request
           {:success    true
            :session_id (str session-id)}
           session-id)))
      (api/throw-invalid-param-exception :password (tru "Invalid reset token"))))

(api/defendpoint GET "/password_reset_token_valid"
  "Check is a password reset token is valid and isn't expired."
  [token]
  {token s/Str}
  {:valid (boolean (valid-reset-token->user token))})

(api/defendpoint GET "/properties"
  "Get all global properties and their values. These are the specific `Settings` which are meant to be public."
  []
  (merge
   (setting/properties :public)
   (when @api/*current-user*
     (setting/properties :authenticated))
   (when api/*is-superuser?*
     (setting/properties :admin))))


;;; -------------------------------------------------- GOOGLE AUTH ---------------------------------------------------

;; TODO - The more I look at all this code the more I think it should go in its own namespace.
;; `metabase.integrations.google-auth` would be appropriate, or `metabase.integrations.auth.google` if we decide to
;; add more 3rd-party SSO options

(defsetting google-auth-client-id
  (deferred-tru "Client ID for Google Auth SSO. If this is set, Google Auth is considered to be enabled.")
  :visibility :public)

(defsetting google-auth-auto-create-accounts-domain
  (deferred-tru "When set, allow users to sign up on their own if their Google account email address is from this domain."))

(def ^:private google-auth-token-info-url "https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=%s")

(defn- google-auth-token-info
  ([token-info-response]
   (google-auth-token-info token-info-response (google-auth-client-id)))
  ([token-info-response client-id]
   (let [{:keys [status body]} token-info-response]
     (when-not (= status 200)
       (throw (ex-info (tru "Invalid Google Auth token.") {:status-code 400})))
     (u/prog1 (json/parse-string body keyword)
       (let [audience (:aud <>)
             audience (if (string? audience) [audience] audience)]
         (when-not (contains? (set audience) client-id)
           (throw (ex-info (str (deferred-tru "Google Auth token appears to be incorrect. ")
                                (deferred-tru "Double check that it matches in Google and Metabase."))
                           {:status-code 400}))))
       (when-not (= (:email_verified <>) "true")
         (throw (ex-info (tru "Email is not verified.") {:status-code 400})))))))

;; TODO - are these general enough to move to `metabase.util`?
(defn- email->domain ^String [email]
  (last (re-find #"^.*@(.*$)" email)))

(defn- email-in-domain? ^Boolean [email domain]
  {:pre [(u/email? email)]}
  (= (email->domain email) domain))

(defn- autocreate-user-allowed-for-email? [email]
  (when-let [domain (google-auth-auto-create-accounts-domain)]
    (email-in-domain? email domain)))

(defn check-autocreate-user-allowed-for-email
  "Throws if an admin needs to intervene in the account creation."
  [email]
  (when-not (autocreate-user-allowed-for-email? email)
    ;; Use some wacky status code (428 - Precondition Required) so we will know when to so the error screen specific
    ;; to this situation
    (throw
     (ex-info (tru "You''ll need an administrator to create a Metabase account before you can use Google to log in.")
       {:status-code 428}))))

(s/defn ^:private google-auth-create-new-user!
  [{:keys [email] :as new-user} :- user/NewUser]
  (check-autocreate-user-allowed-for-email email)
  ;; this will just give the user a random password; they can go reset it if they ever change their mind and want to
  ;; log in without Google Auth; this lets us keep the NOT NULL constraints on password / salt without having to make
  ;; things hairy and only enforce those for non-Google Auth users
  (user/create-new-google-auth-user! new-user))

(s/defn ^:private google-auth-fetch-or-create-user! :- (s/maybe UUID)
  [first-name last-name email]
  (when-let [user (or (db/select-one [User :id :last_login] :email email)
                      (google-auth-create-new-user! {:first_name first-name
                                                     :last_name  last-name
                                                     :email      email}))]
    (create-session! :sso user)))

(defn- do-google-auth [{{:keys [token]} :body :as request}]
  (let [token-info-response                    (http/post (format google-auth-token-info-url token))
        {:keys [given_name family_name email]} (google-auth-token-info token-info-response)]
    (log/info (trs "Successfully authenticated Google Auth token for: {0} {1}" given_name family_name))
    (let [session-id (api/check-500 (google-auth-fetch-or-create-user! given_name family_name email))
          response   {:id session-id}]
      (mw.session/set-session-cookie request response session-id))))

(api/defendpoint POST "/google_auth"
  "Login with Google Auth."
  [:as {{:keys [token]} :body, :as request}]
  {token su/NonBlankString}
  (when-not (google-auth-client-id)
    (throw (ex-info "Google Auth is disabled." {:status-code 400})))
  ;; Verify the token is valid with Google
  (if throttling-disabled?
    (do-google-auth token)
    (http-400-on-error
      (throttle/with-throttling [(login-throttlers :ip-address) (source-address request)]
        (do-google-auth request)))))


(api/define-routes)
