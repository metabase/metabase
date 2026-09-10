(ns metabase.server.db
  "Application database queries for the server module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.session.core :as session]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

;; These session/API-key/OAuth-token lookup queries run on every single authenticated API request, so it's worth it
;; to optimize a bit and only compile each one to SQL once (keyed by its boolean/enum arguments) rather than every
;; time.

(def ^:private ^{:arglists '([db-type max-age-minutes session-type enable-advanced-permissions? enable-tenants? session-timeout-seconds])} session-with-id-query
  (mdb/memoize-for-application-db
   (fn [db-type max-age-minutes session-type enable-advanced-permissions? enable-tenants? session-timeout-seconds]
     (first
      (t2.pipeline/compile*
       (cond-> (merge session/session-from-and-joins
                      {:select [[:session.user_id :metabase-user-id]
                                [:user.is_superuser :is-superuser?]
                                [:user.is_data_analyst :is-data-analyst?]
                                [:user.locale :user-locale]
                                [:auth_identity.provider :auth-provider]]
                       :where  (into [:and
                                      [:= :session.key_hashed ^:allow-raw-sql [:raw "?"]]
                                      [:= :session.anti_csrf_token (case session-type
                                                                     :normal         nil
                                                                     :full-app-embed ^:allow-raw-sql [:raw "?"])]]
                                     (session/live-session-conditions
                                      {:db-type                 db-type
                                       :max-age-minutes         max-age-minutes
                                       :enable-tenants?         enable-tenants?
                                       :session-timeout-seconds session-timeout-seconds}))
                       :limit  [:inline 1]})
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

(mu/defn session-user-info
  "The user id, superuser/data-analyst/group-manager flags, locale, and auth provider for the active, unexpired
  Session whose `key_hashed` is `session-key-hash`, or nil if there is none. `anti-csrf-token`, when present,
  additionally requires the Session's `anti_csrf_token` to match it (a full-app-embed session); `max-age-minutes`
  and `session-timeout-seconds` (which may be nil) bound how old or idle the Session may be."
  [session-key-hash            :- :string
   anti-csrf-token             :- [:maybe :string]
   max-age-minutes             :- [:maybe :int]
   enable-advanced-permissions? :- :boolean
   enable-tenants?              :- :boolean
   session-timeout-seconds      :- [:maybe :int]]
  (let [sql    (session-with-id-query (mdb/db-type)
                                      max-age-minutes
                                      (if (seq anti-csrf-token) :full-app-embed :normal)
                                      enable-advanced-permissions?
                                      enable-tenants?
                                      session-timeout-seconds)
        params (concat [session-key-hash] (when (seq anti-csrf-token) [anti-csrf-token]))]
    (t2/query-one (cons sql params))))

(mu/defn api-key-user-info
  "The user id, api key, superuser/data-analyst/group-manager flags, and locale for the active User whose ApiKey
  starts with `key-prefix`, or nil if there is none."
  [key-prefix                   :- :string
   enable-advanced-permissions? :- :boolean]
  (t2/query-one (cons (user-data-for-api-key-prefix-query enable-advanced-permissions?) [key-prefix])))

(mu/defn oauth-user-info
  "The user id, superuser/data-analyst/group-manager flags, and locale for the active User with `user-id`, or nil if
  there is none."
  [user-id                      :- ::lib.schema.id/user
   enable-advanced-permissions? :- :boolean]
  (t2/query-one (cons (user-data-for-id-query enable-advanced-permissions?) [user-id])))

(mu/defn touch-session!
  "Set `last_active_at` of the Session with `key-hashed` to now."
  [key-hashed :- :string]
  (t2/query-one {:update (t2/table-name :model/Session)
                 :set    {:last_active_at :%now}
                 :where  [:= :key_hashed key-hashed]}))
