(ns metabase-enterprise.notification-admin.api
  "Admin endpoints for notifications (card-type alerts). Gated behind the `:audit-app` feature flag
  and `check-superuser`. Status + last_sent_at are derived from SQL joins on notification_card,
  report_card, core_user, and a windowed task_run subquery. Classification is a single SQL `CASE`
  expression ([[status-expr]]) referenced both as a projected column and in the `:status` filter
  WHERE clause, so the filter and the response field can't drift."
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.notification.api :as notification-api]
   [metabase.notification.models :as models.notification]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::status-state
  [:enum :healthy :orphaned_card :orphaned_creator :failing :abandoned])

(mr/def ::sort-column
  [:enum :last_sent_at :card_name :creator_name :updated_at])

(mr/def ::sort-direction
  [:enum :asc :desc])

(mr/def ::list-row
  [:map
   [:id           ms/PositiveInt]
   [:active       :boolean]
   [:creator_id   [:maybe ms/PositiveInt]]
   [:created_at   ms/TemporalInstant]
   [:updated_at   ms/TemporalInstant]
   [:payload_type :keyword]
   [:payload_id   [:maybe ms/PositiveInt]]
   [:status       ::status-state]
   [:last_sent_at [:maybe ms/TemporalInstant]]])

(mr/def ::list-response
  [:map
   [:data   [:sequential ::list-row]]
   [:total  ms/IntGreaterThanOrEqualToZero]
   [:limit  [:maybe ms/PositiveInt]]
   [:offset [:maybe ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::detail-response ::list-row)

(mr/def ::bulk-response
  [:map
   [:updated ms/IntGreaterThanOrEqualToZero]])

(defn- handler-ids-with-raw-value-matching
  "Set of notification_handler IDs whose raw-value (external) recipients have `details.value`
  satisfying `pred` (a 1-arg fn applied to the lowercased value). Matches across every
  raw-value channel type — `details.value` holds an external email for `:channel/email`
  handlers, a Slack channel/mention (`#sales-alerts`, `@alice`) for `:channel/slack`, and a
  webhook URL for `:channel/http`. Filtered in Clojure rather than SQL: the value lives
  inside a JSON map and `notification_recipient.details` is a `TEXT` column — every dialect
  would need a different JSON-extraction expression to query it cleanly. Bounded by the
  raw-value recipient count, which is admin-search-cadence small."
  [pred]
  (->> (t2/select [:model/NotificationRecipient :notification_handler_id :details]
                  :type :notification-recipient/raw-value)
       (into #{}
             (comp (filter #(some-> % :details :value u/lower-case-en pred))
                   (map :notification_handler_id)))))

(defn- notification-ids-with-recipient-email
  "Notification IDs whose recipients (user or raw-value) match `email` exactly. One SQL query
  unions both paths: user-recipients via an indexed `core_user.email` equality, raw-value
  recipients via a pre-resolved set of handler IDs from an in-memory scan."
  [email]
  (let [lower-email     (u/lower-case-en email)
        raw-handler-ids (handler-ids-with-raw-value-matching #(= % lower-email))
        user-clause     [:and
                         [:= :nr.type "notification-recipient/user"]
                         [:= [:lower :cu.email] lower-email]]
        where-clause    (if (seq raw-handler-ids)
                          [:or user-clause [:in :notification_handler.id raw-handler-ids]]
                          user-clause)]
    (t2/select-fn-set
     :notification_id (t2/table-name :model/NotificationHandler)
     {:join      [[(t2/table-name :model/NotificationRecipient) :nr]
                  [:= :nr.notification_handler_id :notification_handler.id]]
      :left-join [[:core_user :cu] [:= :cu.id :nr.user_id]]
      :where     where-clause})))

(defn- wildcard-string
  "`%foo%` substring pattern with the input lowercased. Mirrors
  [[metabase.users.models.user/wildcard-query]] (private), kept inline here to avoid a
  cross-module dependency on `users` for a one-line helper."
  [s]
  (str "%" (u/lower-case-en s) "%"))

(defn- query-where-clause
  "WHERE clause for the fuzzy `?query=` filter. Substring ILIKE OR'd across:
    - card name (`report_card.name`)
    - creator first/last name + email (`core_user`)
    - user-recipient email (correlated EXISTS)
    - raw-value-recipient email (pre-resolved handler IDs from an in-memory scan)
  The recipient branches mirror the structured `?recipient_email=` filter so user-typed text
  finds the same set of alerts a picker click would, just less precisely."
  [query]
  (let [lower-q          (u/lower-case-en query)
        wildcard         (wildcard-string query)
        raw-handler-ids  (handler-ids-with-raw-value-matching #(str/includes? % lower-q))
        recipient-exists [:exists
                          {:select [[1]]
                           :from   [[(t2/table-name :model/NotificationHandler) :rnh]]
                           :join   [[(t2/table-name :model/NotificationRecipient) :rnr]
                                    [:= :rnr.notification_handler_id :rnh.id]
                                    [:core_user :rcu] [:= :rcu.id :rnr.user_id]]
                           :where  [:and
                                    [:= :rnh.notification_id :notification.id]
                                    [:= :rnr.type "notification-recipient/user"]
                                    [:like [:lower :rcu.email] wildcard]]}]
        always-on        [[:like [:lower :c.name]         wildcard]
                          [:like [:lower :cu.first_name]  wildcard]
                          [:like [:lower :cu.last_name]   wildcard]
                          [:like [:lower :cu.email]       wildcard]
                          recipient-exists]
        branches         (cond-> always-on
                           (seq raw-handler-ids)
                           (conj [:in :notification.id
                                  {:select [:notification_id]
                                   :from   [(t2/table-name :model/NotificationHandler)]
                                   :where  [:in :id raw-handler-ids]}]))]
    (into [:or] branches)))

(def ^:private status-lookback-days
  "How far back to consider alert-type TaskRuns when computing `failing`/`abandoned`/`healthy`."
  90)

(defn- latest-run-per-card
  "Honey.sql subquery: one row per card with the most recent alert-type TaskRun's status and
  ended_at, within [[status-lookback-days]]. Uses `ROW_NUMBER() OVER (PARTITION BY entity_id)`
  — supported on H2, Postgres 8.4+, MySQL 8.0+, MariaDB 10.2+."
  []
  {:select [:entity_id :status :ended_at]
   :from   [[{:select [:entity_id :status :ended_at
                       [[:over [[:row_number]
                                {:partition-by [:entity_id]
                                 :order-by     [[:started_at :desc]]}]]
                        :rn]]
              :from   [:task_run]
              :where  [:and
                       [:= :run_type "alert"]
                       [:= :entity_type "card"]
                       [:> :started_at (h2x/add-interval-honeysql-form
                                        (mdb/db-type) (mi/now) (- status-lookback-days) :day)]]}
             :sub]]
   :where  [:= :sub.rn 1]})

(def ^:private status-expr
  "SQL `CASE` classifying a notification's status from the joined report_card / core_user /
  latest-run columns. Shared between the SELECT projection and the `:status` WHERE filter so
  they can't drift."
  [:case
   [:or [:= :c.id nil] [:= :c.archived true]] "orphaned_card"
   [:= :cu.is_active false]                   "orphaned_creator"
   [:= :lr.status "failed"]                   "failing"
   [:= :lr.status "abandoned"]                "abandoned"
   :else                                      "healthy"])

(def ^:private last-sent-at-expr
  "`ended_at` of the latest alert-run, but only when it succeeded. A `:failed`/`:abandoned` run
  also has `ended_at` populated — this `CASE` is what keeps those out of `last_sent_at`."
  [:case [:= :lr.status "success"] :lr.ended_at :else nil])

(def ^:private sort-column->order-by
  "Maps the public `sort_column` enum to the SQL expression used in `ORDER BY`. Uses raw
  expressions rather than the SELECT aliases because H2 does not resolve aliases inside
  expressions (e.g. wrapping `last_sent_at` in a `CASE` for nulls-last). Whitelist; any value
  outside this map is rejected by the `::sort-column` malli enum upstream."
  {:last_sent_at last-sent-at-expr
   :card_name    :c.name
   :creator_name [:coalesce :cu.last_name :cu.first_name :cu.email]
   :updated_at   :notification.updated_at})

(defn- channel-exists
  "Honey `EXISTS` correlated with `:notification.id`: TRUE when the notification has at least one
  handler for this channel. Subquery instead of JOIN so the outer query needs no `DISTINCT` —
  required because `SELECT DISTINCT … ORDER BY <expr>` is rejected by H2."
  [channel]
  [:exists
   {:select [[1]]
    :from   [(t2/table-name :model/NotificationHandler)]
    :where  [:and
             [:= :notification_handler.notification_id :notification.id]
             [:= :notification_handler.channel_type channel]]}])

(defn- base-list-query
  "Select notifications plus `:status` / `:last_sent_at` / `:card_name` / `:creator_name`
  computed inline. The status joins run unconditionally because [[status-expr]] references them
  on every row. We project `card_name` and `creator_name` so they're sortable by alias under
  `SELECT … ORDER BY` (alias-only sort keys side-step the H2 DISTINCT-vs-expression restriction
  even though we no longer use DISTINCT — keeps the contract uniform)."
  [{:keys [active creator_id card_id recipient_email channel query]}]
  (cond-> {:select [:notification.id
                    :notification.active
                    :notification.creator_id
                    :notification.created_at
                    :notification.updated_at
                    :notification.payload_type
                    :notification.payload_id
                    [status-expr                                            :status]
                    [last-sent-at-expr                                      :last_sent_at]
                    [:c.name                                                :card_name]
                    [[:coalesce :cu.last_name :cu.first_name :cu.email]     :creator_name]]
           :from   [:notification]
           :where  [:= :notification.payload_type "notification/card"]}

    true
    (-> (sql.helpers/left-join [:notification_card :nc] [:= :nc.id :notification.payload_id])
        (sql.helpers/left-join [:report_card :c]        [:= :c.id :nc.card_id])
        (sql.helpers/left-join [:core_user :cu]         [:= :cu.id :notification.creator_id])
        (sql.helpers/left-join [(latest-run-per-card) :lr] [:= :lr.entity_id :nc.card_id]))

    (some? active)
    (sql.helpers/where [:= :notification.active active])

    creator_id
    (sql.helpers/where [:= :notification.creator_id creator_id])

    card_id
    (sql.helpers/where [:= :nc.card_id card_id])

    channel
    (sql.helpers/where (channel-exists channel))

    recipient_email
    (sql.helpers/where
     (let [ids (notification-ids-with-recipient-email recipient_email)]
       (if (seq ids) [:in :notification.id ids] [:= 1 0])))

    (not (str/blank? query))
    (sql.helpers/where (query-where-clause query))))

(defn- status-where
  "WHERE clause filtering to rows where [[status-expr]] equals `status`. Comparing against the
  same `CASE` expression the SELECT projects keeps filter and classifier from drifting."
  [status]
  [:= status-expr (name status)])

(defn- order-by-clauses
  "Resolve `sort_column` + `sort_direction` (both already malli-validated enums) into an
  honeysql `:order-by` vector. Pushes nulls last unconditionally — H2/Postgres/MySQL all default
  to NULLS-FIRST under DESC, which would surface never-sent alerts at the top of the table; the
  pre-cond CASE forces nulls to the trailing slot regardless of dialect or direction. Always
  tie-breaks on `notification.id desc` so paging is stable across pages with equal sort keys."
  [sort-column sort-direction]
  (let [col (sort-column->order-by sort-column)
        dir (or sort-direction :desc)]
    [[[:case [:= col nil] 1 :else 0] :asc]
     [col dir]
     [:notification.id :desc]]))

(defn- list-query
  [{:keys [status sort_column sort_direction] :as filters}]
  (cond-> (base-list-query (dissoc filters :status :sort_column :sort_direction))
    status (sql.helpers/where (status-where status))
    true   (assoc :order-by (order-by-clauses (or sort_column :updated_at) sort_direction))))

(defn- count-query
  [filters]
  (-> (list-query filters)
      (assoc :select [[[:count :notification.id] :count]])
      (dissoc :order-by)))

(defn- coerce-status
  "`:status` comes from SQL as a string; coerce to the keyword the response schema expects."
  [row]
  (update row :status keyword))

(defn- list-notifications
  "Single SQL query. Status joins (card, creator, latest-run window) are always applied so we can
  classify every row inline — no separate post-query materialization. Pagination in SQL."
  [{:keys [limit offset] :as filters}]
  (let [base-filters (dissoc filters :limit :offset)
        page-rows    (t2/select :model/Notification
                                (assoc (list-query base-filters)
                                       :limit  limit
                                       :offset offset))
        total        (or (:count (t2/query-one (count-query base-filters))) 0)]
    {:data   (vec (models.notification/hydrate-notification (mapv coerce-status page-rows)))
     :total  total
     :limit  limit
     :offset offset}))

;; snake_case query params are intentional here — they match the existing
;; `metabase.notification.api.notification` endpoints so clients can share param names between
;; the public and admin surfaces.
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/" :- ::list-response
  "List card-type notifications (alerts) for admin management. Supports pagination (`limit` +
  `offset` query params — handled by the offset-paging middleware), filtering, and sorting."
  [_route
   {:keys [active status creator_id card_id recipient_email channel query sort_column sort_direction]} :-
   [:map
    [:active          {:optional true} [:maybe ms/BooleanValue]]
    [:status          {:optional true} ::status-state]
    [:creator_id      {:optional true} ms/PositiveInt]
    [:card_id         {:optional true} ms/PositiveInt]
    [:recipient_email {:optional true} ms/NonBlankString]
    [:channel         {:optional true} ms/NonBlankString]
    [:query           {:optional true} ms/NonBlankString]
    [:sort_column     {:default :updated_at} ::sort-column]
    [:sort_direction  {:default :desc}       ::sort-direction]]]
  (api/check-superuser)
  (list-notifications {:limit           (or (request/limit) 50)
                       :offset          (or (request/offset) 0)
                       :active          active
                       :status          status
                       :creator_id      creator_id
                       :card_id         card_id
                       :recipient_email recipient_email
                       :channel         channel
                       :query           query
                       :sort_column     sort_column
                       :sort_direction  sort_direction}))

(defn- get-notification-detail
  "Fetch a single card-type notification with `:status` and `:last_sent_at`. Returns nil if the
  notification doesn't exist or isn't a card-type notification — the caller maps that to a 404."
  [id]
  (when-let [row (t2/select-one :model/Notification
                                (-> (list-query {})
                                    (sql.helpers/where [:= :notification.id id])
                                    (dissoc :order-by)))]
    (models.notification/hydrate-notification (coerce-status row))))

(api.macros/defendpoint :get "/:id" :- ::detail-response
  "Get a single card-type notification with status and last_sent_at. 404 if the notification
  doesn't exist or isn't a card-type notification."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (get-notification-detail id)))

(defn- action->update-map
  [action owner-id]
  (case (keyword action)
    :archive      {:active false}
    :unarchive    {:active true}
    :change-owner (do (api/check (integer? owner-id) [400 "owner_id required for change-owner"])
                      {:creator_id owner-id})))

(defn- bulk-update!
  "Apply `update-map` to all card-type notifications in `ids` in a single SQL update. Returns the
  hydrated before-state so the caller can drive post-commit side effects via
  [[notification-api/publish-notification-update!]]. Select + update run in one transaction so
  the snapshot matches what the update started from."
  [update-map ids]
  (t2/with-transaction [_conn]
    (let [before (-> (t2/select :model/Notification
                                :id           [:in ids]
                                :payload_type :notification/card)
                     models.notification/hydrate-notification
                     vec)]
      (t2/update! :model/Notification
                  :id           [:in ids]
                  :payload_type :notification/card
                  update-map)
      before)))

(api.macros/defendpoint :post "/bulk" :- ::bulk-response
  "Bulk-archive, -unarchive, or -change-owner a set of notifications. The per-notification
  `:active` flip goes through `:model/Notification`'s `before-update` hook, which creates / tears
  down the Quartz triggers. Recipient emails and `:event/notification-update` audit events are
  published via the shared [[notification-api/publish-notification-update!]] helper so this
  endpoint's side-effect contract can't drift from `PUT /api/notification/:id`."
  [_route _query
   {:keys [notification_ids action owner_id]} :-
   [:map
    [:notification_ids [:sequential {:min 1} ms/PositiveInt]]
    [:action           [:enum "archive" "unarchive" "change-owner"]]
    [:owner_id         {:optional true} ms/PositiveInt]]]
  (api/check-superuser)
  (let [update-map (action->update-map action owner_id)
        before     (bulk-update! update-map notification_ids)
        after      (->> (t2/select :model/Notification :id [:in (mapv :id before)])
                        models.notification/hydrate-notification
                        (m/index-by :id))]
    (doseq [b    before
            :let [a (get after (:id b))]
            :when a]
      (notification-api/publish-notification-update! a b))
    {:updated (count before)}))
