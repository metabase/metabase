(ns metabase-enterprise.session-management.db
  "Application database queries for session management, so that no other namespace in the module runs a query itself.
  The HoneySQL they are assembled from lives in [[metabase-enterprise.session-management.query]]."
  (:require
   [metabase-enterprise.session-management.query :as sm.query]
   [metabase-enterprise.session-management.schema :as sm.schema]
   [metabase.session.schema :as session.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
