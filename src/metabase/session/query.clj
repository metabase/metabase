(ns metabase.session.query
  "The HoneySQL the session module builds but does not run: which `core_session` rows are still live.
  `metabase.server.db` compiles [[live-session-conditions]] into its per-request authentication query, and the
  `session-management` enterprise module builds its listing and revocation queries on the same predicates, so a
  session that stops authenticating also stops being listed."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.session.schema :as session.schema]
   [metabase.settings.core :as setting]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def mcp-provider
  "The `auth_identity.provider` stamped on `core_session` rows created for MCP clients. [[live-session-conditions]]
  treats a row carrying it as not live, so such rows neither authenticate a request nor appear in session management."
  "mcp")

(def not-mcp-session
  "The HoneySQL predicate for \"this `core_session` row was not created for an MCP client\", for a query using
  [[session-from-and-joins]]."
  ;; null-safe: a null provider is a normal session (a password reset, or a row predating the v58
  ;; `auth_identity_id` column), and `provider <> 'mcp'` alone would drop those, since NULL <> 'mcp' is NULL
  [:or [:= :auth_identity.provider nil]
   [:not= :auth_identity.provider (h2x/literal mcp-provider)]])

(def session-left-joins
  "The `:left-join`s from a `core_session` row aliased `session` that [[live-session-conditions]] needs: they bind
  the aliases `user`, `tenant` and `auth_identity`. For a query that starts from another table and joins `session`
  itself; a query that starts from `core_session` uses [[session-from-and-joins]]."
  ;; all LEFT joins: a session whose user row, tenant, or auth identity is missing must still be *considered* (and
  ;; then rejected, or bucketed as `unknown`) rather than silently dropped by an inner join
  [[:core_user :user] [:= :session.user_id :user.id]
   [:tenant]          [:= :tenant.id :user.tenant_id]
   [:auth_identity]   [:= :auth_identity.id :session.auth_identity_id]])

(def session-from-and-joins
  "The `:from`/`:left-join` a query must use for [[live-session-conditions]] to resolve. Binds the aliases `session`,
  `user`, `tenant` and `auth_identity`."
  {:from      [[:core_session :session]]
   :left-join session-left-joins})

(mu/defn liveness-params :- ::session.schema/liveness-params
  "The [[live-session-conditions]] inputs for this instance right now."
  ;; the tenant flag mirrors what `metabase.server.middleware.session` passes for the per-request lookup: if a
  ;; tenant's sessions can't authenticate, they mustn't be listed as live either
  []
  {:db-type                 (mdb/db-type)
   :max-age-minutes         (config/config-int :max-session-age)
   :enable-tenants?         (boolean (and (premium-features/enable-tenants?)
                                          (setting/get :use-tenants)))
   :session-timeout-seconds (request/enabled-session-timeout-seconds)})

(mu/defn liveness-predicates :- [:map-of :keyword :any]
  "The HoneySQL predicates a `core_session` row must satisfy to be *live*, keyed by what each one checks, so that a
  caller can name which one a row fails (the nightly sweep records that as the session's end reason). Pure, for the
  same reason as [[live-session-conditions]]."
  [{:keys [db-type max-age-minutes enable-tenants? session-timeout-seconds]}
   :- ::session.schema/liveness-params]
  (let [now (h2x/current-datetime-honeysql-form db-type)]
    (cond-> {;; a recorded ending is final, whatever the predicates below would say now
             :not-ended     [:= :session.ended_at nil]
             ;; deactivating a user does not delete their session rows, but those rows are dead
             :user-active   [:= :user.is_active true]
             ;; when tenants are off, an external user's session is dead no matter what the tenant row says
             :tenant-active (if enable-tenants?
                              [:or [:= :tenant.id nil] :tenant.is_active]
                              [:= :tenant.id nil])
             ;; the session's own hard expiry and, below, the instance-wide maximum age: one end reason, `expired`
             :not-expired   (cond-> [:and [:or [:= :session.expires_at nil] [:> :session.expires_at now]]]
                              max-age-minutes
                              (conj [:> :session.created_at
                                     (h2x/add-interval-honeysql-form db-type now (- max-age-minutes) :minute)]))
             :not-mcp       not-mcp-session}
      session-timeout-seconds
      (assoc :not-timed-out [:> [:coalesce :session.last_active_at :session.created_at]
                             (h2x/add-interval-honeysql-form db-type now (- session-timeout-seconds) :second)]))))

(mu/defn live-session-conditions :- [:sequential :any]
  "The HoneySQL predicates a `core_session` row must satisfy to be *live* — i.e. to still authenticate a request.

  NOTE: This function is called and memoized per distinct combo of arguments in session middleware. Therefore, it is
  absolutely imperative (heh) that this function must be pure: it must return the same thing given the same arguments
  every time it's called. For example, `enable-tenants?` cannot be derived from the current setting value, and must be
  passed in."
  [liveness :- ::session.schema/liveness-params]
  (let [predicates (liveness-predicates liveness)]
    ;; a fixed order, so the compiled SQL is the same for the same inputs
    (into [] (keep predicates) [:not-ended :user-active :tenant-active :not-expired :not-mcp :not-timed-out])))

(mu/defn live-expr :- ::h2x/honeysql-expr
  "1 when the `core_session` row is live, 0 when it has ended, whether or not the ending has been recorded yet. 1/0
  rather than a boolean, since MySQL has no boolean type. For a query using [[session-from-and-joins]] or
  [[session-left-joins]]."
  [liveness :- ::session.schema/liveness-params]
  [:case (into [:and] (live-session-conditions liveness)) [:inline 1] :else [:inline 0]])
