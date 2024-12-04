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
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase.api.common
    :as api
    :refer [*current-user* *current-user-id* *current-user-permissions-set* *is-group-manager?* *is-superuser?*]]
   [metabase.config :as config]
   [metabase.core.initialization-status :as init-status]
   [metabase.db :as mdb]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models.api-key :as api-key]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.setting :as setting :refer [*user-local-values* defsetting]]
   [metabase.models.user :as user :refer [User]]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.request.core :as request]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

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
  (when-let [session (get-in cookies [request/metabase-embedded-session-cookie :value])]
    (when-let [anti-csrf-token (get headers request/anti-csrf-token-header)]
      (assoc request :metabase-session-id session, :anti-csrf-token anti-csrf-token :metabase-session-type :full-app-embed))))

(defmethod wrap-session-id-with-strategy :normal-cookie
  [_ {:keys [cookies], :as request}]
  (when-let [session (get-in cookies [request/metabase-session-cookie :value])]
    (when (seq session)
      (assoc request :metabase-session-id session :metabase-session-type :normal))))

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
  for `X-METABASE-SESSION`. If neither is found then no keyword is bound to the request."
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
(def ^:private ^{:arglists '([db-type max-age-minutes session-type enable-advanced-permissions?])} session-with-id-query
  (memoize
   (fn [db-type max-age-minutes session-type enable-advanced-permissions?]
     (first
      (t2.pipeline/compile*
       (cond-> {:select    [[:session.user_id :metabase-user-id]
                            [:user.is_superuser :is-superuser?]
                            [:user.locale :user-locale]]
                :from      [[:core_session :session]]
                :left-join [[:core_user :user] [:= :session.user_id :user.id]]
                :where     [:and
                            [:= :user.is_active true]
                            [:= :session.id [:raw "?"]]
                            (let [oldest-allowed [:inline (sql.qp/add-interval-honeysql-form db-type
                                                                                             :%now
                                                                                             (- max-age-minutes)
                                                                                             :minute)]]
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

(defn- current-user-info-for-session
  "Return User ID and superuser status for Session with `session-id` if it is valid and not expired."
  [session-id anti-csrf-token]
  (when (and session-id (init-status/complete?))
    (let [sql    (session-with-id-query (mdb/db-type)
                                        (config/config-int :max-session-age)
                                        (if (seq anti-csrf-token) :full-app-embed :normal)
                                        (premium-features/enable-advanced-permissions?))
          params (concat [session-id]
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

(defn- current-user-info-for-api-key
  "Return User ID and superuser status for an API Key with `api-key-id"
  [api-key]
  (when (and api-key (init-status/complete?))
    (let [user-data (some-> (t2/query-one (cons (user-data-for-api-key-prefix-query
                                                 (premium-features/enable-advanced-permissions?))
                                                [(api-key/prefix api-key)]))
                            (update :is-group-manager? boolean))]
      (when (matching-api-key? user-data api-key)
        (dissoc user-data :api-key)))))

(defn- merge-current-user-info
  [{:keys [metabase-session-id anti-csrf-token], {:strs [x-metabase-locale x-api-key]} :headers, :as request}]
  (merge
   request
   (or (current-user-info-for-session metabase-session-id anti-csrf-token)
       (current-user-info-for-api-key x-api-key))
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

(def ^:private current-user-fields
  (into [User] user/admin-or-self-visible-columns))

(defn- find-user [user-id]
  (when user-id
    (t2/select-one current-user-fields, :id user-id)))

(def ^:private ^:dynamic *user-local-values-user-id*
  "User ID that we've previous bound [[*user-local-values*]] for. This exists so we can avoid rebinding it in recursive
  calls to [[with-current-user]] if it is already bound, as this can mess things up since things
  like [[metabase.models.setting/set-user-local-value!]] will only update the values for the top-level binding."
  ;; placeholder value so we will end up rebinding [[*user-local-values*]] it if you call
  ;;
  ;;    (with-current-user nil
  ;;      ...)
  ;;
  ::none)

;;; this is actually used by [[metabase.models.permissions/clear-current-user-cached-permissions!]]
#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defn clear-current-user-cached-permissions-set!
  "If [[metabase.api.common/*current-user-permissions-set*]] is bound, reset it so it gets recalculated on next use.
  Called by [[metabase.models.permissions/delete-related-permissions!]]
  and [[metabase.models.permissions/grant-permissions!]], mostly as a convenience for tests that bind a current user
  and then grant or revoke permissions for that user without rebinding it."
  []
  (when-let [current-user-id api/*current-user-id*]
    ;; [[api/*current-user-permissions-set*]] is dynamically bound
    (when (get (get-thread-bindings) #'api/*current-user-permissions-set*)
      (.set #'api/*current-user-permissions-set* (delay (user/permissions-set current-user-id)))))
  nil)

(defn do-with-current-user
  "Impl for [[with-current-user]]."
  [{:keys [metabase-user-id is-superuser? permissions-set user-locale settings is-group-manager?]} thunk]
  (binding [*current-user-id*              metabase-user-id
            i18n/*user-locale*             user-locale
            *is-group-manager?*            (boolean is-group-manager?)
            *is-superuser?*                (boolean is-superuser?)
            *current-user*                 (delay (find-user metabase-user-id))
            *current-user-permissions-set* (delay (or permissions-set (some-> metabase-user-id user/permissions-set)))
            ;; as mentioned above, do not rebind this to something new, because changes to its value will not be
            ;; propagated to frames further up the stack
            *user-local-values*            (if (= *user-local-values-user-id* metabase-user-id)
                                             *user-local-values*
                                             (delay (atom (or settings
                                                              (user/user-local-settings metabase-user-id)))))
            *user-local-values-user-id*    metabase-user-id]
    (data-perms/with-relevant-permissions-for-user metabase-user-id
      (thunk))))

(defmacro ^:private with-current-user-for-request
  [request & body]
  `(do-with-current-user ~request (fn [] ~@body)))

(defn bind-current-user
  "Middleware that binds [[metabase.api.common/*current-user*]], [[*current-user-id*]], [[*is-superuser?*]],
  [[*current-user-permissions-set*]], and [[metabase.models.setting/*user-local-values*]].

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

(defn with-current-user-fetch-user-for-id
  "Part of the impl for `with-current-user` -- don't use this directly."
  [current-user-id]
  (when current-user-id
    (t2/select-one [User [:id :metabase-user-id] [:is_superuser :is-superuser?] [:locale :user-locale] :settings]
                   :id current-user-id)))

;;; TODO -- move to [[metabase.request.current]]
(defmacro as-admin
  "Execude code in body as an admin user."
  {:style/indent 0}
  [& body]
  `(do-with-current-user
    (merge
     (with-current-user-fetch-user-for-id ~`api/*current-user-id*)
     {:is-superuser? true
      :permissions-set #{"/"}
      :user-locale i18n/*user-locale*})
    (fn [] ~@body)))

(defmacro with-current-user
  "Execute code in body with `current-user-id` bound as the current user. (This is not used in the middleware
  itself but elsewhere where we want to simulate a User context, such as when rendering Pulses or in tests.) "
  {:style/indent :defn}
  [current-user-id & body]
  `(do-with-current-user
    (with-current-user-fetch-user-for-id ~current-user-id)
    (fn [] ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              reset-cookie-timeout                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- check-session-timeout
  "Returns nil if the [[session-timeout]] value is valid. Otherwise returns an error key."
  [timeout]
  (when (some? timeout)
    (let [{:keys [unit amount]} timeout
          units-in-24-hours (case unit
                              "seconds" (* 60 60 24)
                              "minutes" (* 60 24)
                              "hours"   24)
          units-in-100-years (* units-in-24-hours 365.25 100)]
      (cond
        (not (pos? amount))
        :amount-must-be-positive
        (>= amount units-in-100-years)
        :amount-must-be-less-than-100-years))))

(defsetting session-timeout
  ;; Should be in the form "{\"amount\":60,\"unit\":\"minutes\"}" where the unit is one of "seconds", "minutes" or "hours".
  ;; The amount is nillable.
  (deferred-tru "Time before inactive users are logged out. By default, sessions last indefinitely.")
  :encryption :no
  :type       :json
  :default    nil
  :getter     (fn []
                (let [value (setting/get-value-of-type :json :session-timeout)]
                  (if-let [error-key (check-session-timeout value)]
                    (do (log/warn (case error-key
                                    :amount-must-be-positive            "Session timeout amount must be positive."
                                    :amount-must-be-less-than-100-years "Session timeout must be less than 100 years."))
                        nil)
                    value)))
  :setter     (fn [new-value]
                (when-let [error-key (check-session-timeout new-value)]
                  (throw (ex-info (case error-key
                                    :amount-must-be-positive            "Session timeout amount must be positive."
                                    :amount-must-be-less-than-100-years "Session timeout must be less than 100 years.")
                                  {:status-code 400})))
                (setting/set-value-of-type! :json :session-timeout new-value))
  :doc        "Has to be in the JSON format `\"{\"amount\":120,\"unit\":\"minutes\"}\"` where the unit is one of \"seconds\", \"minutes\" or \"hours\".")

(defn session-timeout->seconds
  "Convert the session-timeout setting value to seconds."
  [{:keys [unit amount]}]
  (when amount
    (-> (case unit
          "seconds" amount
          "minutes" (* amount 60)
          "hours"   (* amount 3600))
        (max 60)))) ; Ensure a minimum of 60 seconds so a user can't lock themselves out

(defn session-timeout-seconds
  "Returns the number of seconds before a session times out. An alternative to calling `(session-timeout) directly`"
  []
  (session-timeout->seconds (session-timeout)))

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
    (let [;; The expiry time for the cookie is relative to the time the request is received, rather than the time of the response.
          request-time (t/zoned-date-time (t/zone-id "GMT"))]
      (handler request
               (fn [response]
                 (respond (reset-session-timeout* request response request-time)))
               raise))))
