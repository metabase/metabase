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
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.api-keys.core :as api-key]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.request.schema :as request.schema]
   [metabase.session.core :as session]
   [metabase.settings.core :as setting]
   [metabase.tracing.core :as tracing]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.password :as u.password]
   [metabase.util.string :as string]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

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

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             wrap-current-user-info                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Because this query runs on every single API request it's worth it to optimize it a bit and only compile it to SQL
;; once rather than every time
(def ^:private ^{:arglists '([db-type max-age-minutes session-type enable-advanced-permissions? enable-tenants?])} session-with-id-query
  (memoize
   (fn [db-type max-age-minutes session-type enable-advanced-permissions? enable-tenants?]
     (first
      (t2.pipeline/compile*
       (cond-> {:select    [[:session.user_id :metabase-user-id]
                            [:user.is_superuser :is-superuser?]
                            [:user.is_data_analyst :is-data-analyst?]
                            [:user.locale :user-locale]]
                :from      [[:core_session :session]]
                :left-join [[:core_user :user] [:= :session.user_id :user.id]
                            [:tenant] [:= :tenant.id :user.tenant_id]]
                :where     [:and
                            (if enable-tenants?
                              [:or [:= :tenant.id nil] :tenant.is_active]
                              [:= :tenant.id nil])
                            [:= :user.is_active true]
                            [:or [:= :session.id [:raw "?"]] [:= :session.key_hashed [:raw "?"]]]
                            (let [oldest-allowed (case db-type
                                                   :postgres [:-
                                                              [:raw "current_timestamp"]
                                                              [:raw (format "INTERVAL '%d minute'" max-age-minutes)]]
                                                   :h2       [:dateadd
                                                              (h2x/literal "minute")
                                                              [:inline (- max-age-minutes)]
                                                              :%now]
                                                   :mysql    [:date_add
                                                              :%now
                                                              [:raw (format "INTERVAL -%d minute" max-age-minutes)]])]
                              [:> :session.created_at oldest-allowed])
                            [:= :session.anti_csrf_token (case session-type
                                                           :normal         nil
                                                           :full-app-embed [:raw "?"])]]
                :limit     [:inline 1]}
         enable-advanced-permissions?
         (->
          (sql.helpers/select
           [:pgm.is_group_manager :is-group-manager?])
          (sql.helpers/left-join
           [:permissions_group_membership :pgm] [:and
                                                 [:= :pgm.user_id :user.id]
                                                 [:is :pgm.is_group_manager true]]))))))))

;; See above: because this query runs on every single API request (with an API Key) it's worth it to optimize it a bit
;; and only compile it to SQL once rather than every time
(def ^:private ^{:arglists '([enable-advanced-permissions?])} user-data-for-api-key-prefix-query
  (memoize
   (fn [enable-advanced-permissions?]
     (first
      (t2.pipeline/compile*
       (cond-> {:select    [[:api_key.user_id :metabase-user-id]
                            [:api_key.key :api-key]
                            [:user.is_superuser :is-superuser?]
                            [:user.is_data_analyst :is-data-analyst?]
                            [:user.locale :user-locale]]
                :from      :api_key
                :left-join [[:core_user :user] [:= :api_key.user_id :user.id]]
                :where     [:and
                            [:= :user.is_active true]
                            [:= :api_key.key_prefix [:raw "?"]]]
                :limit     [:inline 1]}
         enable-advanced-permissions?
         (->
          (sql.helpers/select
           [:pgm.is_group_manager :is-group-manager?])
          (sql.helpers/left-join
           [:permissions_group_membership :pgm] [:and
                                                 [:= :pgm.user_id :user.id]
                                                 [:is :pgm.is_group_manager true]]))))))))

(defn- valid-session-key?
  "Validates that the given session-key looks like it could be a session id. Returns a 403 if it does not.

  SECURITY NOTE: Because functions will directly compare the session-key against the core_session.id table for
  backwards-compatibility reasons, if this is NOT called before those queries against core_session.id, attackers with
  access to the database can impersonate users by passing the core_session.id as their session cookie"
  [session-key]
  (or (not session-key) (string/valid-uuid? session-key)))

(mu/defn- current-user-info-for-session :- [:maybe ::request.schema/current-user-info]
  "Return User ID and superuser status for Session with `session-key` if it is valid and not expired."
  [session-key anti-csrf-token]
  (when (and session-key (valid-session-key? session-key) (init-status/complete?))
    (let [sql    (session-with-id-query (mdb/db-type)
                                        (config/config-int :max-session-age)
                                        (if (seq anti-csrf-token) :full-app-embed :normal)
                                        (premium-features/enable-advanced-permissions?)
                                        (and (premium-features/enable-tenants?)
                                             (setting/get :use-tenants)))
          params (concat [session-key (session/hash-session-key session-key)]
                         (when (seq anti-csrf-token)
                           [anti-csrf-token]))]
      (some-> (t2/query-one (cons sql params))
              ;; is-group-manager? could return `nil, convert it to boolean so it's guaranteed to be only true/false
              (update :is-group-manager? boolean)))))

(def ^:private api-key-that-should-never-match (str (random-uuid)))
(def ^:private hash-that-should-never-match (u.password/hash-bcrypt "password"))

(defn do-useless-hash
  "Password check that will always fail, used to avoid exposing any info about existing users or API keys via timing
  attacks."
  []
  (u.password/verify-password api-key-that-should-never-match "" hash-that-should-never-match))

(defn- matching-api-key? [{:keys [api-key] :as _user-data} passed-api-key]
  ;; if we get an API key, check the hash against the passed value. If not, don't reveal info via a timing attack - do
  ;; a useless hash, *then* return `false`.
  (if api-key
    (u.password/verify-password passed-api-key "" api-key)
    (do-useless-hash)))

(mu/defn- current-user-info-for-api-key :- [:maybe ::request.schema/current-user-info]
  "Return User ID and superuser status for an API Key with `api-key-id"
  [api-key :- [:maybe :string]]
  (when (and api-key
             (init-status/complete?))
    ;; make sure the API key is valid before we entertain the idea of allowing it.
    (if-let [error (some-> (mr/explain ::api-keys.schema/key.raw api-key)
                           me/humanize
                           pr-str)]
      (do
        ;; 99% sure the error message is not going to include the API key but just to be extra super safe let's not log
        ;; it if the error message includes the key itself.
        (if (str/includes? error api-key)
          (log/error "Ignoring invalid API Key")
          (log/errorf "Ignoring invalid API Key: %s" error))
        nil)
      (let [user-info (-> (t2/query-one (cons (user-data-for-api-key-prefix-query
                                               (premium-features/enable-advanced-permissions?))
                                              [(api-key/prefix api-key)]))
                          (m/update-existing :is-group-manager? boolean))]
        (when (matching-api-key? user-info api-key)
          (-> user-info
              (dissoc :api-key)))))))

(defn- merge-current-user-info
  [{:keys [metabase-session-key anti-csrf-token], {:strs [x-metabase-locale x-api-key]} :headers, :as request}]
  (merge
   request
   (or (current-user-info-for-session metabase-session-key anti-csrf-token)
       (current-user-info-for-api-key x-api-key))
   (when x-metabase-locale
     (log/tracef "Found X-Metabase-Locale header: using %s as user locale" (pr-str x-metabase-locale))
     {:user-locale (i18n/normalized-locale-string x-metabase-locale)})))

(defn wrap-current-user-info
  "Add `:metabase-user-id`, `:is-superuser?`, `:is-group-manager?` and `:user-locale` to the request if a valid session
  token OR a valid API key was passed."
  [handler]
  (fn [request respond raise]
    (let [request' (tracing/with-span :db-app "db-app.session-lookup" {}
                     (merge-current-user-info request))]
      (handler request' respond raise))))

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
