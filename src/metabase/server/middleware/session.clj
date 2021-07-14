(ns metabase.server.middleware.session
  "Ring middleware related to session (binding current user and permissions)."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.api.common :refer [*current-user* *current-user-id* *current-user-permissions-set* *is-superuser?*]]
            [metabase.config :as config]
            [metabase.core.initialization-status :as init-status]
            [metabase.db :as mdb]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models.session :refer [Session]]
            [metabase.models.user :as user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.server.request.util :as request.u]
            [metabase.util :as u]
            [metabase.util.i18n :as i18n :refer [deferred-trs tru]]
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

(def ^:private ^String metabase-session-cookie          "metabase.SESSION")
(def ^:private ^String metabase-embedded-session-cookie "metabase.EMBEDDED_SESSION")
(def ^:private ^String anti-csrf-token-header           "x-metabase-anti-csrf-token")

(defn- clear-cookie [response cookie-name]
  (resp/set-cookie response cookie-name nil {:expires "Thu, 1 Jan 1970 00:00:00 GMT", :path "/"}))

(defn- wrap-body-if-needed
  "You can't add a cookie (by setting the `:cookies` key of a response) if the response is an unwrapped JSON response;
  wrap `response` if needed."
  [response]
  (if (and (map? response) (contains? response :body))
    response
    {:body response, :status 200}))

(defn clear-session-cookie
  "Add a header to `response` to clear the current Metabase session cookie."
  [response]
  (reduce clear-cookie (wrap-body-if-needed response) [metabase-session-cookie metabase-embedded-session-cookie]))

(defn- use-permanent-cookies?
  "Check if we should use permanent cookies for a given request, which are not cleared when a browser sesion ends."
  [request]
  (if (public-settings/session-cookies)
    ;; Disallow permanent cookies if MB_SESSION_COOKIES is set
    false
    ;; Otherwise check whether the user selected "remember me" during login
    (get-in request [:body :remember])))

