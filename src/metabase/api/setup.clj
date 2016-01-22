(ns metabase.api.setup
  (:require [compojure.core :refer [defroutes POST]]
            (metabase.api [common :refer :all]
                          [database :refer [annotation:DBEngine]])
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.events :as events]
            (metabase.models [database :refer [Database]]
                             [session :refer [Session]]
                             [setting :as setting]
                             [user :refer [User set-user-password]])
            [metabase.setup :as setup]
            [metabase.util :as u]))

(defannotation SetupToken
  "Check that param matches setup token or throw a 403."
  [symb value]
  (checkp-with setup/token-match? symb value "Token does not match the setup token."))


(defendpoint POST "/"
  "Special endpoint for creating the first user during setup.
   This endpoint both creates the user AND logs them in and returns a session ID."
  [:as {{:keys [token] {:keys [name engine details is_full_sync]} :database {:keys [first_name last_name email password]} :user {:keys [allow_tracking site_name]} :prefs} :body, :as request}]
  {token      [Required SetupToken]
   site_name  [Required NonEmptyString]
   first_name [Required NonEmptyString]
   last_name  [Required NonEmptyString]
   email      [Required Email]
   password   [Required ComplexPassword]}
  ;; Call (metabase.core/site-url request) to set the Site URL setting if it's not already set
  (@(ns-resolve 'metabase.core 'site-url) request)
  ;; Now create the user
  (let [session-id (str (java.util.UUID/randomUUID))
        new-user   (ins User
                     :email        email
                     :first_name   first_name
                     :last_name    last_name
                     :password     (str (java.util.UUID/randomUUID))
                     :is_superuser true)]
    ;; this results in a second db call, but it avoids redundant password code so figure it's worth it
    (set-user-password (:id new-user) password)
    ;; set a couple preferences
    (setting/set :site-name site_name)
    (setting/set :admin-email email)
    (setting/set :anon-tracking-enabled (or allow_tracking "true"))
    ;; setup database (if needed)
    (when (driver/is-engine? engine)
      (->> (ins Database :name name :engine engine :details details :is_full_sync (if-not (nil? is_full_sync) is_full_sync
                                                                                                              true))
           (events/publish-event :database-create)))
    ;; clear the setup token now, it's no longer needed
    (setup/token-clear)
    ;; then we create a session right away because we want our new user logged in to continue the setup process
    (ins Session
      :id session-id
      :user_id (:id new-user))
    ;; notify that we've got a new user in the system AND that this user logged in
    (events/publish-event :user-create {:user_id (:id new-user)})
    (events/publish-event :user-login {:user_id (:id new-user) :session_id session-id})
    {:id session-id}))


(defendpoint POST "/validate"
  "Validate that we can connect to a database given a set of details."
  [:as {{{:keys [engine] {:keys [host port] :as details} :details} :details token :token} :body}]
  {token      [Required SetupToken]
   engine     [Required DBEngine]}
  (let [engine           (keyword engine)
        details          (assoc details :engine engine)
        response-invalid (fn [field m] {:status 400 :body (if (= :general field)
                                                            {:message m}
                                                            {:errors {field m}})})]
    (try
      (cond
        (driver/can-connect-with-details? engine details :rethrow-exceptions) {:valid true}
        (and host port (u/host-port-up? host port))                           (response-invalid :dbname  (format "Connection to '%s:%d' successful, but could not connect to DB." host port))
        (and host (u/host-up? host))                                          (response-invalid :port    (format "Connection to '%s' successful, but port %d is invalid." port))
        host                                                                  (response-invalid :host    (format "'%s' is not reachable" host))
        :else                                                                 (response-invalid :general "Unable to connect to database."))
      (catch Throwable e
        (response-invalid :general (.getMessage e))))))

(define-routes)
