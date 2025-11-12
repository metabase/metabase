(ns metabase.server.middleware.session
  "Ring middleware related to session and API-key based authentication (binding current user and permissions).

  How do authenticated API requests work? There are two main paths to authentication: a session or an API key.

  For session authentication, Metabase first looks for a cookie called `metabase.SESSION`. This is the normal way of
  doing things; this cookie gets set automatically upon login. `metabase.SESSION` is an HttpOnly cookie and thus can't
  be viewed by FE code. If the session is a full-app embedded session, then the cookie is `metabase.EMBEDDED_SESSION`
  instead.

  Finally we'll check for the presence of a `X-Metabase-Session` header. If that isn't present, you don't have a
  Session ID.

  The second main path to authentication is an API key. For this, we look at the `X-Api-Key` header. If that matches
  an ApiKey in our database, you'll be authenticated as that ApiKey's associated User."
  (:require
   [java-time.api :as t]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.request.core :as request]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                wrap-session-key                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^String metabase-session-header "x-metabase-session")

(defmulti ^:private wrap-session-key-with-strategy
  "Attempt to add `:metabase-session-key` to `request` based on a specific strategy. Return modified request if
  successful or `nil` if we should try another strategy."
  {:arglists '([strategy request])}
  (fn [strategy _]
    strategy))

(defmethod wrap-session-key-with-strategy :embedded-cookie
  [_ {:keys [cookies headers], :as request}]
  (when-let [session (get-in cookies [request/metabase-embedded-session-cookie :value])]
    (when-let [anti-csrf-token (get headers request/anti-csrf-token-header)]
      (assoc request :metabase-session-key session, :anti-csrf-token anti-csrf-token :metabase-session-type :full-app-embed))))

(defmethod wrap-session-key-with-strategy :normal-cookie
  [_ {:keys [cookies], :as request}]
  (when-let [session (get-in cookies [request/metabase-session-cookie :value])]
    (when (seq session)
      (assoc request :metabase-session-key session :metabase-session-type :normal))))

(defmethod wrap-session-key-with-strategy :header
  [_ {:keys [headers], :as request}]
  (when-let [session (get headers metabase-session-header)]
    (when (seq session)
      (assoc request :metabase-session-key session))))

(defmethod wrap-session-key-with-strategy :best
  [_ request]
  (some
   (fn [strategy]
     (wrap-session-key-with-strategy strategy request))
   [:embedded-cookie :normal-cookie :header]))

(defn wrap-session-key
  "Middleware that sets the `:metabase-session-key` keyword on the request if a session id can be found.
  We first check the request :cookies for `metabase.SESSION`, then if no cookie is found we look in the http headers
  for `X-METABASE-SESSION`. If neither is found then no keyword is bound to the request."
  [handler]
  (fn [request respond raise]
    (let [request (or (wrap-session-key-with-strategy :best request)
                      request)]
      (handler request respond raise))))

(defn- merge-current-user-info
  [{{:strs [x-metabase-locale] :as headers} :headers, :as request}]
  (merge
   request
   (when-let [{:keys [user-data]} (or (auth-identity/authenticate :provider/session request)
                                      (auth-identity/authenticate :provider/api-key headers))]
     user-data)
   (when x-metabase-locale
     (log/tracef "Found X-Metabase-Locale header: using %s as user locale" (pr-str x-metabase-locale))
     {:user-locale (i18n/normalized-locale-string x-metabase-locale)})))

(defn wrap-current-user-info
  "Add `:metabase-user-id`, `:is-superuser?`, `:is-group-manager?` and `:user-locale` to the request if a valid session
  token OR a valid API key was passed."
  [handler]
  (fn [request respond raise]
    (handler (merge-current-user-info request) respond raise)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               bind-current-user                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmacro ^:private with-current-user-for-request
  [request & body]
  `(request/do-with-current-user ~request (fn [] ~@body)))

(defn bind-current-user
  "Middleware that binds [[metabase.api.common/*current-user*]], [[*current-user-id*]], [[*is-superuser?*]],
  [[*current-user-permissions-set*]], and [[metabase.settings.models.setting/*user-local-values*]].

  *  `*current-user-id*`                int ID or nil of user associated with request
  *  `*current-user*`                   delay that returns current user (or nil) from DB
  *  `metabase.util.i18n/*user-locale*` ISO locale code e.g `en` or `en-US` to use for the current User.
                                        Overrides `site-locale` if set.
  *  `*is-superuser?*`                  Boolean stating whether current user is a superuser.
  *  `*is-group-manager?*`              Boolean stating whether current user is a group manager of at least one group.
  *  `*current-user-permissions-set*`   delay that returns the set of permissions granted to the current user from DB
  *  `*user-local-values*`              atom containing a map of user-local settings and values for the current user"
  [handler]
  (fn [request respond raise]
    (with-current-user-for-request request
      (handler request respond raise))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              reset-cookie-timeout                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn reset-session-timeout*
  "Implementation for `reset-cookie-timeout` respond handler."
  [request response request-time]
  (if (and
       ;; Only reset the timeout if the request includes a session cookie.
       (:metabase-session-type request)
       ;; Do not reset the timeout if it is being updated in the response, e.g. if it is being deleted
       (not (contains? (:cookies response) request/metabase-session-timeout-cookie)))
    (request/set-session-timeout-cookie response request (:metabase-session-type request) request-time)
    response))

(defn reset-session-timeout
  "Middleware that resets the expiry date on session cookies according to the session-timeout setting.
   Will not change anything if the session-timeout setting is nil, or the timeout cookie has already expired."
  [handler]
  (fn [request respond raise]
    (let [;; The expiry time for the cookie is relative to the time the request is received, rather than the time of the
          ;; response.
          request-time (t/zoned-date-time (t/zone-id "GMT"))]
      (handler request
               (fn [response]
                 (respond (reset-session-timeout* request response request-time)))
               raise))))
