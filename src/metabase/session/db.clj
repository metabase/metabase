(ns metabase.session.db
  "Application database queries for the session module, so that no other namespace in the module runs a query itself
  (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.auth-identity.db :as auth-identity.db]
   [metabase.auth-identity.schema :as auth-identity.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.session.query :as session.query]
   [metabase.session.schema :as session.schema]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ended-session-retention-days
  "How long an ended session stays on record before [[delete-sessions-ended-long-ago!]] removes its row."
  ;; a constant rather than a setting, and deliberately not `audit-max-retention-days`: that defaults to two years,
  ;; and the audit tables are a different concern (ADR 0004)
  30)

(def ^:dynamic *end-batch-size*
  "How many ids one `UPDATE ... WHERE id IN (...)` may name. Ending sessions by id has no upper bound on how many
  there are, and every id is a bind parameter — pgjdbc refuses a statement with more than 65,535 of them."
  1000)

(mu/defn end-sessions! :- ms/IntGreaterThanOrEqualToZero
  "Record that every Session matching `conditions` (see `::session.schema/end-conditions`) has ended: `ended_at`
  becomes now, `end_reason` becomes `reason`, `ended_by_user_id` becomes `ended-by`, and `key_hashed` is cleared so
  the row can never authenticate a request again. A session that has already ended is left as it was. Returns the
  number of sessions ended. See `::session.schema/ended-by` for `ended-by`."
  [conditions :- ::session.schema/end-conditions
   reason     :- ::session.schema/end-reason
   ended-by   :- ::session.schema/ended-by]
  ;; an explicitly empty id list matches nothing; `IN ()` is not valid SQL anywhere
  (if (and (contains? conditions :id) (empty? (:id conditions)))
    0
    (t2/update! :model/Session
                (cond-> (assoc conditions :ended_at nil)
                  (:id conditions) (update :id (fn [ids] [:in ids])))
                {:ended_at         :%now
                 :end_reason       reason
                 ;; a bare keyword is a column reference, so `:self` writes the row's own `user_id`
                 :ended_by_user_id (if (= ended-by :self) :user_id ended-by)
                 :key_hashed       nil})))

(mu/defn end-sessions-by-ids! :- ms/IntGreaterThanOrEqualToZero
  "[[end-sessions!]] for the Sessions with `ids`, in batches of [[*end-batch-size*]], returning the total number ended.
  An empty `ids` ends nothing."
  [ids      :- [:sequential :string]
   reason   :- ::session.schema/end-reason
   ended-by :- ::session.schema/ended-by]
  (transduce (map (fn [batch] (end-sessions! {:id batch} reason ended-by)))
             +
             0
             (partition-all *end-batch-size* ids)))

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

(mu/defn delete-sessions-ended-long-ago! :- ms/IntGreaterThanOrEqualToZero
  "Delete the Sessions whose recorded ending is more than [[ended-session-retention-days]] old, returning the number
  deleted. A live session is never deleted, whatever its age."
  []
  (let [db-type (mdb/db-type)
        cutoff  (h2x/add-interval-honeysql-form db-type (h2x/current-datetime-honeysql-form db-type)
                                                (- ended-session-retention-days) :day)]
    (t2/delete! :model/Session :ended_at [:< cutoff])))

(mu/defn delete-expired-mcp-sessions! :- ms/IntGreaterThanOrEqualToZero
  "Delete the MCP-backed `core_session` rows older than `max-age-minutes`, past their own `expires_at`, or (when
  `idle-timeout-seconds` is given) idle longer than `idle-timeout-seconds`. Returns the number of rows deleted.

  Only MCP rows: they are not sessions, so they are deleted outright rather than kept on record like an ended
  session (see [[sessions-with-unrecorded-ending]])."
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
