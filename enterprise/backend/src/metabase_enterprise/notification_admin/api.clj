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

(defn- scoped-list-query
  "Base list query for `filters`, plus an optional `WHERE id IN (id-whitelist)` clause and
  deterministic `updated_at desc` ordering. `id-whitelist` nil = no whitelist (full base query);
  empty set = force empty result."
  [filters id-whitelist]
  (cond-> (base-list-query filters)
    (and id-whitelist (seq id-whitelist))
    (sql.helpers/where [:in :notification.id id-whitelist])

    (and id-whitelist (empty? id-whitelist))
    (sql.helpers/where [:= 1 0])

    true
    (assoc :order-by [[:notification.updated_at :desc]])))

(defn- count-query
  "Count matching distinct notifications. Mirrors [[scoped-list-query]]'s WHERE/JOIN shape."
  [filters id-whitelist]
  (-> (scoped-list-query filters id-whitelist)
      (assoc :select [[[:count [:distinct :notification.id]] :count]])
      (dissoc :select-distinct :order-by)))

(defn- ids-matching-health
  "Return the set of notification ids within `filters` that match `health`. Runs a lightweight
  SELECT id, creator_id over the base query (not full rows) and lets `health/compute-for-rows`
  classify; that helper only needs `:id` and `:creator_id`."
  [health filters]
  (let [rows     (t2/query (-> (base-list-query filters)
                               (assoc :select [[:notification.id :id]
                                               [:notification.creator_id :creator_id]])
                               (dissoc :select-distinct)))
        enriched (notification-admin.health/compute-for-rows rows)]
    (into #{} (comp (filter #(= health (:health %))) (map :id)) enriched)))

(defn- list-notifications
  "Shared implementation for `GET /`. Pagination always runs in SQL. When a `:health` filter is
  set we first compute the matching id set via a lightweight scan (id + creator_id only, so the
  shared `compute-for-rows` helper can classify), then scope the main query to `WHERE id IN
  (ids)`. Health is re-computed for the page's hydrated rows so the response field is present.
  O(|matching base rows|) for the classify scan + O(page size) for the main fetch."
  [{:keys [limit offset health] :as filters}]
  (let [base-filters (dissoc filters :limit :offset :health)
        id-whitelist (when health (ids-matching-health health base-filters))
        page-rows    (t2/select :model/Notification
                                (assoc (scoped-list-query base-filters id-whitelist)
                                       :limit  limit
                                       :offset offset))
        enriched     (notification-admin.health/compute-for-rows page-rows)
        total        (if (and id-whitelist (empty? id-whitelist))
                       0
                       (or (:count (t2/query-one (count-query base-filters id-whitelist))) 0))]
    {:data   (vec (models.notification/hydrate-notification enriched))
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
