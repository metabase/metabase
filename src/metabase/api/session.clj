(ns metabase.api.session
  "/api/session endpoints"
  (:require [clojure.math.numeric-tower :as math]
            [clojure.tools.logging :as log]
            [cemerick.friend.credentials :as creds]
            [compojure.core :refer [defroutes GET POST DELETE]]
            [hiccup.core :refer [html]]
            [korma.core :as k]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.email.messages :as email]
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

;;; ## Login Throttling

;; The basic concept here is to keep a list of failed logins over the last hour. This list looks like:
;;
;; (["cam@metabase.com" #inst "2015-07-27T23:34:48.156-00:00"]
;;  ["cam@metabase.com" #inst "2015-07-27T23:34:32.783-00:00"]
;;  ["cam@metabase.com" #inst "2015-07-27T23:34:31.666-00:00"])
;;
;; Every time there's a failed login, push a new pair of [email timestamp] to the front of the list. The list is thus
;; automatically ordered by date, and we can drop the portion of the list with failed logins that are over an hour
;; old as needed.
;;
;; Once a User has some number of failed login attempts over the past hour (e.g. 4), calculate some delay before
;; they're allowed to try to login again (e.g., 15 seconds). This number will increase exponentially as the number of
;; recent failures increases (e.g., 40 seconds for 5 failed attempts, 90 for 6 failed attempts, etc).
;;
;; If applicable, calucate the time since the last failed attempt, and throw an exception telling the user the number of
;; seconds they must wait before trying again.

(def ^:private ^:const failed-login-attempts-initial-delay-seconds
  "If a user makes the number of failed login attempts specified by `failed-login-attempts-throttling-threshold` in the
   last hour, require them to wait this many seconds after the last failed attempt before trying again."
  15)

(def ^:private ^:const failed-login-attempts-throttling-threshold
  "If a user has had more than this many failed login attempts in the last hour, make them
   wait `failed-login-attempts-initial-delay-seconds` since the last failed attempt before trying again."
  5)

(def ^:private ^:const failed-login-delay-exponent
  "Multiply `failed-login-attempts-initial-delay-seconds` by the number of failed login attempts in the last hour
   over `failed-login-attempts-throttling-threshold` times this exponent.

   e.g. if this number is `2`, and a User has to wait `15` seconds initially, they'll have to wait 60 for the next
   failure (15 * 2^2), then 135 seconds the next time (15 * 3^3), and so on."
  1.5)

(def ^:private failed-login-attempts
  "Failed login attempts over the last hour. Vector of pairs of `[email-address time]`"
  (atom '()))

(defn- remove-old-failed-login-attempts
  "Remove `failed-login-attempts` older than an hour."
  []
  (let [one-hour-ago            (java.util.Date. (- (System/currentTimeMillis) (* 60 60 1000)))
        less-than-one-hour-old? (fn [[_ ^java.util.Date date]]
                                  (.after date one-hour-ago))]
    (reset! failed-login-attempts (take-while less-than-one-hour-old? @failed-login-attempts))))

(defn- push-failed-login-attempt
  "Record a failed login attempt. Add a new pair to `failed-login-attempts` for EMAIL."
  [email]
  {:pre [(string? email)]}
  ;; First filter out old failed login attempts
  (remove-old-failed-login-attempts)
  ;; Now push the new one to the front
  (swap! failed-login-attempts conj [email (java.util.Date.)]))

(defn- calculate-login-delay
  "Calculate the appropriate delay (in seconds) before a user should be allowed to login again based on
   MOST-RECENT-ATTEMPT and NUM-RECENT-ATTEMPTS. This function returns `nil` if there is no delay that should be required."
  [^java.util.Date most-recent-attempt num-recent-attempts]
  (when most-recent-attempt
    (assert (= (type most-recent-attempt) java.util.Date))
    (let [num-attempts-over-threshold (- num-recent-attempts failed-login-attempts-throttling-threshold)]
      (when (> num-attempts-over-threshold 0)
        (let [delay-seconds           (* (math/expt num-attempts-over-threshold failed-login-delay-exponent)
                                         failed-login-attempts-initial-delay-seconds)
              last-login+delay-ms     (+ (.getTime most-recent-attempt) (* delay-seconds 1000))
              seconds-till-next-login (int (math/round (/ (- last-login+delay-ms (System/currentTimeMillis)) 1000)))]
          (when (> seconds-till-next-login 0)
            seconds-till-next-login))))))

(defn- check-throttle-login-attempts
  "Throw an Exception if a User has tried (and failed) to log in too many times recently."
  [email]
  {:pre [(string? email)]}
  ;; Remove any out-of-date failed login attempts
  (remove-old-failed-login-attempts)
  ;; Now count the number of recent attempts with this email
  (let [recent-attempts         (filter (fn [[attempt-email _]]
                                          (= email attempt-email))
                                        @failed-login-attempts)
        [_ most-recent-attempt] (first recent-attempts)]
    (println "RECENT ATTEMPTS:\n" (metabase.util/pprint-to-str 'cyan recent-attempts))
    (when-let [login-delay (calculate-login-delay most-recent-attempt (count recent-attempts))]
      (let [message (format "Too many recent failed logins! You must wait %d seconds before trying again." login-delay)]
        (throw (ex-info message {:status-code 400
                                 :errors      {:email message}}))))))


;;; ## API Endpoints

(defendpoint POST "/"
  "Login."
  [:as {{:keys [email password] :as body} :body}]
  {email    [Required Email]
   password [Required NonEmptyString]}
  (check-throttle-login-attempts email)
  (let [user       (sel :one :fields [User :id :password_salt :password] :email email (k/where {:is_active true}))
        login-fail (fn []
                     (push-failed-login-attempt email)
                     (throw (ex-info "Password did not match stored password." {:status-code 400
                                                                                :errors      {:password "did not match stored password"}})))]
    ;; Don't leak whether the account doesn't exist or the password was incorrect
    (when-not user
      (login-fail))
    ;; Verify that password matches up
    (when-not (pass/verify-password password (:password_salt user) (:password user))
      (login-fail))
    ;; OK! Create new Session
    (let [session-id (create-session (:id user))]
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

(defendpoint POST "/forgot_password"
  "Send a reset email when user has forgotten their password."
  [:as {:keys [server-name] {:keys [email]} :body, :as request}]
  {email [Required Email]}
  ;; Don't leak whether the account doesn't exist, just pretend everything is ok
  (when-let [user-id (sel :one :id User :email email)]
    (let [reset-token        (set-user-password-reset-token user-id)
          password-reset-url (str (@(ns-resolve 'metabase.core 'site-url) request) "/auth/reset_password/" reset-token)]
      (email/send-password-reset-email email server-name password-reset-url)
      (log/info password-reset-url))))


(defendpoint POST "/reset_password"
  "Reset password with a reset token."
  [:as {{:keys [token password] :as body} :body}]
  {token    Required
   password [Required ComplexPassword]}
  (api-let [400 "Invalid reset token"] [[_ user-id]                           (re-matches #"(^\d+)_.+$" token)
                                        user-id                               (Integer/parseInt user-id)
                                        {:keys [reset_token reset_triggered]} (sel :one :fields [User :reset_triggered :reset_token] :id user-id)]
    ;; Make sure the plaintext token matches up with the hashed one for this user
    (check (try (creds/bcrypt-verify token reset_token)
                (catch Throwable _))
      [400 "Invalid reset token"]

      ;; check that the reset was triggered within the last 1 HOUR, after that the token is considered expired
      (> (* 60 60 1000) (- (System/currentTimeMillis) (or reset_triggered 0)))
      [400 "Reset token has expired"])
    (set-user-password user-id password)
    ;; after a successful password update go ahead and offer the client a new session that they can use
    {:success true
     :session_id (create-session user-id)}))


(defendpoint GET "/properties"
  "Get all global properties and their values. These are the specific `Settings` which are meant to be public."
  []
  (filter #(= (:key %) :site-name) (setting/all-with-descriptions)))


(define-routes)
