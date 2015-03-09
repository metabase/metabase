(ns metabase.middleware.auth
  "Middleware for dealing with authentication and session management."
  (:require [korma.core :as korma]
            [metabase.config :as config]
            [metabase.db :refer [sel]]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            (metabase.models [session :refer [Session]]
                             [user :refer [User current-user-fields]])))


(def metabase-session-cookie "metabase.SESSION_ID")
(def metabase-session-header "x-metabase-session")

(def response-unauthentic {:status 401 :body "Unauthenticated"})


(defn wrap-sessionid
  "Middleware that sets the :metabase-sessionid keyword on the request if a session id can be found.

   We first check the request :cookies for `metabase.SESSION_ID`, then if no cookie is found we look in the
   http headers for `X-METABASE-SESSION`.  If neither is found then then no keyword is bound to the request."
  [handler]
  (fn [{:keys [cookies headers] :as request}]
    (if-let [session-id (or (get-in cookies [metabase-session-cookie :value]) (headers metabase-session-header))]
      ;; alternatively we could always associate the keyword and just let it be nil if there is no value
      (handler (assoc request :metabase-sessionid session-id))
      (handler request))))


(defn enforce-authentication
  "Middleware that enforces authentication of the client, cancelling the request processing if auth fails.

   Authentication is determined by validating the :metabase-sessionid on the request against the db session list.
   If the session is valid then we associate a :metabase-userid on the request and carry on, but if the validation
   fails then we return an HTTP 401 response indicating that the client is not authentic.

   NOTE: we are purposely not associating the full current user object here so that we can be modular."
  [handler]
  (fn [{:keys [metabase-sessionid] :as request}]
    ;; TODO - what kind of validations can we do on the sessionid to make sure it's safe to handle?  str?  alphanumeric?
    (let [session (first (korma/select Session
                           ;; NOTE: we join with the User table and ensure user.is_active = true
                           (korma/with User (korma/where {:is_active true}))
                           (korma/fields :created_at :user_id)
                           (korma/where {:id metabase-sessionid})))
          session-age-ms (- (System/currentTimeMillis) (.getTime ^java.util.Date (get session :created_at (java.util.Date. 0))))]
      ;; If the session exists and is not expired (max-session-age > session-age) then validation is good
      (if (and session (> (config/config-int :max-session-age) (quot session-age-ms 60000)))
        (handler (assoc request :metabase-userid (:user_id session)))
        ;; default response is 401
        response-unauthentic))))


(defmacro sel-current-user [current-user-id]
  `(sel :one [User ~@current-user-fields]
     :id ~current-user-id))


(defn bind-current-user
  "Middleware that binds `metabase.api.common/*current-user*` and `*current-user-id*`

   *current-user-id* int ID or nil of user associated with request
   *current-user*    delay that returns current user (or nil) from DB"
  [handler]
  (fn [request]
    (let [current-user-id (:metabase-userid request)]
      (binding [*current-user-id* current-user-id
                *current-user* (if-not current-user-id (atom nil)
                                                       (delay (sel-current-user current-user-id)))]
        (handler request)))))
