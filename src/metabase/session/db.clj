(ns metabase.session.db
  "Application database queries for `:model/Session`. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a Session query itself (model definitions still use
  `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it, and queries for other models this namespace
  also hosts, live in the session-only section at the bottom of this namespace."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.auth-identity.db :as auth-identity.db]
   [metabase.auth-identity.schema :as auth-identity.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.session.schema :as session.schema]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which Sessions a query applies to. Keys mirror the columns of `core_session`: a scalar matches that value."
  [:map {:closed true}
   [:id         {:optional true} :string]
   [:user_id    {:optional true} ::lib.schema.id/user]
   [:key_hashed {:optional true} :string]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::session.schema/session.column]]
    [:order-by {:optional true} [:sequential ::session.schema/session.column]]]])

(defn- ->args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn delete-sessions! :- :int
  "Delete every Session matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/Session (->args opts)))

;;; ------------------------------------- Queries used only by the session module -------------------------------

(mu/defn delete-expired-sessions!
  "Delete Sessions older than `max-age-minutes`, past their own `expires_at`, or (when `idle-timeout-seconds` is
  given) idle longer than `idle-timeout-seconds`. Returns the number of rows deleted."
  [max-age-minutes      :- ms/PositiveInt
   idle-timeout-seconds :- [:maybe ms/PositiveInt]]
  (let [db-type        (mdb/db-type)
        now            (h2x/current-datetime-honeysql-form db-type)
        oldest-allowed (h2x/add-interval-honeysql-form db-type now (- max-age-minutes) :minute)
        timeout-oldest (when idle-timeout-seconds
                         (h2x/add-interval-honeysql-form db-type now (- idle-timeout-seconds) :second))
        hsql           {:delete-from [(t2/table-name :model/Session)]
                        :where       (cond-> [:or
                                              [:< :created_at oldest-allowed]
                                              [:and [:not= :expires_at nil] [:< :expires_at now]]]
                                       timeout-oldest
                                       (conj [:< [:coalesce :last_active_at :created_at] timeout-oldest]))}]
    (tracing/with-span :tasks "task.session-cleanup.delete" {:db/statement (tracing/best-effort-sanitize-sql hsql)}
      (t2/query-one hsql))))

(mu/defn auth-identity-for-provider
  "The AuthIdentity of the User with `user-id` at `provider`, or nil. See
  `metabase.auth-identity.db/select-one-auth-identity`, which owns the AuthIdentity table."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (auth-identity.db/select-one-auth-identity {:user_id user-id :provider provider}))

(mu/defn auth-identity-exists?
  "Whether the User with `user-id` has an AuthIdentity at `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (auth-identity.db/auth-identity-exists? {:user_id user-id :provider provider}))

(mu/defn set-auth-identity-credentials!
  "Set the `credentials` of the AuthIdentity with `auth-identity-id`."
  [auth-identity-id :- ms/PositiveInt
   credentials      :- [:maybe ::auth-identity.schema/auth-identity.credentials]]
  (t2/update! :model/AuthIdentity auth-identity-id {:credentials credentials}))

(mu/defn auth-identity-provider
  "The `:provider` of the AuthIdentity with `auth-identity-id`, or nil."
  [auth-identity-id :- ms/PositiveInt]
  (t2/select-one [:model/AuthIdentity :provider] :id auth-identity-id))

(mu/defn user-by-email
  "The id, SSO source, and active flag of the User whose email matches `email` case-insensitively, or nil."
  [email :- :string]
  (t2/select-one [:model/User :id :sso_source :is_active] :%lower.email (u/lower-case-en email)))

(mu/defn user
  "The User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/User :id user-id))

(mu/defn user-login-status
  "The id, active flag, last login, and tenant id of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :id user-id))
