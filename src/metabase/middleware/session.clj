(ns metabase.middleware.session
  "Ring middleware related to session (binding current user and permissions)."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase
             [config :as config]
             [db :as mdb]]
            [metabase.api.common :refer [*current-user* *current-user-id* *current-user-permissions-set* *is-superuser?*]]
            [metabase.core.initialization-status :as init-status]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models
             [session :refer [Session]]
             [user :as user :refer [User]]]
            [metabase.util.i18n :as i18n]
            [ring.util.response :as resp]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.util.UUID))

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
  (resp/set-cookie response cookie-name nil {:expires "Thu, 1 Jan 1970 00:00:00 GMT", :path "/"}))

(defn- wrap-body-if-needed
  "You can't add a cookie (by setting the `:cookies` key of a response) if the response is an unwrapped JSON response;
  wrap `response` if needed."
  [response]
  (if (and (map? response) (contains? response :body))
    response
    {:body response, :status 200}))

(defn https-request?
  "True if the original request made by the frontend client (i.e., browser) was made over HTTPS.

  In many production instances, a reverse proxy such as an ELB or nginx will handle SSL termination, and the actual
  request handled by Jetty will be over HTTP."
  [{{:strs [x-forwarded-proto x-forwarded-protocol x-url-scheme x-forwarded-ssl front-end-https origin]} :headers
    :keys                                                                                                [scheme]}]
  (cond
    ;; If `X-Forwarded-Proto` is present use that. There are several alternate headers that mean the same thing. See
    ;; https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto
    (or x-forwarded-proto x-forwarded-protocol x-url-scheme)
    (= "https" (str/lower-case (or x-forwarded-proto x-forwarded-protocol x-url-scheme)))

    ;; If none of those headers are present, look for presence of `X-Forwarded-Ssl` or `Frontend-End-Https`, which
    ;; will be set to `on` if the original request was over HTTPS.
    (or x-forwarded-ssl front-end-https)
    (= "on" (str/lower-case (or x-forwarded-ssl front-end-https)))

    ;; If none of the above are present, we are most not likely being accessed over a reverse proxy. Still, there's a
    ;; good chance `Origin` will be present because it should be sent with `POST` requests, and most auth requests are
    ;; `POST`. See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin
    origin
    (str/starts-with? (str/lower-case origin) "https")

    ;; Last but not least, if none of the above are set (meaning there are no proxy servers such as ELBs or nginx in
    ;; front of us), we can look directly at the scheme of the request sent to Jetty.
    scheme
    (= scheme :https)))

(s/defn set-session-cookie
  "Add a `Set-Cookie` header to `response` to persist the Metabase session."
  [request response, session-id :- UUID]
  (-> response
      wrap-body-if-needed
      (clear-cookie metabase-legacy-session-cookie)
      ;; See also https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie and `ring.middleware.cookies`
      (resp/set-cookie
       metabase-session-cookie
       (str session-id)
       (merge
        {:same-site :lax
         :http-only true
         :path      "/"}
        ;; If the env var `MB_SESSION_COOKIES=true`, do not set the `Max-Age` directive; cookies with no `Max-Age` and
        ;; no `Expires` directives are session cookies, and are deleted when the browser is closed
        ;;
        ;; See https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#Session_cookies
        (when-not (config/config-bool :mb-session-cookies)
          ;; max-session age-is in minutes; Max-Age= directive should be in seconds
          {:max-age (* 60 (config/config-int :max-session-age))})
        ;; If the authentication request request was made over HTTPS (hopefully always except for local dev instances)
        ;; add `Secure` attribute so the cookie is only sent over HTTPS.
        (when (https-request? request)
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

;; Because this query runs on every single API request it's worth it to optimize it a bit and only compile it to SQL
;; once rather than every time
(def ^:private ^{:arglists '([db-type max-age-minutes])} session-with-id-query
  (memoize
   (fn [db-type max-age-minutes]
     (vec
      (db/honeysql->sql
       {:select    [[:session.user_id :metabase-user-id]
                    [:user.is_superuser :is-superuser?]
                    [:user.locale :user-locale]]
        :from      [[Session :session]]
        :left-join [[User :user] [:= :session.user_id :user.id]]
        :where     [:and
                    [:= :user.is_active true]
                    [:= :session.id (hsql/raw "?")]
                    (let [oldest-allowed (sql.qp/add-interval-honeysql-form db-type :%now (- max-age-minutes) :minute)]
                      [:> :session.created_at oldest-allowed])]
        :limit     1})))))

(defn- current-user-info-for-session
  "Return User ID and superuser status for Session with `session-id` if it is valid and not expired."
  [session-id]
  (when (and session-id (init-status/complete?))
    (first
     (jdbc/query (db/connection) (conj (session-with-id-query (mdb/db-type) (config/config-int :max-session-age))
                                       session-id)))))

;; if someone passes in an `X-Metabase-Locale` header, use that for `user-locale` (overriding any value in the DB)
(defn- merge-current-user-info [{:keys [metabase-session-id], {:strs [x-metabase-locale]} :headers, :as request}]
  (merge
   request
   (current-user-info-for-session metabase-session-id)
   (when x-metabase-locale
     (log/tracef "Found X-Metabase-Locale header: using %s as user locale" (pr-str x-metabase-locale))
     {:user-locale (i18n/normalized-locale-string x-metabase-locale)})))

(defn wrap-current-user-info
  "Add `:metabase-user-id`, `:is-superuser?`, and `:user-locale` to the request if a valid session token was passed."
  [handler]
  (fn [request respond raise]
    (handler (merge-current-user-info request) respond raise)))

(def ^:private current-user-fields
  (into [User] user/admin-or-self-visible-columns))

(defn- find-user [user-id]
  (when user-id
    (db/select-one current-user-fields, :id user-id)))

(defn do-with-current-user
  "Impl for `with-current-user`."
  [{:keys [metabase-user-id is-superuser? user-locale]} thunk]
  (binding [*current-user-id*              metabase-user-id
            i18n/*user-locale*             user-locale
            *is-superuser?*                (boolean is-superuser?)
            *current-user*                 (delay (find-user metabase-user-id))
            *current-user-permissions-set* (delay (some-> metabase-user-id user/permissions-set))]
    (thunk)))

(defmacro ^:private with-current-user-for-request
  [request & body]
  `(do-with-current-user ~request (fn [] ~@body)))

(defn bind-current-user
  "Middleware that binds `metabase.api.common/*current-user*`, `*current-user-id*`, `*is-superuser?*`, and
  `*current-user-permissions-set*`.

  *  `*current-user-id*`                int ID or nil of user associated with request
  *  `*current-user*`                   delay that returns current user (or nil) from DB
  *  `metabase.util.i18n/*user-locale*` ISO locale code e.g `en` or `en-US` to use for the current User. Overrides `site-locale` if set.
  *  `*is-superuser?*`                  Boolean stating whether current user is a superuser.
  *  `current-user-permissions-set*`    delay that returns the set of permissions granted to the current user from DB"
  [handler]
  (fn [request respond raise]
    (with-current-user-for-request request
      (handler request respond raise))))

(defmacro with-current-user
  "Execute code in body with User with `current-user-id` bound as the current user. (This is not used in the middleware
  itself but elsewhere where we want to simulate a User context, such as when rendering Pulses or in tests.) "
  {:style/indent 1}
  [current-user-id & body]
  `(do-with-current-user
    (db/select-one [User [:id :metabase-user-id] [:is_superuser :is-superuser?] [:locale :user-locale]] :id ~current-user-id)
    (fn [] ~@body)))
