(ns metabase.server.db
  "Application database queries for the server module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

;; These session/API-key/OAuth-token lookup queries run on every single authenticated API request, so it's worth it
;; to optimize a bit and only compile each one to SQL once (keyed by its boolean/enum arguments) rather than every
;; time.

(defn- oldest-allowed-expr
  "A database-specific expression for `NOW() - interval`."
  [db-type amount unit]
  (let [now (h2x/current-datetime-honeysql-form db-type)]
    (case db-type
      :postgres [:- now [::h2x/postgres-interval amount unit]]
      :h2       [:dateadd (h2x/literal (name unit))
                 [:inline (- amount)]
                 now]
      :mysql    [:- now [::h2x/mysql-interval amount unit]])))

(def ^:private mfa-supported-methods
  #_(descendants :metabase.auth-identity.provider/supports-mfa)
  #{:provider/password :provider/ldap})

(def ^:private ^{:arglists '([db-type max-age-minutes session-type enable-advanced-permissions? enable-tenants? session-timeout-seconds mfa-required])} session-with-id-query
  (mdb/memoize-for-application-db
   (fn [db-type max-age-minutes session-type enable-advanced-permissions? enable-tenants? session-timeout-seconds mfa-required]
     (first
      (t2.pipeline/compile*
       (cond-> {:select    [[:session.user_id :metabase-user-id]
                            [:user.is_superuser :is-superuser?]
                            [:user.is_data_analyst :is-data-analyst?]
                            [:user.locale :user-locale]
                            [:auth_identity.provider :auth-provider]]
                :from      [[:core_session :session]]
                :left-join [[:core_user :user] [:= :session.user_id :user.id]
                            [:tenant] [:= :tenant.id :user.tenant_id]
                            [:auth_identity] [:= :auth_identity.id :session.auth_identity_id]]
                :where     (into [:and
                                  (if enable-tenants?
                                    [:or [:= :tenant.id nil] :tenant.is_active]
                                    [:= :tenant.id nil])
                                  [:= :user.is_active true]
                                  [:= :session.key_hashed ^:allow-raw-sql [:raw "?"]]
                                  [:> :session.created_at (oldest-allowed-expr db-type max-age-minutes :minute)]
                                  [:or [:= :session.expires_at nil]
                                   [:> :session.expires_at (h2x/current-datetime-honeysql-form db-type)]]
                                  [:= :session.anti_csrf_token (case session-type
                                                                 :normal         nil
                                                                 :full-app-embed ^:allow-raw-sql [:raw "?"])]]
                                 cat
                                 [(when mfa-required
                                    [[:or
                                      [:not= :session.mfa_auth_identity_id nil]
                                      (into [:and]
                                            (map (fn [mfa-supporting-provider]
                                                   [:not= :auth_identity.provider
                                                    ^:allow-raw-sql
                                                    [:raw (str "'" (name mfa-supporting-provider) "'")]])
                                                 mfa-supported-methods))]])
                                  (when session-timeout-seconds
                                    [[:> [:coalesce :session.last_active_at :session.created_at]
                                      (oldest-allowed-expr db-type session-timeout-seconds :second)]])])
                :limit     [:inline 1]}
         enable-advanced-permissions?
         (->
          (sql.helpers/select
           [:pgm.is_group_manager :is-group-manager?])
          (sql.helpers/left-join
           [:permissions_group_membership :pgm] [:and
                                                 [:= :pgm.user_id :user.id]
                                                 [:is :pgm.is_group_manager true]]))))))))

(def ^:private ^{:arglists '([enable-advanced-permissions?])} user-data-for-api-key-prefix-query
  (mdb/memoize-for-application-db
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
                            [:= :api_key.key_prefix ^:allow-raw-sql [:raw "?"]]]
                :limit     [:inline 1]}
         enable-advanced-permissions?
         (->
          (sql.helpers/select
           [:pgm.is_group_manager :is-group-manager?])
          (sql.helpers/left-join
           [:permissions_group_membership :pgm] [:and
                                                 [:= :pgm.user_id :user.id]
                                                 [:is :pgm.is_group_manager true]]))))))))

(def ^:private ^{:arglists '([enable-advanced-permissions?])} user-data-for-id-query
  (mdb/memoize-for-application-db
   (fn [enable-advanced-permissions?]
     (first
      (t2.pipeline/compile*
       (cond-> {:select    [[:user.id :metabase-user-id]
                            [:user.is_superuser :is-superuser?]
                            [:user.is_data_analyst :is-data-analyst?]
                            [:user.locale :user-locale]]
                :from      [[:core_user :user]]
                :where     [:and
                            [:= :user.is_active true]
                            [:= :user.id ^:allow-raw-sql [:raw "?"]]]
                :limit     [:inline 1]}
         enable-advanced-permissions?
         (->
          (sql.helpers/select
           [:pgm.is_group_manager :is-group-manager?])
          (sql.helpers/left-join
           [:permissions_group_membership :pgm] [:and
                                                 [:= :pgm.user_id :user.id]
                                                 [:is :pgm.is_group_manager true]]))))))))

(defn session-user-info
  "The user id, superuser/data-analyst/group-manager flags, locale, and auth provider for the active, unexpired
  Session whose `key_hashed` is `session-key-hash`, or nil if there is none. `anti-csrf-token`, when present,
  additionally requires the Session's `anti_csrf_token` to match it (a full-app-embed session); `max-age-minutes`
  and `session-timeout-seconds` (which may be nil) bound how old or idle the Session may be."
  [session-key-hash anti-csrf-token max-age-minutes enable-advanced-permissions? enable-tenants? session-timeout-seconds mfa-required]
  (let [sql    (session-with-id-query (mdb/db-type)
                                      max-age-minutes
                                      (if (seq anti-csrf-token) :full-app-embed :normal)
                                      enable-advanced-permissions?
                                      enable-tenants?
                                      session-timeout-seconds
                                      mfa-required)
        params (concat [session-key-hash] (when (seq anti-csrf-token) [anti-csrf-token]))]
    (t2/query-one (cons sql params))))

(defn api-key-user-info
  "The user id, api key, superuser/data-analyst/group-manager flags, and locale for the active User whose ApiKey
  starts with `key-prefix`, or nil if there is none."
  [key-prefix enable-advanced-permissions?]
  (t2/query-one (cons (user-data-for-api-key-prefix-query enable-advanced-permissions?) [key-prefix])))

(defn oauth-user-info
  "The user id, superuser/data-analyst/group-manager flags, and locale for the active User with `user-id`, or nil if
  there is none."
  [user-id enable-advanced-permissions?]
  (t2/query-one (cons (user-data-for-id-query enable-advanced-permissions?) [user-id])))

(defn touch-session!
  "Set `last_active_at` of the Session with `key-hashed` to now."
  [key-hashed]
  (t2/query-one {:update (t2/table-name :model/Session)
                 :set    {:last_active_at :%now}
                 :where  [:= :key_hashed key-hashed]}))
