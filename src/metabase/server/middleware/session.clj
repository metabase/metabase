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
    :refer [*current-user*
            *current-user-id*
            *current-user-permissions-set*
            *is-group-manager?*
            *is-superuser?*]]
   [metabase.config :as config]
   [metabase.core.initialization-status :as init-status]
   [metabase.db :as mdb]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models.api-key :as api-key]
   [metabase.models.setting
    :as setting
    :refer [*user-local-values* defsetting]]
   [metabase.models.user :as user :refer [User]]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.server.request.util :as request.u]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [deferred-trs deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.password :as u.password]
   [ring.util.response :as response]
   [schema.core :as s]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (java.util UUID)))

(def ^String metabase-session-cookie
  "Where the session cookie goes."                      "metabase.SESSION")
(def ^:private ^String metabase-embedded-session-cookie "metabase.EMBEDDED_SESSION")
(def ^:private ^String metabase-session-timeout-cookie  "metabase.TIMEOUT")
(def ^:private ^String anti-csrf-token-header           "x-metabase-anti-csrf-token")

(defn- clear-cookie [response cookie-name]
  (response/set-cookie response cookie-name nil {:expires "Thu, 1 Jan 1970 00:00:00 GMT", :path "/"}))

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
  (reduce clear-cookie (wrap-body-if-needed response) [metabase-session-cookie
                                                       metabase-embedded-session-cookie
                                                       metabase-session-timeout-cookie]))

(def ^:private possible-session-cookie-samesite-values
  #{:lax :none :strict nil})

(defn- normalized-session-cookie-samesite [value]
  (some-> value name u/lower-case-en keyword))

(defn- valid-session-cookie-samesite?
  [normalized-value]
  (contains? possible-session-cookie-samesite-values normalized-value))

(defsetting session-cookie-samesite
  (deferred-tru "Value for the session cookie's `SameSite` directive.")
  :type :keyword
  :visibility :settings-manager
  :default :lax
  :getter (fn session-cookie-samesite-getter []
            (let [value (normalized-session-cookie-samesite
                         (setting/get-raw-value :session-cookie-samesite))]
              (if (valid-session-cookie-samesite? value)
                value
                (throw (ex-info "Invalid value for session cookie samesite"
                                {:possible-values possible-session-cookie-samesite-values
                                 :session-cookie-samesite value})))))
  :setter (fn session-cookie-samesite-setter
            [new-value]
            (let [normalized-value (normalized-session-cookie-samesite new-value)]
              (if (valid-session-cookie-samesite? normalized-value)
                (setting/set-value-of-type!
                 :keyword
                 :session-cookie-samesite
                 normalized-value)
                (throw (ex-info (tru "Invalid value for session cookie samesite")
                                {:possible-values possible-session-cookie-samesite-values
                                 :session-cookie-samesite normalized-value
                                 :http-status 400}))))))

(defmulti default-session-cookie-attributes
  "The appropriate cookie attributes to persist a newly created Session to `response`."
  {:arglists '([session-type request])}
  (fn [session-type _] session-type))

(defmethod default-session-cookie-attributes :default
  [session-type _]
  (throw (ex-info (str (tru "Invalid session-type."))
           {:session-type session-type})))

(defmethod default-session-cookie-attributes :normal
  [_ request]
  (merge
   {:same-site (session-cookie-samesite)
    ;; TODO - we should set `site-path` as well. Don't want to enable this yet so we don't end
    ;; up breaking things
    :path      "/" #_(site-path)}
   ;; If the authentication request request was made over HTTPS (hopefully always except for
   ;; local dev instances) add `Secure` attribute so the cookie is only sent over HTTPS.
   (when (request.u/https? request)
     {:secure true})))

(defmethod default-session-cookie-attributes :full-app-embed
  [_ request]
  (merge
   {:path "/"}
   (when (request.u/https? request)
     ;; SameSite=None is required for cross-domain full-app embedding. This is safe because
     ;; security is provided via anti-CSRF token. Note that most browsers will only accept
     ;; SameSite=None with secure cookies, thus we are setting it only over HTTPS to prevent
     ;; the cookie from being rejected in case of same-domain embedding.
     {:same-site :none
      :secure    true})))

(declare session-timeout-seconds)

(defn set-session-timeout-cookie
  "Add an appropriate timeout cookie to track whether the session should timeout or not, according to the [[session-timeout]] setting.
   If the session-timeout setting is on, the cookie has an appropriately timed expires attribute.
   If the session-timeout setting is off, the cookie has a max-age attribute, so it expires in the far future."
  [response request session-type request-time]
  (let [response       (wrap-body-if-needed response)
        timeout        (session-timeout-seconds)
        cookie-options (merge
                        (default-session-cookie-attributes session-type request)
                        (if (some? timeout)
                          {:expires (t/format :rfc-1123-date-time (t/plus request-time (t/seconds timeout)))}
                          {:max-age (* 60 (config/config-int :max-session-age))}))]
    (-> response
        wrap-body-if-needed
        (response/set-cookie metabase-session-timeout-cookie "alive" cookie-options))))

(defn session-cookie-name
  "Returns the appropriate cookie name for the session type."
  [session-type]
  (case session-type
    :normal
    metabase-session-cookie
    :full-app-embed
    metabase-embedded-session-cookie))

(defn- use-permanent-cookies?
  "Check if we should use permanent cookies for a given request, which are not cleared when a browser sesion ends."
  [request]
  (if (public-settings/session-cookies)
    ;; Disallow permanent cookies if MB_SESSION_COOKIES is set
    false
    ;; Otherwise check whether the user selected "remember me" during login
    (get-in request [:body :remember])))

(s/defn set-session-cookies
  "Add the appropriate cookies to the `response` for the Session."
  [request
   response
   {session-uuid :id
    session-type :type
    anti-csrf-token :anti_csrf_token} :- {:id (s/cond-pre UUID u/uuid-regex), s/Keyword s/Any}
   request-time]
  (let [cookie-options (merge
                        (default-session-cookie-attributes session-type request)
                        {:http-only true}
                        ;; If permanent cookies should be used, set the `Max-Age` directive; cookies with no
                        ;; `Max-Age` and no `Expires` directives are session cookies, and are deleted when the
                        ;; browser is closed.
                        ;; See https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#define_the_lifetime_of_a_cookie
                        ;; max-session age-is in minutes; Max-Age= directive should be in seconds
                        (when (use-permanent-cookies? request)
                          {:max-age (* 60 (config/config-int :max-session-age))}))]
    (when (and (= (session-cookie-samesite) :none) (not (request.u/https? request)))
      (log/warn
       (str (deferred-trs "Session cookie's SameSite is configured to \"None\", but site is served over an insecure connection. Some browsers will reject cookies under these conditions.")
            " "
            "https://www.chromestatus.com/feature/5633521622188032")))
    (-> response
        wrap-body-if-needed
        (cond-> (= session-type :full-app-embed)
          (assoc-in [:headers anti-csrf-token-header] anti-csrf-token))
        (set-session-timeout-cookie request session-type request-time)
        (response/set-cookie (session-cookie-name session-type) (str session-uuid) cookie-options))))

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
      (assoc request :metabase-session-id session, :anti-csrf-token anti-csrf-token :metabase-session-type :full-app-embed))))

