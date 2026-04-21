(ns metabase-enterprise.notification-admin.api
  "Admin endpoints for notifications (card-type alerts). Gated behind the `:audit-app` feature flag
  and `check-superuser`. Health + last_sent_at computation lives in `notification-admin.health`."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.notification-admin.health :as notification-admin.health]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.notification.models :as models.notification]
   [metabase.request.core :as request]
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
   [:created_at   :any]
   [:updated_at   :any]
   [:payload_type :keyword]
   [:payload_id   [:maybe ms/PositiveInt]]
   [:health       ::health-state]
   [:last_sent_at [:maybe :any]]])

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

(defn- notification-ids-matching-recipient-email
  "Return the set of notification ids whose handlers include a recipient whose effective email
  matches `email`. Matches either `core_user.email` (when recipient has a `user_id`) or the
  `details.value` of a raw-value recipient. We do both halves in SQL for the user case and in
  Clojure for raw-value — `notification_recipient.details` is stored as JSON text and portable
  JSON querying across H2 / Postgres / MySQL is not worth its own abstraction for one filter."
  [email]
  (let [user-side (t2/select-fn-set
                   :notification_id
                   [:model/NotificationHandler :notification_handler.notification_id]
                   {:select-distinct [:notification_handler.notification_id]
                    :from            [:notification_handler]
                    :join            [:notification_recipient
                                      [:= :notification_recipient.notification_handler_id :notification_handler.id]
                                      :core_user
                                      [:= :core_user.id :notification_recipient.user_id]]
                    :where           [:= :core_user.email email]})
        ;; realize raw-value recipients so the JSON :details is deserialized, then filter in memory
        raw-side  (->> (t2/select :model/NotificationRecipient
                                  :type :notification-recipient/raw-value)
                       (filter (fn [r] (= email (get-in r [:details :value]))))
                       (map :notification_handler_id)
                       seq)
        raw-nids  (when (seq raw-side)
                    (t2/select-fn-set :notification_id :model/NotificationHandler
                                      :id [:in raw-side]))]
    (into (or user-side #{}) (or raw-nids #{}))))

(defn- base-list-query
  [{:keys [status creator_id card_id recipient_email channel]}]
  (cond-> {:select-distinct [:notification.id
                             :notification.active
                             :notification.creator_id
                             :notification.created_at
                             :notification.updated_at
                             :notification.payload_type
                             :notification.payload_id]
           :from            [:notification]
           :where           [:= :notification.payload_type "notification/card"]}

    (= status "active")
    (sql.helpers/where [:= :notification.active true])

    (= status "archived")
    (sql.helpers/where [:= :notification.active false])

    creator_id
    (sql.helpers/where [:= :notification.creator_id creator_id])

    card_id
    (-> (sql.helpers/left-join
         :notification_card
         [:and
          [:= :notification_card.id :notification.payload_id]
          [:= :notification.payload_type "notification/card"]])
        (sql.helpers/where [:= :notification_card.card_id card_id]))

    channel
    (-> (sql.helpers/left-join
         :notification_handler
         [:= :notification_handler.notification_id :notification.id])
        (sql.helpers/where [:= :notification_handler.channel_type channel]))

    recipient_email
    (sql.helpers/where
     (let [matching-ids (notification-ids-matching-recipient-email recipient_email)]
       (if (seq matching-ids)
         [:in :notification.id matching-ids]
         ;; no matches — force an empty result
         [:= 1 0])))))

(defn- ordered-list-query
  "Base list query with a deterministic `updated_at desc` ordering applied — used by both
  pagination paths so the page you land on is stable."
  [filters]
  (assoc (base-list-query filters)
         :order-by [[:notification.updated_at :desc]]))

(defn- count-query
  "Count matching distinct notifications for `filters`, without pagination. Reuses [[base-list-query]]
  so the WHERE/JOIN shape stays identical."
  [filters]
  (-> (base-list-query filters)
      (assoc :select [[[:count [:distinct :notification.id]] :count]])
      (dissoc :select-distinct)))

(defn- list-unfiltered-by-health
  "Default list path — pagination happens in SQL. Health + `:last_sent_at` are computed only for
  the current page. O(page size) work per request."
  [{:keys [limit offset] :as filters}]
  (let [base-filters (dissoc filters :limit :offset :health)
        page-rows    (t2/select :model/Notification
                                (assoc (ordered-list-query base-filters)
                                       :limit  limit
                                       :offset offset))
        enriched     (notification-admin.health/compute-for-rows page-rows)
        total        (or (:count (t2/query-one (count-query base-filters))) 0)]
    {:data   (vec (models.notification/hydrate-notification enriched))
     :total  total
     :limit  limit
     :offset offset}))

(defn- list-filtered-by-health
  "Health-filtered path — we must materialize every matching row so we can compute health and
  filter on it. O(matching rows) in memory; firefighter use case where exactness matters more
  than scale."
  [{:keys [limit offset health] :as filters}]
  (let [rows     (t2/select :model/Notification
                            (ordered-list-query (dissoc filters :limit :offset :health)))
        enriched (notification-admin.health/compute-for-rows rows)
        matching (filter #(= health (:health %)) enriched)
        page     (->> matching (drop offset) (take limit))]
    {:data   (vec (models.notification/hydrate-notification page))
     :total  (count matching)
     :limit  limit
     :offset offset}))

(defn- list-notifications
  "Shared implementation for `GET /`. Two paths: SQL-side pagination for the default case, full
  in-memory materialization when a `:health` filter is set (health is post-query computed)."
  [{:keys [health] :as filters}]
  (if health
    (list-filtered-by-health filters)
    (list-unfiltered-by-health filters)))

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
  "Fetch a single card-type notification and enrich it with `:health` and `:last_sent_at`. Send
  history is linked out to the existing Runs page (filter by entity_id=card_id, run_type=alert).
  Returns nil if the notification doesn't exist or isn't a card-type notification — the caller
  maps that to a 404."
  [id]
  (when-let [row (t2/select-one :model/Notification :id id :payload_type :notification/card)]
    (let [[enriched] (notification-admin.health/compute-for-rows [row])]
      (models.notification/hydrate-notification enriched))))

(api.macros/defendpoint :get "/:id" :- ::detail-response
  "Get a single card-type notification with health and last_sent_at. 404 if the notification
  doesn't exist or isn't a card-type notification."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (get-notification-detail id)))

(defn- bulk-update!
  [action owner-id ids]
  (case (keyword action)
    :archive      (t2/update! :model/Notification
                              :id           [:in ids]
                              :payload_type :notification/card
                              {:active false})
    :unarchive    (t2/update! :model/Notification
                              :id           [:in ids]
                              :payload_type :notification/card
                              {:active true})
    :change-owner (do (api/check (integer? owner-id) [400 "owner_id required for change-owner"])
                      (t2/update! :model/Notification
                                  :id           [:in ids]
                                  :payload_type :notification/card
                                  {:creator_id owner-id}))))

(api.macros/defendpoint :post "/bulk" :- ::bulk-response
  "Bulk-archive, -unarchive, or -change-owner a set of notifications. Runs inside a transaction.
  The per-notification `:active` flip goes through `:model/Notification`'s `before-update` hook,
  which in turn creates / tears down the Quartz triggers — no manual trigger work needed here."
  [_route _query
   {:keys [notification_ids action owner_id]} :-
   [:map
    [:notification_ids [:sequential {:min 1} ms/PositiveInt]]
    [:action           [:enum "archive" "unarchive" "change-owner"]]
    [:owner_id         {:optional true} ms/PositiveInt]]]
  (api/check-superuser)
  (t2/with-transaction [_conn]
    (bulk-update! action owner_id notification_ids))
  {:updated (count notification_ids)})
