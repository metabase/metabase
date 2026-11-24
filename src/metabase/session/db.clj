(ns metabase.session.db
  "Application database queries for the session module, so that no other namespace in the module runs a query itself
  (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.auth-identity.db :as auth-identity.db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.session.query :as session.query]
   [metabase.session.schema :as session.schema]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn insert-session! :- ::session.schema/session
  "Insert the Session `row` and return the inserted instance."
  [{:keys [id user_id auth_identity_id session_key expires_at mfa_auth_identity_id
           saml_session_index saml_name_id saml_name_id_format]} :- ::session.schema/session.create]
  ;; `:id` and `:session_key` stay unmarked: the before-insert hook checks the id is not a UUID and hashes the key,
  ;; and both need the plain string. The key itself never reaches SQL, only its hash.
  (t2/insert-returning-instance! :model/Session
                                 ;; Without setting the ID here we can't return an instance on MySQL
                                 :id id
                                 :user_id (long user_id)
                                 :auth_identity_id (some-> auth_identity_id long)
                                 :session_key session_key
                                 :expires_at [:auto/param expires_at]
                                 :mfa_auth_identity_id (some-> mfa_auth_identity_id long)
                                 :saml_session_index [:auto/param saml_session_index]
                                 :saml_name_id [:auto/param saml_name_id]
                                 :saml_name_id_format [:auto/param saml_name_id_format]))

(mu/defn mcp-session
  "The `core_session` row with `key-hashed` of the User with `user-id`, or nil."
  [key-hashed :- :string
   user-id    :- ::lib.schema.id/user]
  (t2/select-one :core_session :key_hashed [:auto/param key-hashed] :user_id [:auto/param user-id]))

(mu/defn insert-mcp-session!
  "Insert the MCP-backed `core_session` `row` into the table rather than through `:model/Session`, so that it gets no
  model defaults, and return it as stored."
  [row :- [:map {:closed true}
           [:id               :string]
           [:key_hashed       :string]
           [:user_id          ::lib.schema.id/user]
           [:anti_csrf_token  :nil]
           [:auth_identity_id ms/PositiveInt]
           [:created_at       :keyword]]]
  (t2/insert-returning-instance! :core_session row))

(defn- session-ending
  "The columns that record the ending of a Session with `reason` by `ended-by`, clearing its key."
  [reason ended-by]
  {:ended_at         :%now
   :end_reason       reason
   :ended_by_user_id ended-by
   :key_hashed       nil})

(mu/defn end-sessions! :- ms/IntGreaterThanOrEqualToZero
  "Record that every live Session with `ids` has ended with `reason`, ended by `ended-by` (a User id, or `:user_id` for
  the session's own user), clearing its key. Returns the number ended."
  [ids      :- [:sequential {:min 1} :string]
   reason   :- ::session.schema/end-reason
   ended-by :- [:maybe [:or ::lib.schema.id/user [:= :user_id]]]]
  (t2/update! :model/Session :id [:in [:auto/param (vec ids)]] :ended_at nil (session-ending reason ended-by)))

(mu/defn end-sessions-for-users! :- ms/IntGreaterThanOrEqualToZero
  "Record that every live Session of the Users with `user-ids` has ended with `reason`, ended by `ended-by`, clearing
  its key, and return the number ended."
  [user-ids :- [:sequential {:min 1} ::lib.schema.id/user]
   reason   :- ::session.schema/end-reason
   ended-by :- [:maybe [:or ::lib.schema.id/user [:= :user_id]]]]
  (t2/update! :model/Session :user_id [:in [:auto/param (vec user-ids)]] :ended_at nil (session-ending reason ended-by)))

(mu/defn end-session-for-key! :- ms/IntGreaterThanOrEqualToZero
  "Record that the live Session with `key-hashed` has ended with `reason`, ended by `ended-by`, clearing its key, and
  return the number ended."
  [key-hashed :- :string
   reason     :- ::session.schema/end-reason
   ended-by   :- [:maybe [:or ::lib.schema.id/user [:= :user_id]]]]
  (t2/update! :model/Session :key_hashed [:auto/param key-hashed] :ended_at nil (session-ending reason ended-by)))

(mu/defn delete-session-of-user!
  "Delete the `core_session` with `key-hashed` if it belongs to the User with `user-id`."
  [key-hashed :- :string
   user-id    :- ::lib.schema.id/user]
  (t2/query {:delete-from :core_session
             :where       [:and
                           [:= :key_hashed key-hashed]
                           [:= :user_id user-id]]}))

