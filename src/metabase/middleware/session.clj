(ns metabase.middleware.session
  "Ring middleware related to session (binding current user and permissions)."
  (:require [metabase
             [config :as config]
             [db :as mdb]]
            [metabase.api.common :refer [*current-user* *current-user-id* *current-user-permissions-set* *is-superuser?*]]
            [metabase.core.initialization-status :as init-status]
            [metabase.models
             [session :refer [Session]]
             [user :as user :refer [User]]]
            [toucan.db :as db]))

(def ^:private ^:const ^String metabase-session-cookie "metabase.SESSION_ID")
(def ^:private ^:const ^String metabase-session-header "x-metabase-session")

(defn- wrap-session-id* [{:keys [cookies headers] :as request}]
  (if-let [session-id (or (get-in cookies [metabase-session-cookie :value])
                          (headers metabase-session-header))]
    (assoc request :metabase-session-id session-id)
    request))

(defn wrap-session-id
  "Middleware that sets the `:metabase-session-id` keyword on the request if a session id can be found.

   We first check the request :cookies for `metabase.SESSION_ID`, then if no cookie is found we look in the
   http headers for `X-METABASE-SESSION`.  If neither is found then then no keyword is bound to the request."
  [handler]
  (fn [request respond raise]
    (handler (wrap-session-id* request) respond raise)))

(defn- session-with-id
  "Fetch a session with SESSION-ID, and include the User ID and superuser status associated with it."
  [session-id]
  (db/select-one [Session :created_at :user_id (db/qualify User :is_superuser)]
    (mdb/join [Session :user_id] [User :id])
    (db/qualify User :is_active) true
    (db/qualify Session :id) session-id))

(defn- session-age-ms [session]
  (- (System/currentTimeMillis) (or (when-let [^java.util.Date created-at (:created_at session)]
                                      (.getTime created-at))
                                    0)))

(defn- session-age-minutes [session]
  (quot (session-age-ms session) 60000))

(defn- session-expired? [session]
  (> (session-age-minutes session)
     (config/config-int :max-session-age)))

(defn- current-user-info-for-session
  "Return User ID and superuser status for Session with SESSION-ID if it is valid and not expired."
  [session-id]
  (when (and session-id (init-status/complete?))
    (when-let [session (session-with-id session-id)]
      (when-not (session-expired? session)
        {:metabase-user-id (:user_id session)
         :is-superuser?    (:is_superuser session)}))))

(defn- wrap-current-user-id* [{:keys [metabase-session-id], :as request}]
  (merge request (current-user-info-for-session metabase-session-id)))

(defn wrap-current-user-id
  "Add `:metabase-user-id` to the request if a valid session token was passed."
  [handler]
  (fn [request respond raise]
    (handler (wrap-current-user-id* request) respond raise)))


(def ^:private current-user-fields
  (into [User] user/admin-or-self-visible-columns))

(defn- find-user [user-id]
  (db/select-one current-user-fields, :id user-id))

(defn- do-with-current-user [request f]
  (if-let [current-user-id (:metabase-user-id request)]
    (binding [*current-user-id*              current-user-id
              *is-superuser?*                (:is-superuser? request)
              *current-user*                 (delay (find-user current-user-id))
              *current-user-permissions-set* (delay (user/permissions-set current-user-id))]
      (f))
    (f)))

(defmacro ^:private with-current-user [request & body]
  `(do-with-current-user ~request (fn [] ~@body)))

(defn bind-current-user
  "Middleware that binds `metabase.api.common/*current-user*`, `*current-user-id*`, `*is-superuser?*`, and
  `*current-user-permissions-set*`.

  *  `*current-user-id*`             int ID or nil of user associated with request
  *  `*current-user*`                delay that returns current user (or nil) from DB
  *  `*is-superuser?*`               Boolean stating whether current user is a superuser.
  *  `current-user-permissions-set*` delay that returns the set of permissions granted to the current user from DB"
  [handler]
  (fn [request respond raise]
    (with-current-user request
      (handler request respond raise))))
