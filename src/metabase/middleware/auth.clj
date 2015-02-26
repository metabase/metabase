(ns metabase.middleware.auth
  "Middleware for dealing with authentication and session management."
  (:require [korma.core :refer :all]
            [metabase.db :refer [sel]]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            (metabase.models [session :refer [Session]]
                             [user :refer [User current-user-fields]])))


(def SESSION_COOKIE "metabase.SESSION_ID")
(def SESSION_HEADER "x-metabase-session")


(defn wrap-sessionid
  "Middleware that sets the :metabase-sessionid keyword on the request if a session id can be found.

   We first check the request :cookies for `metabase.SESSION_ID`, then if no cookie is found we look in the
   http headers for `X-METABASE-SESSION`.  If neither is found then then no keyword is bound to the request."
  [handler]
  (fn [{:keys [cookies headers] :as request}]
    (if-let [session-id (or (get-in cookies [SESSION_COOKIE :value]) (headers SESSION_HEADER))]
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
    (if-let [session (sel :one Session :id metabase-sessionid)]
      ;; TODO - enforce session expiration
      ;; TODO - validate user is_active?
      (handler (assoc request :metabase-userid (:user_id session)))
      {:status 401 :body "Unauthenticated"})))


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