(mu/defn touch-session!
  "Set `last_active_at` of the Session with `key-hashed` to now, writing the table rather than `:model/Session`, whose
  update hook allows only the columns that record an ending."
  [key-hashed :- :string]
  (t2/query-one {:update (t2/table-name :model/Session)
                 :set    {:last_active_at :%now}
                 :where  [:= :key_hashed key-hashed]}))

(mu/defn sessions-with-unrecorded-ending :- [:sequential [:map {:closed true}
                                                          [:id     :string]
                                                          [:reason ::session.schema/end-reason]]]
  "The id of every session that is no longer live but has no `ended_at` yet, with the reason the nightly sweep should
  record: the user's or tenant's deactivation first, then expiry (its own `expires_at` or `max-session-age`), then
  the idle timeout. MCP-backed rows are not sessions and are never included."
  [liveness :- ::session.schema/liveness-params]
  (let [predicates  (session.query/liveness-predicates liveness)
        ;; a not-live row fails at least one of these, so the CASE always resolves; `:else` names the last one
        reason-expr (cond-> [:case
                             [:not (:user-active predicates)]   (h2x/literal "user-deactivated")
                             [:not (:tenant-active predicates)] (h2x/literal "tenant-deactivated")]
                      (:not-timed-out predicates)
                      (conj [:not (:not-expired predicates)] (h2x/literal "expired")
                            :else (h2x/literal "timed-out"))

                      (not (:not-timed-out predicates))
                      (conj :else (h2x/literal "expired")))]
    (t2/query (merge session.query/session-from-and-joins
                     {:select [[:session.id :id]
                               [reason-expr :reason]]
                      :where  [:and
                               (:not-ended predicates)
                               (:not-mcp predicates)
                               [:not (into [:and] (keep predicates)
                                           [:user-active :tenant-active :not-expired :not-timed-out])]]}))))

(mu/defn delete-sessions-for-cleanup! :- ms/IntGreaterThanOrEqualToZero
  "Delete the Sessions whose recorded ending is before `cutoff`, which leaves every live session whatever its age, and
  return the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/Session :ended_at [:< [:auto/param cutoff]]))

(mu/defn delete-sessions-for-mcp-cleanup! :- ms/IntGreaterThanOrEqualToZero
  "Delete the MCP-backed `core_session` rows, which are no sessions and so are not kept on record like an ended one
  (see [[sessions-with-unrecorded-ending]]), that are older than `max-age-minutes`, past their own `expires_at`, or
  idle longer than `idle-timeout-seconds` when it is given, and return the number deleted."
  [max-age-minutes      :- ms/PositiveInt
   idle-timeout-seconds :- [:maybe ms/PositiveInt]]
  (let [db-type        (mdb/db-type)
        now            (h2x/current-datetime-honeysql-form db-type)
        oldest-allowed (h2x/add-interval-honeysql-form db-type now (- max-age-minutes) :minute)
        timeout-oldest (when idle-timeout-seconds
                         (h2x/add-interval-honeysql-form db-type now (- idle-timeout-seconds) :second))
        hsql           {:delete-from [(t2/table-name :model/Session)]
                        :where       [:and
                                      [:in :auth_identity_id ^:allow-subquery
                                       {:select [:id]
                                        :from   [:auth_identity]
                                        :where  [:= :provider (h2x/literal session.query/mcp-provider)]}]
                                      (cond-> [:or
                                               [:< :created_at oldest-allowed]
                                               [:and [:not= :expires_at nil] [:< :expires_at now]]]
                                        timeout-oldest
                                        (conj [:< [:coalesce :last_active_at :created_at] timeout-oldest]))]}]
    (tracing/with-span :tasks "task.session-cleanup.delete" {:db/statement (tracing/best-effort-sanitize-sql hsql)}
      (t2/query-one hsql))))

(mu/defn auth-identity-for-provider
  "The AuthIdentity of the User with `user-id` at `provider`, or nil. See `metabase.auth-identity.db/auth-identity`,
  which owns the AuthIdentity table."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (auth-identity.db/auth-identity user-id provider))

(mu/defn auth-identity-exists?
  "Whether the User with `user-id` has an AuthIdentity at `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (auth-identity.db/auth-identity-exists? user-id provider))

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

(mu/defn user-sso-source
  "The `sso_source` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :sso_source :model/User :id user-id))

(mu/defn user-login-status
  "The id, active flag, last login, and tenant id of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :id user-id))
