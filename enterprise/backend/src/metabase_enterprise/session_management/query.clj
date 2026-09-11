(ns metabase-enterprise.session-management.query
  "The HoneySQL session management builds but does not run: how the live sessions are filtered and sorted.
  [[metabase-enterprise.session-management.db]] is what executes these against the application database. The
  liveness predicates themselves come from the `session` module, so whatever would not authenticate a request is not
  listed either."
  (:require
   [metabase-enterprise.session-management.schema :as sm.schema]
   [metabase.session.core :as session]
   [metabase.session.schema :as session.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def session-list-from-and-joins
  "`metabase.session.core/session-from-and-joins` plus the `lh` alias for the device columns. `login_history` has at
  most one row per session, so this cannot multiply rows."
  ;; kept separate because the per-request auth lookup runs on every API call and must not pay for this join
  (update session/session-from-and-joins :left-join into [[:login_history :lh] [:= :lh.session_id :session.id]]))

(def last-active-expr
  "`last_active_at`, falling back to `created_at` for a session that has never been touched. The same expression the
  idle-timeout predicate uses, so filtering and sorting agree with expiry."
  [:coalesce :session.last_active_at :session.created_at])

(def provider-expr
  "The provider as callers see it: a session with no auth identity row reads as `unknown` rather than null."
  [:coalesce :auth_identity.provider (h2x/literal "unknown")])

(def type-expr
  "The session type as callers see it. Derived from whether the row carries an anti-CSRF token, so that
  `anti_csrf_token` itself never has to leave the database."
  [:case [:= :session.anti_csrf_token nil] (h2x/literal "normal")
   :else (h2x/literal "full-app-embed")])

(mu/defn filters->where :- [:sequential :any]
  "The HoneySQL predicates for `filters` (see `::sm.schema/session-filters`), for a query using
  `metabase.session.core/session-from-and-joins`. Independent of the current request so that listing sessions and
  revoking them by criteria stay in lockstep: whatever a filtered list shows is exactly what the same filters would
  revoke.

  Date ranges are half-open — `after` is inclusive, `before` exclusive — so adjacent ranges neither overlap nor
  leave a gap."
  [{:keys [user-id ids provider type tenancy
           created-before created-after last-active-before last-active-after]}
   :- ::sm.schema/session-filters]
  (cond-> []
    user-id
    (conj [:= :session.user_id user-id])

    ;; an explicitly empty id list matches nothing; `IN ()` is not valid SQL anywhere
    (some? ids)
    (conj (if (seq ids) [:in :session.id ids] [:inline false]))

    ;; `unknown` is the bucket for sessions with no auth identity row, not a provider anyone can log in with
    (= provider "unknown")
    (conj [:= :auth_identity.provider nil])

    (and provider (not= provider "unknown"))
    (conj [:= :auth_identity.provider provider])

    ;; only full-app-embed sessions carry an anti-CSRF token
    (= type "normal")
    (conj [:= :session.anti_csrf_token nil])

    (= type "full-app-embed")
    (conj [:not= :session.anti_csrf_token nil])

    (= tenancy :internal)
    (conj [:= :user.tenant_id nil])

    (= tenancy :external)
    (conj [:not= :user.tenant_id nil])

    created-after      (conj [:>= :session.created_at created-after])
    created-before     (conj [:< :session.created_at created-before])
    last-active-after  (conj [:>= last-active-expr last-active-after])
    last-active-before (conj [:< last-active-expr last-active-before])))

(mu/defn session-where :- :any
  "The `:where` for a session-management query: live, and matching `filters`."
  [liveness :- ::session.schema/liveness-params
   filters  :- ::sm.schema/session-filters]
  (into [:and] cat [(session/live-session-conditions liveness) (filters->where filters)]))

(mu/defn revoke-where :- :any
  "The predicates a `core_session` row must satisfy to be revoked by these criteria: live, matching `filters`, and —
  when `exclude-current?` — not the session `current-key-hash` identifies. The hash is only ever compared in SQL, so
  `key_hashed` never leaves the database."
  [liveness         :- ::session.schema/liveness-params
   filters          :- ::sm.schema/session-filters
   current-key-hash :- [:maybe :string]
   exclude-current? :- :boolean]
  (cond-> (session-where liveness filters)
    (and exclude-current? current-key-hash)
    (conj [:not= :session.key_hashed current-key-hash])))

(defn session-order-by
  "The `:order-by` for the session list."
  [sort-column sort-direction]
  [[(case sort-column
      :last_active_at last-active-expr
      :user_email     :user.email
      :provider       provider-expr
      :session.created_at)
    sort-direction]
   ;; a stable tiebreaker, so paging can't show or skip a row because two sessions share a timestamp
   [:session.id :asc]])