(defmethod wrap-session-id-with-strategy :normal-cookie
  [_ {:keys [cookies], :as request}]
  (when-let [session (get-in cookies [metabase-session-cookie :value])]
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

(defn- do-useless-hash []
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
    (thunk)))

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

(defmacro as-admin
  "Execude code in body as an admin user."
  {:style/indent :defn}
  [& body]
  `(do-with-current-user
    (merge
      (with-current-user-fetch-user-for-id ~`api/*current-user-id*)
      {:is-superuser? true
       :permissions-set #{"/"}})
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
  :type    :json
  :default nil
  :getter  (fn []
             (let [value (setting/get-value-of-type :json :session-timeout)]
               (if-let [error-key (check-session-timeout value)]
                 (do (log/warn (case error-key
                                 :amount-must-be-positive            (trs "Session timeout amount must be positive.")
                                 :amount-must-be-less-than-100-years (trs "Session timeout must be less than 100 years.")))
                     nil)
                 value)))
  :setter  (fn [new-value]
             (when-let [error-key (check-session-timeout new-value)]
               (throw (ex-info (case error-key
                                 :amount-must-be-positive            (tru "Session timeout amount must be positive.")
                                 :amount-must-be-less-than-100-years (tru "Session timeout must be less than 100 years."))
                               {:status-code 400})))
             (setting/set-value-of-type! :json :session-timeout new-value)))

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
       (not (contains? (:cookies response) metabase-session-timeout-cookie)))
    (set-session-timeout-cookie response request (:metabase-session-type request) request-time)
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
