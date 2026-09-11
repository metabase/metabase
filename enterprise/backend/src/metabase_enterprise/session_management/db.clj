(ns metabase-enterprise.session-management.db
  "Application database queries for session management, so that no other namespace in the module runs a query itself.
  The HoneySQL they are assembled from lives in [[metabase-enterprise.session-management.query]]."
  (:require
   [metabase-enterprise.session-management.query :as sm.query]
   [metabase-enterprise.session-management.schema :as sm.schema]
   [metabase.session.core :as session]
   [metabase.session.schema :as session.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ^:dynamic *delete-batch-size*
  "How many ids one `DELETE ... WHERE id IN (...)` may name. Revoking by criteria has no upper bound on how many
  sessions it matches, and every id is a bind parameter — pgjdbc refuses a statement with more than 65,535 of them."
  1000)

(mu/defn delete-sessions-by-ids! :- ms/IntGreaterThanOrEqualToZero
  "Delete the Sessions with `ids`, in batches, returning the total number of rows deleted. An empty `ids` deletes
  nothing."
  [ids :- [:sequential :string]]
  (transduce (map (fn [batch]
                    (t2/delete! :model/Session :id [:in batch])))
             +
             0
             (partition-all *delete-batch-size* ids)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Live sessions                                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn live-sessions :- [:sequential :map]
  "The live sessions matching `filters`, newest-relevant-first per `sort-column`/`sort-direction`.

  `current-key-hash` is the hashed session key of the request being served (nil when the caller authenticated some
  other way); the `:current` column is computed in SQL against it so that `key_hashed` itself never leaves the
  database. `anti_csrf_token` likewise stays in the database — only the derived `:type` comes back."
  [liveness         :- ::session.schema/liveness-params
   filters          :- ::sm.schema/session-filters
   sort-column      :- ::sm.schema/session-sort-column
   sort-direction   :- [:enum :asc :desc]
   limit            :- [:maybe ms/PositiveInt]
   offset           :- [:maybe ms/IntGreaterThanOrEqualToZero]
   current-key-hash :- [:maybe :string]]
  (t2/query
   (cond-> (merge sm.query/session-list-from-and-joins
                  {:select   [[:session.id :id]
                              [:session.user_id :user_id]
                              [:user.email :user_email]
                              [:user.first_name :user_first_name]
                              [:user.last_name :user_last_name]
                              [:session.created_at :created_at]
                              [:session.last_active_at :last_active_at]
                              [:session.expires_at :expires_at]
                              [sm.query/provider-expr :provider]
                              [sm.query/type-expr :type]
                              ;; 1/0 rather than a boolean: MySQL has no boolean type and would hand back a number
                              ;; from a bare comparison anyway, so be explicit and normalise in Clojure
                              [(if current-key-hash
                                 [:case [:= :session.key_hashed current-key-hash] [:inline 1] :else [:inline 0]]
                                 [:inline 0])
                               :current]
                              [:lh.device_id :device_id]
                              [:lh.ip_address :ip_address]
                              [:lh.device_description :user_agent]]
                   :where    (sm.query/session-where liveness filters)
                   :order-by (sm.query/session-order-by sort-column sort-direction)})
     limit  (assoc :limit limit)
     offset (assoc :offset offset))))

(mu/defn- count-where :- ms/IntGreaterThanOrEqualToZero
  "How many `core_session` rows satisfy `where`."
  [where :- :any]
  (-> (t2/query (merge sm.query/session-list-from-and-joins
                       {:select [[[:count [:inline 1]] :count]]
                        :where  where}))
      first
      :count
      long))

(mu/defn live-session-count :- ms/IntGreaterThanOrEqualToZero
  "How many live sessions match `filters`. Uses the same joins and predicates as [[live-sessions]], so the total can
  never disagree with the rows being paged through."
  [liveness :- ::session.schema/liveness-params
   filters  :- ::sm.schema/session-filters]
  (count-where (sm.query/session-where liveness filters)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Revoking sessions                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn revocable-session-count :- ms/IntGreaterThanOrEqualToZero
  "How many live sessions [[revoke-live-sessions!]] would delete for these arguments. Called again after a revoke to
  report how many still match — 0 unless a login raced it."
  [liveness         :- ::session.schema/liveness-params
   filters          :- ::sm.schema/session-filters
   current-key-hash :- [:maybe :string]
   exclude-current? :- :boolean]
  (count-where (sm.query/revoke-where liveness filters current-key-hash exclude-current?)))

(mu/defn revoke-live-sessions! :- ::sm.schema/revocation
  "Delete every live session matching `filters` and report what that did. The criteria are the ones [[live-sessions]]
  takes, so a revoke removes exactly the set a list with the same filters would have shown; rows that are no longer
  live (and MCP-backed rows, which never are) are left alone for the cleanup task.

  When `exclude-current?` the session `current-key-hash` identifies is held back, so a caller sweeping every session
  stays logged in. Either way `:current-revoked?` says whether the caller's own session was one of the rows deleted.

  `:user-ids` has one entry per session deleted rather than per user, so `frequencies` gives the per-user count."
  [liveness         :- ::session.schema/liveness-params
   filters          :- ::sm.schema/session-filters
   current-key-hash :- [:maybe :string]
   exclude-current? :- :boolean]
  (let [current-expr (if current-key-hash
                       ;; 1/0 rather than a boolean, for the same reason as in [[live-sessions]]
                       [:case [:= :session.key_hashed current-key-hash] [:inline 1] :else [:inline 0]]
                       [:inline 0])
        matched      (t2/query (merge session/session-from-and-joins
                                      {:select [[:session.id :id]
                                                [:session.user_id :user_id]
                                                [current-expr :current]]
                                       :where  (sm.query/revoke-where liveness filters current-key-hash
                                                                      exclude-current?)}))
        ;; the select is what tells us which rows (and whose) went, for the response and the audit trail; a DELETE
        ;; over these joined criteria also has no single-statement form that works on H2, MySQL, and Postgres
        revoked      (delete-sessions-by-ids! (mapv :id matched))]
    {:revoked          revoked
     :user-ids         (mapv :user_id matched)
     :current-revoked? (boolean (some #(= 1 (long (:current %))) matched))}))
