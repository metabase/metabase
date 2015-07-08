(ns metabase.middleware.auth
  "Middleware for dealing with authentication and session management."
  (:require [korma.core :as k]
            [metabase.config :as config]
            [metabase.db :refer [sel]]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            (metabase.models [session :refer [Session]]
                             [user :refer [User current-user-fields]])))


(def ^:const metabase-session-cookie "metabase.SESSION_ID")
(def ^:const metabase-session-header "x-metabase-session")
(def ^:const metabase-api-key-header "x-metabase-apikey")

(def ^:const response-unauthentic {:status 401 :body "Unauthenticated"})
(def ^:const response-forbidden {:status 403 :body "Forbidden"})


(defn wrap-session-id
  "Middleware that sets the `:metabase-session-id` keyword on the request if a session id can be found.

   We first check the request :cookies for `metabase.SESSION_ID`, then if no cookie is found we look in the
   http headers for `X-METABASE-SESSION`.  If neither is found then then no keyword is bound to the request."
  [handler]
  (fn [{:keys [cookies headers] :as request}]
    (if-let [session-id (or (get-in cookies [metabase-session-cookie :value]) (headers metabase-session-header))]
      ;; alternatively we could always associate the keyword and just let it be nil if there is no value
      (handler (assoc request :metabase-session-id session-id))
      (handler request))))

(defn wrap-current-user-id
  "Add `:metabase-user-id` to the request if a valid session token was passed."
  [handler]
  (fn [{:keys [metabase-session-id] :as request}]
    ;; TODO - what kind of validations can we do on the sessionid to make sure it's safe to handle?  str?  alphanumeric?
    (handler (or (when metabase-session-id
                   (when-let [session (first (k/select Session
                                                       ;; NOTE: we join with the User table and ensure user.is_active = true
                                                       (k/with User (k/where {:is_active true}))
                                                       (k/fields :created_at :user_id)
                                                       (k/where {:id metabase-session-id})))]
                     (let [session-age-ms (- (System/currentTimeMillis) (.getTime ^java.util.Date (get session :created_at (java.util.Date. 0))))]
                       ;; If the session exists and is not expired (max-session-age > session-age) then validation is good
                       (when (and session (> (config/config-int :max-session-age) (quot session-age-ms 60000)))
                         (assoc request :metabase-user-id (:user_id session))))))
                 request))))


(defn enforce-authentication
  "Middleware that returns a 401 response if REQUEST has no associated `:metabase-user-id`."
  [handler]
  (fn [{:keys [metabase-user-id] :as request}]
    (if metabase-user-id
      (handler request)
      response-unauthentic)))


(defmacro sel-current-user [current-user-id]
  `(sel :one [User ~@current-user-fields]
     :id ~current-user-id))


(defn bind-current-user
  "Middleware that binds `metabase.api.common/*current-user*` and `*current-user-id*`

   *current-user-id* int ID or nil of user associated with request
   *current-user*    delay that returns current user (or nil) from DB"
  [handler]
  (fn [request]
    (if-let [current-user-id (:metabase-user-id request)]
      (binding [*current-user-id* current-user-id
                *current-user*    (delay (sel-current-user current-user-id))]
        (handler request))
      (handler request))))


(defn wrap-api-key
  "Middleware that sets the :metabase-api-key keyword on the request if a valid API Key can be found.

   We check the request headers for `X-METABASE-APIKEY` and if it's not found then then no keyword is bound to the request."
  [handler]
  (fn [{:keys [headers] :as request}]
    (if-let [api-key (headers metabase-api-key-header)]
      (handler (assoc request :metabase-api-key api-key))
      (handler request))))


(defn enforce-api-key
  "Middleware that enforces validation of the client via API Key, cancelling the request processing if the check fails.

   Validation is handled by first checking for the presence of the :metabase-api-key on the request.  If the api key
   is available then we validate it by checking it against the configured :mb-api-key value set in our global config.

   If the request :metabase-api-key matches the configured :mb-api-key value then the request continues, otherwise we
   reject the request and return a 403 Forbidden response."
  [handler]
  (fn [{:keys [metabase-api-key] :as request}]
    (if (= (config/config-str :mb-api-key) metabase-api-key)
      (handler request)
      ;; default response is 403
      response-forbidden)))
