(ns metabase.middleware.session
  "Ring middleware related to session (binding current user and permissions)."
  (:require [metabase
             [config :as config]
             [db :as mdb]
             [public-settings :as public-settings]]
            [metabase.api.common :refer [*current-user* *current-user-id* *current-user-permissions-set*
                                         *is-superuser?*]]
            [metabase.core.initialization-status :as init-status]
            [metabase.models
             [session :refer [Session]]
             [user :as user :refer [User]]]
            [ring.util.response :as resp]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.net.URL
           java.util.UUID
           org.joda.time.DateTime))

;; How do authenticated API requests work? Metabase first looks for a cookie called `metabase.SESSION`. This is the
;; normal way of doing things; this cookie gets set automatically upon login. `metabase.SESSION` is an HttpOnly
;; cookie and thus can't be viewed by FE code.
;;
;; If that cookie is isn't present, we look for the `metabase.SESSION_ID`, which is the old session cookie set in
;; 0.31.x and older. Unlike `metabase.SESSION`, this cookie was set directly by the frontend and thus was not
;; HttpOnly; for 0.32.x we'll continue to accept it rather than logging every one else out on upgrade. (We've
;; switched to a new Cookie name for 0.32.x because the new cookie includes a `path` attribute, thus browsers consider
;; it to be a different Cookie; Ring cookie middleware does not handle multiple cookies with the same name.)
;;
;; Finally we'll check for the presence of a `X-Metabase-Session` header. If that isn't present, you don't have a
;; Session ID and thus are definitely not authenticated
(def ^:private ^String metabase-session-cookie        "metabase.SESSION")
(def ^:private ^String metabase-legacy-session-cookie "metabase.SESSION_ID") ; this can be removed in 0.33.x
(def ^:private ^String metabase-session-header        "x-metabase-session")

(defn- clear-cookie [response cookie-name]
  (resp/set-cookie response cookie-name nil {:expires (DateTime. 0)}))

(defn- wrap-body-if-needed
  "You can't add a cookie (by setting the `:cookies` key of a response) if the response is an unwrapped JSON response;
  wrap `response` if needed."
  [response]
  (if (and (map? response) (contains? response :body))
    response
    {:body response, :status 200}))

(s/defn set-session-cookie
  "Add a `Set-Cookie` header to `response` to persist the Metabase session."
  [response, session-id :- UUID]
  (-> response
      wrap-body-if-needed
      (clear-cookie metabase-legacy-session-cookie)
      (resp/set-cookie
       metabase-session-cookie
       (str session-id)
       (merge
        {:same-site :lax
         :http-only true
         :path      "/api"
         :max-age   (config/config-int :max-session-age)}
        ;; If Metabase is running over HTTPS (hopefully always except for local dev instances) then make sure to
        ;; make this cookie HTTPS-only
        (when (some-> (public-settings/site-url) URL. .getProtocol (= "https"))
          {:secure true})))))

(defn clear-session-cookie
  "Add a header to `response` to clear the current Metabase session cookie."
  [response]
  (-> response
      wrap-body-if-needed
      (clear-cookie metabase-session-cookie)
      (clear-cookie metabase-legacy-session-cookie)))

(defn- wrap-session-id* [{:keys [cookies headers] :as request}]
  (let [session-id (or (get-in cookies [metabase-session-cookie :value])
                       (get-in cookies [metabase-legacy-session-cookie :value])
                       (headers metabase-session-header))]
    (if (seq session-id)
      (assoc request :metabase-session-id session-id)
      request)))

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
