(ns metabase.session.db
  "Application database queries for the session module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn delete-session-by-key-hashed!
  "Delete the Session with `key-hashed`, returning the number of rows deleted."
  [key-hashed]
  (t2/delete! :model/Session :key_hashed key-hashed))

(defn delete-sessions-for-user!
  "Delete every Session of the User with `user-id`."
  [user-id]
  (t2/delete! :model/Session :user_id user-id))

(defn delete-expired-sessions!
  "Delete Sessions older than `max-age-minutes`, past their own `expires_at`, or (when `idle-timeout-seconds` is
  given) idle longer than `idle-timeout-seconds`. Returns the number of rows deleted."
  [max-age-minutes idle-timeout-seconds]
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

(defn auth-identity-for-provider
  "The AuthIdentity of the User with `user-id` at `provider`, or nil."
  [user-id provider]
  (t2/select-one :model/AuthIdentity :user_id user-id :provider provider))

(defn auth-identity-exists?
  "Whether the User with `user-id` has an AuthIdentity at `provider`."
  [user-id provider]
  (t2/exists? :model/AuthIdentity :user_id user-id :provider provider))

(defn set-auth-identity-credentials!
  "Set the `credentials` of the AuthIdentity with `auth-identity-id`."
  [auth-identity-id credentials]
  (t2/update! :model/AuthIdentity auth-identity-id {:credentials credentials}))

(defn auth-identity-provider
  "The `:provider` of the AuthIdentity with `auth-identity-id`, or nil."
  [auth-identity-id]
  (t2/select-one [:model/AuthIdentity :provider] :id auth-identity-id))

(defn user-by-email
  "The id, SSO source, and active flag of the User whose email matches `email` case-insensitively, or nil."
  [email]
  (t2/select-one [:model/User :id :sso_source :is_active] :%lower.email (u/lower-case-en email)))

(defn user
  "The User with `user-id`, or nil."
  [user-id]
  (t2/select-one :model/User :id user-id))

(defn user-login-status
  "The id, active flag, last login, and tenant id of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :id user-id))
