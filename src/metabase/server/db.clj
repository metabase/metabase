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

(set! *warn-on-reflection* true)

;; Hard-coded rather than `(descendants :metabase.auth-identity.provider/supports-mfa)` so the session query below
;; does not depend on load order of the provider namespaces.
;; [[metabase.server.middleware.session-test/mfa-providers-list-test]] keeps this in sync with the hierarchy.
(def ^:private mfa-supported-methods
  #{:provider/password :provider/ldap})

(defn- select-group-manager
  "`query`, whose user is aliased `user`, also selecting whether the user manages a group when
  `enable-advanced-permissions?`."
  [query enable-advanced-permissions?]
  (cond-> query
    enable-advanced-permissions?
    (-> (sql.helpers/select [:pgm.is_group_manager :is-group-manager?])
        (sql.helpers/left-join [(t2/table-name :model/PermissionsGroupMembership) :pgm]
                               [:and [:= :pgm.user_id :user.id] [:is :pgm.is_group_manager true]]))))

(defn- session-with-id-query
  "The query of the user of the live Session whose `key_hashed` is `session-key-hash`, with the `anti-csrf-token` of a
  full-app-embed session."
  [session-key-hash anti-csrf-token max-age-minutes enable-advanced-permissions? enable-tenants? session-timeout-seconds
   mfa-required?]
  (select-group-manager
   (merge (session/session-from-and-joins)
          {:select [[:session.user_id :metabase-user-id]
                    [:user.is_superuser :is-superuser?]
                    [:user.is_data_analyst :is-data-analyst?]
                    [:user.locale :user-locale]
                    [:auth_identity.provider :auth-provider]]
           :where  (into [:and
                          [:= :session.key_hashed session-key-hash]
                          [:= :session.anti_csrf_token anti-csrf-token]]
                         cat
                         [(session/live-session-conditions
                           {:db-type                 (mdb/db-type)
                            :max-age-minutes         max-age-minutes
                            :enable-tenants?         enable-tenants?
                            :session-timeout-seconds session-timeout-seconds})
                          (when mfa-required?
                            [[:or
                              [:not= :session.mfa_auth_identity_id nil]
                              (into [:and]
                                    (map (fn [mfa-supporting-provider]
                                           [:not= :auth_identity.provider [:literal (name mfa-supporting-provider)]]))
                                    mfa-supported-methods)]])])
           :limit  [:inline 1]})
   enable-advanced-permissions?))

(def ^:private placeholder
  "A value standing in for a parameter of a compiled statement, which compiles to a `?` that [[query-one-compiled]] binds."
  "?")

(defn- query-one-compiled
  "The first row of the statement Funny SQL compiled as `compiled`, run with `params` for its placeholders."
  [compiled params]
  (t2/query-one (with-meta (into [(first compiled)] params) (meta compiled))))

(def ^:private ^{:arglists '([max-age-minutes full-app-embed? enable-advanced-permissions? enable-tenants?
                              session-timeout-seconds mfa-required?])}
  compiled-session-query
  (mdb/memoize-for-application-db
   (fn [max-age-minutes full-app-embed? enable-advanced-permissions? enable-tenants? session-timeout-seconds
        mfa-required?]
     (t2.pipeline/compile* (session-with-id-query placeholder
                                                  (when full-app-embed? placeholder)
                                                  max-age-minutes
                                                  enable-advanced-permissions?
                                                  enable-tenants?
                                                  session-timeout-seconds
                                                  mfa-required?)))))

(mu/defn session-user-info
  "The user id, superuser/data-analyst/group-manager flags, locale, and auth provider for the active, unexpired
  Session whose `key_hashed` is `session-key-hash`, or nil if there is none. `anti-csrf-token`, when present,
  additionally requires the Session's `anti_csrf_token` to match it (a full-app-embed session); `max-age-minutes`
  and `session-timeout-seconds` (which may be nil) bound how old or idle the Session may be."
  [session-key-hash             :- :string
   anti-csrf-token              :- [:maybe :string]
   max-age-minutes              :- [:maybe :int]
   enable-advanced-permissions? :- :boolean
   enable-tenants?              :- :boolean
   session-timeout-seconds      :- [:maybe :int]
   mfa-required?                :- :boolean]
  (when-not (string? session-key-hash)
    (throw (ex-info "session-key-hash must be a string" {:session-key-hash session-key-hash})))
  (when-not (or (nil? anti-csrf-token) (string? anti-csrf-token))
    (throw (ex-info "anti-csrf-token must be a string" {:anti-csrf-token anti-csrf-token})))
  (query-one-compiled (compiled-session-query max-age-minutes
                                              (boolean (seq anti-csrf-token))
                                              enable-advanced-permissions?
                                              enable-tenants?
                                              session-timeout-seconds
                                              mfa-required?)
                      (cond-> [session-key-hash] (seq anti-csrf-token) (conj anti-csrf-token))))

(def ^:private ^{:arglists '([enable-advanced-permissions?])} compiled-api-key-query
  (mdb/memoize-for-application-db
   (fn [enable-advanced-permissions?]
     (t2.pipeline/compile* (select-group-manager
                            {:select    [[:api_key.id :api-key-id]
                                         [:api_key.creator_id :api-key-creator-id]
                                         [:api_key.user_id :metabase-user-id]
                                         [:api_key.key :api-key]
                                         [:api_key.scope :api-key-scope]
                                         [:user.is_superuser :is-superuser?]
                                         [:user.is_data_analyst :is-data-analyst?]
                                         [:user.locale :user-locale]]
                             :from      [[(t2/table-name :model/ApiKey) :api_key]]
                             :left-join [[(t2/table-name :model/User) :user] [:= :api_key.user_id :user.id]]
                             :where     [:and [:= :user.is_active true] [:= :api_key.key_prefix placeholder]]
                             :limit     [:inline 1]}
                            enable-advanced-permissions?)))))

(def ^:private ^{:arglists '([enable-advanced-permissions?])} compiled-oauth-query
  (mdb/memoize-for-application-db
   (fn [enable-advanced-permissions?]
     (t2.pipeline/compile* (select-group-manager
                            {:select [[:user.id :metabase-user-id]
                                      [:user.is_superuser :is-superuser?]
                                      [:user.is_data_analyst :is-data-analyst?]
                                      [:user.locale :user-locale]]
                             :from   [[(t2/table-name :model/User) :user]]
                             :where  [:and [:= :user.is_active true] [:= :user.id placeholder]]
                             :limit  [:inline 1]}
                            enable-advanced-permissions?)))))

(mu/defn api-key-user-info
  "The API key id, the id of the human who created the key (`api-key-creator-id`, distinct from `metabase-user-id`, the
  key's own service-account user that permission checks use), api key, key scope, superuser/data-analyst/group-manager
  flags, and locale for the active User whose ApiKey starts with `key-prefix`, or nil if there is none."
  [key-prefix                   :- :string
   enable-advanced-permissions? :- :boolean]
  (when-not (string? key-prefix)
    (throw (ex-info "key-prefix must be a string" {:key-prefix key-prefix})))
  (query-one-compiled (compiled-api-key-query enable-advanced-permissions?) [key-prefix]))

(mu/defn oauth-user-info
  "The user id, superuser/data-analyst/group-manager flags, and locale for the active User with `user-id`, or nil if
  there is none."
  [user-id                      :- ::lib.schema.id/user
   enable-advanced-permissions? :- :boolean]
  (when-not (pos-int? user-id)
    (throw (ex-info "user-id must be a positive integer" {:user-id user-id})))
  (query-one-compiled (compiled-oauth-query enable-advanced-permissions?) [user-id]))
