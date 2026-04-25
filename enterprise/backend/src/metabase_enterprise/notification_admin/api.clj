(ns metabase-enterprise.notification-admin.api
  "Admin endpoints for notifications (card-type alerts). Gated behind the `:audit-app` feature flag
  and `check-superuser`. Health + last_sent_at are derived from SQL joins on notification_card,
  report_card, core_user, and a windowed task_run subquery. Classification is a single SQL `CASE`
  expression ([[health-expr]]) referenced both as a projected column and in the `:health` filter
  WHERE clause, so the filter and the response field can't drift."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.notification.api :as notification-api]
   [metabase.notification.models :as models.notification]
   [metabase.request.core :as request]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::health-state
  [:enum :healthy :orphaned_card :orphaned_creator :failing :abandoned])

(mr/def ::status-filter
  [:enum "active" "archived" "all"])

(mr/def ::list-row
  [:map
   [:id           ms/PositiveInt]
   [:active       :boolean]
   [:creator_id   [:maybe ms/PositiveInt]]
   [:created_at   ms/TemporalInstant]
   [:updated_at   ms/TemporalInstant]
   [:payload_type :keyword]
   [:payload_id   [:maybe ms/PositiveInt]]
   [:health       ::health-state]
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

(defn- recipient-email-exists
  "Honey `EXISTS` correlated with `:notification.id`: TRUE when the notification has a handler
  whose recipient is a user with this email. Raw-value recipients are intentionally not matched
  — their email lives inside the `:details` JSON column and narrowing it in SQL would require
  either a cross-DB LIKE on the serialized text or a JSON-operator abstraction. If that coverage
  becomes important, revisit it separately."
  [email]
  [:exists
   {:select [[1]]
    :from   [[(t2/table-name :model/NotificationHandler) :nh]]
    :join   [[(t2/table-name :model/NotificationRecipient) :nr] [:= :nr.notification_handler_id :nh.id]
             [:core_user :cu]                                   [:= :cu.id :nr.user_id]]
    :where  [:and
             [:= :nh.notification_id :notification.id]
             [:= :cu.email email]]}])

(def ^:private health-lookback-days
  "How far back to consider alert-type TaskRuns when computing `failing`/`abandoned`/`healthy`."
  90)

(defn- latest-run-per-card
  "Honey.sql subquery: one row per card with the most recent alert-type TaskRun's status and
  ended_at, within [[health-lookback-days]]. Uses `ROW_NUMBER() OVER (PARTITION BY entity_id)`
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
                                        (mdb/db-type) (mi/now) (- health-lookback-days) :day)]]}
             :sub]]
   :where  [:= :sub.rn 1]})

(def ^:private health-expr
  "SQL `CASE` classifying a notification's health from the joined report_card / core_user /
  latest-run columns. Shared between the SELECT projection and the `:health` WHERE filter so
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

(defn- base-list-query
  "Select notifications plus `:health` / `:last_sent_at` computed inline. The health joins run
  unconditionally because [[health-expr]] references them on every row."
  [{:keys [status creator_id card_id recipient_email channel]}]
  (cond-> {:select-distinct [:notification.id
                             :notification.active
                             :notification.creator_id
                             :notification.created_at
                             :notification.updated_at
                             :notification.payload_type
                             :notification.payload_id
                             [health-expr       :health]
                             [last-sent-at-expr :last_sent_at]]
           :from            [:notification]
           :where           [:= :notification.payload_type "notification/card"]}

    true
    (-> (sql.helpers/left-join [:notification_card :nc] [:= :nc.id :notification.payload_id])
        (sql.helpers/left-join [:report_card :c]        [:= :c.id :nc.card_id])
        (sql.helpers/left-join [:core_user :cu]         [:= :cu.id :notification.creator_id])
        (sql.helpers/left-join [(latest-run-per-card) :lr] [:= :lr.entity_id :nc.card_id]))

    (= status "active")
    (sql.helpers/where [:= :notification.active true])

    (= status "archived")
    (sql.helpers/where [:= :notification.active false])

    creator_id
    (sql.helpers/where [:= :notification.creator_id creator_id])

    card_id
    (sql.helpers/where [:= :nc.card_id card_id])

    channel
    (-> (sql.helpers/left-join
         :notification_handler
         [:= :notification_handler.notification_id :notification.id])
        (sql.helpers/where [:= :notification_handler.channel_type channel]))

    recipient_email
    (sql.helpers/where (recipient-email-exists recipient_email))))

(defn- health-where
  "WHERE clause filtering to rows where [[health-expr]] equals `health`. Comparing against the
  same `CASE` expression the SELECT projects keeps filter and classifier from drifting."
  [health]
  [:= health-expr (name health)])

(defn- list-query
  [{:keys [health] :as filters}]
  (cond-> (base-list-query (dissoc filters :health))
    health (sql.helpers/where (health-where health))
    true   (assoc :order-by [[:notification.updated_at :desc] [:notification.id :desc]])))

(defn- count-query
  [filters]
  (-> (list-query filters)
      (assoc :select [[[:count [:distinct :notification.id]] :count]])
      (dissoc :select-distinct :order-by)))

(defn- coerce-health
  "`:health` comes from SQL as a string; coerce to the keyword the response schema expects."
  [row]
  (update row :health keyword))

(defn- list-notifications
  "Single SQL query. Health joins (card, creator, latest-run window) are always applied so we can
  classify every row inline — no separate post-query materialization. Pagination in SQL."
  [{:keys [limit offset] :as filters}]
  (let [base-filters (dissoc filters :limit :offset)
        page-rows    (t2/select :model/Notification
                                (assoc (list-query base-filters)
                                       :limit  limit
                                       :offset offset))
        total        (or (:count (t2/query-one (count-query base-filters))) 0)]
    {:data   (vec (models.notification/hydrate-notification (mapv coerce-health page-rows)))
     :total  total
     :limit  limit
     :offset offset}))

;; snake_case query params are intentional here — they match the existing
;; `metabase.notification.api.notification` endpoints so clients can share param names between
;; the public and admin surfaces.
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/" :- ::list-response
  "List card-type notifications (alerts) for admin management. Supports pagination (`limit` +
  `offset` query params — handled by the offset-paging middleware) and filtering."
  [_route
   {:keys [status health creator_id card_id recipient_email channel]} :-
   [:map
    [:status          {:default "active"} ::status-filter]
    [:health          {:optional true}    ::health-state]
    [:creator_id      {:optional true}    ms/PositiveInt]
    [:card_id         {:optional true}    ms/PositiveInt]
    [:recipient_email {:optional true}    ms/NonBlankString]
    [:channel         {:optional true}    ms/NonBlankString]]]
  (api/check-superuser)
  (list-notifications {:limit           (or (request/limit) 50)
                       :offset          (or (request/offset) 0)
                       :status          status
                       :health          health
                       :creator_id      creator_id
                       :card_id         card_id
                       :recipient_email recipient_email
                       :channel         channel}))

(defn- get-notification-detail
  "Fetch a single card-type notification with `:health` and `:last_sent_at`. Returns nil if the
  notification doesn't exist or isn't a card-type notification — the caller maps that to a 404."
  [id]
  (when-let [row (t2/select-one :model/Notification
                                (-> (list-query {})
                                    (sql.helpers/where [:= :notification.id id])
                                    (dissoc :order-by)))]
    (models.notification/hydrate-notification (coerce-health row))))

(api.macros/defendpoint :get "/:id" :- ::detail-response
  "Get a single card-type notification with health and last_sent_at. 404 if the notification
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
