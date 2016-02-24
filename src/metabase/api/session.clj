(ns metabase.api.session
  "/api/session endpoints"
  (:require [clojure.tools.logging :as log]
            [cemerick.friend.credentials :as creds]
            [compojure.core :refer [defroutes GET POST DELETE]]
            [hiccup.core :refer [html]]
            [korma.core :as k]
            [throttle.core :as throttle]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.email.messages :as email]
            [metabase.events :as events]
            (metabase.models [user :refer [User set-user-password set-user-password-reset-token]]
                             [session :refer [Session]]
                             [setting :as setting])
            [metabase.util.password :as pass]))


(defn- create-session
  "Generate a new `Session` for a given `User`.  Returns the newly generated session id value."
  [user-id]
  (let [session-id (str (java.util.UUID/randomUUID))]
    (ins Session
         :id session-id
         :user_id user-id)
    session-id))


;;; ## API Endpoints

(def ^:private login-throttlers
  {:email      (throttle/make-throttler :email)
   :ip-address (throttle/make-throttler :email, :attempts-threshold 50)}) ; IP Address doesn't have an actual UI field so just show error by email

(defendpoint POST "/"
  "Login."
  [:as {{:keys [email password] :as body} :body, remote-address :remote-addr}]
  {email    [Required Email]
   password [Required NonEmptyString]}
  (throttle/check (login-throttlers :ip-address) remote-address)
  (throttle/check (login-throttlers :email)      email)
  (let [user (sel :one :fields [User :id :password_salt :password], :email email (k/where {:is_active true}))]
    ;; Don't leak whether the account doesn't exist or the password was incorrect
    (when-not (and user
                   (pass/verify-password password (:password_salt user) (:password user)))
      (throw (ex-info "Password did not match stored password." {:status-code 400
                                                                 :errors      {:password "did not match stored password"}})))
    (let [session-id (create-session (:id user))]
      (events/publish-event :user-login {:user_id (:id user) :session_id session-id})
      {:id session-id})))


(defendpoint DELETE "/"
  "Logout."
  [session_id]
  {session_id [Required NonEmptyString]}
  (check-exists? Session session_id)
  (del Session :id session_id))

;; Reset tokens:
;; We need some way to match a plaintext token with the a user since the token stored in the DB is hashed.
;; So we'll make the plaintext token in the format USER-ID_RANDOM-UUID, e.g. "100_8a266560-e3a8-4dc1-9cd1-b4471dcd56d7", before hashing it.
;; "Leaking" the ID this way is ok because the plaintext token is only sent in the password reset email to the user in question.
;;
;; There's also no need to salt the token because it's already random <3

(def ^:private forgot-password-throttlers
  {:email      (throttle/make-throttler :email)
   :ip-address (throttle/make-throttler :email, :attempts-threshold 50)})

(defendpoint POST "/forgot_password"
  "Send a reset email when user has forgotten their password."
  [:as {:keys [server-name] {:keys [email]} :body, remote-address :remote-addr, :as request}]
  {email [Required Email]}
  (throttle/check (forgot-password-throttlers :ip-address) remote-address)
  (throttle/check (forgot-password-throttlers :email)      email)
  ;; Don't leak whether the account doesn't exist, just pretend everything is ok
  (when-let [user-id (sel :one :id User :email email)]
    (let [reset-token        (set-user-password-reset-token user-id)
          password-reset-url (str (@(ns-resolve 'metabase.core 'site-url) request) "/auth/reset_password/" reset-token)]
      (email/send-password-reset-email email server-name password-reset-url)
      (log/info password-reset-url))))


(def ^:private ^:const reset-token-ttl-ms
  "Number of milliseconds a password reset is considered valid."
  (* 48 60 60 1000)) ; token considered valid for 48 hours

(defn- valid-reset-token->user-id
  "Check if a password reset token is valid. If so, return the `User` ID it corresponds to."
  [^String token]
  (when-let [[_ user-id] (re-matches #"(^\d+)_.+$" token)]
    (let [user-id (Integer/parseInt user-id)]
      (when-let [{:keys [reset_token reset_triggered]} (sel :one :fields [User :reset_triggered :reset_token] :id user-id)]
        ;; Make sure the plaintext token matches up with the hashed one for this user
        (when (try (creds/bcrypt-verify token reset_token)
                   (catch Throwable _))
          ;; check that the reset was triggered within the last 48 HOURS, after that the token is considered expired
          (let [token-age (- (System/currentTimeMillis) reset_triggered)]
            (when (< token-age reset-token-ttl-ms)
              user-id)))))))

(defendpoint POST "/reset_password"
  "Reset password with a reset token."
  [:as {{:keys [token password]} :body}]
  {token    Required
   password [Required ComplexPassword]}
  (or (when-let [user-id (valid-reset-token->user-id token)]
        (set-user-password user-id password)
        ;; after a successful password update go ahead and offer the client a new session that they can use
        (let [session-id (create-session user-id)]
          (events/publish-event :user-login {:user_id user-id :session_id session-id})
          {:success    true
           :session_id session-id}))
      (throw (invalid-param-exception :password "Invalid reset token"))))


(defendpoint GET "/password_reset_token_valid"
  "Check is a password reset token is valid and isn't expired."
  [token]
  {token Required}
  {:valid (boolean (valid-reset-token->user-id token))})


(defendpoint GET "/properties"
  "Get all global properties and their values. These are the specific `Settings` which are meant to be public."
  []
  (setting/public-settings))

(define-routes)