(defmulti set-session-cookie
  "Add an appropriate cookie to persist a newly created Session to `response`."
  {:arglists '([request response session])}
  (fn [_ _ {session-type :type}] (keyword session-type)))

(defmethod set-session-cookie :default
  [_ _ session]
  (throw (ex-info (str (tru "Invalid session. Expected an instance of Session."))
           {:session session})))

(s/defmethod set-session-cookie :normal
  [request response {session-uuid :id} :- {:id (s/cond-pre UUID u/uuid-regex), s/Keyword s/Any}]
  (let [response       (wrap-body-if-needed response)
        cookie-options (merge
                        {:same-site config/mb-session-cookie-samesite
                         :http-only true
                         ;; TODO - we should set `site-path` as well. Don't want to enable this yet so we don't end
                         ;; up breaking things
                         :path      "/" #_ (site-path)}
                        ;; If permanent cookies should be used, set the `Max-Age` directive; cookies with no
                        ;; `Max-Age` and no `Expires` directives are session cookies, and are deleted when the
                        ;; browser is closed.
                        ;; See https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#define_the_lifetime_of_a_cookie
                        (when (use-permanent-cookies? request)
                          ;; max-session age-is in minutes; Max-Age= directive should be in seconds
                          {:max-age (* 60 (config/config-int :max-session-age))})
                        ;; If the authentication request request was made over HTTPS (hopefully always except for
                        ;; local dev instances) add `Secure` attribute so the cookie is only sent over HTTPS.
                        (when (request.u/https? request)
                          {:secure true})
                        (when (= config/mb-session-cookie-samesite :none)
                          (log/warn
                           (str (deferred-trs "Session cookie's SameSite is configured to \"None\", but site is")
                                (deferred-trs "served over an insecure connection. Some browsers will reject ")
                                (deferred-trs "cookies under these conditions. ")
                                (deferred-trs "https://www.chromestatus.com/feature/5633521622188032")))))]
    (resp/set-cookie response metabase-session-cookie (str session-uuid) cookie-options)))

(s/defmethod set-session-cookie :full-app-embed
  [request response {session-uuid :id, anti-csrf-token :anti_csrf_token} :- {:id       (s/cond-pre UUID u/uuid-regex)
                                                                             s/Keyword s/Any}]
  (let [response       (wrap-body-if-needed response)
        cookie-options (merge
                        {:http-only true
                         :path      "/"}
                        (when (request.u/https? request)
                          {:secure true}))]
    (-> response
        (resp/set-cookie metabase-embedded-session-cookie (str session-uuid) cookie-options)
        (assoc-in [:headers anti-csrf-token-header] anti-csrf-token))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                wrap-session-id                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^String metabase-session-header "x-metabase-session")

(defmulti ^:private wrap-session-id-with-strategy
  "Attempt to add `:metabase-session-id` to `request` based on a specific strategy. Return modified request if
  successful or `nil` if we should try another strategy."
  {:arglists '([strategy request])}
  (fn [strategy _]
    strategy))

(defmethod wrap-session-id-with-strategy :embedded-cookie
  [_ {:keys [cookies headers], :as request}]
  (when-let [session (get-in cookies [metabase-embedded-session-cookie :value])]
    (when-let [anti-csrf-token (get headers anti-csrf-token-header)]
      (assoc request :metabase-session-id session, :anti-csrf-token anti-csrf-token))))

(defmethod wrap-session-id-with-strategy :normal-cookie
  [_ {:keys [cookies], :as request}]
  (when-let [session (get-in cookies [metabase-session-cookie :value])]
    (when (seq session)
      (assoc request :metabase-session-id session))))

(defmethod wrap-session-id-with-strategy :header
  [_ {:keys [headers], :as request}]
  (when-let [session (get headers metabase-session-header)]
    (when (seq session)
      (assoc request :metabase-session-id session))))

(defmethod wrap-session-id-with-strategy :best
  [_ request]
  (some
   (fn [strategy]
     (wrap-session-id-with-strategy strategy request))
   [:embedded-cookie :normal-cookie :header]))

(defn wrap-session-id
  "Middleware that sets the `:metabase-session-id` keyword on the request if a session id can be found.
   We first check the request :cookies for `metabase.SESSION`, then if no cookie is found we look in the http headers
  for `X-METABASE-SESSION`. If neither is found then then no keyword is bound to the request."
  [handler]
  (fn [request respond raise]
    (let [request (or (wrap-session-id-with-strategy :best request)
                      request)]
      (handler request respond raise))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             wrap-current-user-info                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Because this query runs on every single API request it's worth it to optimize it a bit and only compile it to SQL
;; once rather than every time
(def ^:private ^{:arglists '([db-type max-age-minutes session-type])} session-with-id-query
  (memoize
   (fn [db-type max-age-minutes session-type]
     (first
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
                      [:> :session.created_at oldest-allowed])
                    [:= :session.anti_csrf_token (case session-type
                                                   :normal         nil
                                                   :full-app-embed "?")]]
        :limit     1})))))

(defn- current-user-info-for-session
  "Return User ID and superuser status for Session with `session-id` if it is valid and not expired."
  [session-id anti-csrf-token]
  (when (and session-id (init-status/complete?))
    (let [sql    (session-with-id-query (mdb/db-type)
                                        (config/config-int :max-session-age)
                                        (if (seq anti-csrf-token) :full-app-embed :normal))
          params (concat [session-id]
                         (when (seq anti-csrf-token)
                           [anti-csrf-token]))]
      (first (jdbc/query (db/connection) (cons sql params))))))

(defn- merge-current-user-info
  [{:keys [metabase-session-id anti-csrf-token], {:strs [x-metabase-locale]} :headers, :as request}]9
  (merge
   request
   (current-user-info-for-session metabase-session-id anti-csrf-token)
   (when x-metabase-locale
     (log/tracef "Found X-Metabase-Locale header: using %s as user locale" (pr-str x-metabase-locale))
     {:user-locale (i18n/normalized-locale-string x-metabase-locale)})))

(defn wrap-current-user-info
  "Add `:metabase-user-id`, `:is-superuser?`, and `:user-locale` to the request if a valid session token was passed."
  [handler]
  (fn [request respond raise]
    (handler (merge-current-user-info request) respond raise)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               bind-current-user                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

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
  *  `metabase.util.i18n/*user-locale*` ISO locale code e.g `en` or `en-US` to use for the current User.
                                        Overrides `site-locale` if set.
  *  `*is-superuser?*`                  Boolean stating whether current user is a superuser.
  *  `current-user-permissions-set*`    delay that returns the set of permissions granted to the current user from DB"
  [handler]
  (fn [request respond raise]
    (with-current-user-for-request request
      (handler request respond raise))))

(defn with-current-user-fetch-user-for-id
  "Part of the impl for `with-current-user` -- don't use this directly."
  [current-user-id]
  (when current-user-id
    (db/select-one [User [:id :metabase-user-id] [:is_superuser :is-superuser?] [:locale :user-locale]]
      :id current-user-id)))

(defmacro with-current-user
  "Execute code in body with User with `current-user-id` bound as the current user. (This is not used in the middleware
  itself but elsewhere where we want to simulate a User context, such as when rendering Pulses or in tests.) "
  {:style/indent 1}
  [current-user-id & body]
  `(do-with-current-user
    (with-current-user-fetch-user-for-id ~current-user-id)
    (fn [] ~@body)))
