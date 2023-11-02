(ns metabase.events.audit-log
  "This namespace is responsible for publishing events to the audit log. "
  (:require
   [clojure.data :as data]
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.audit-log :as audit-log]
   [metabase.public-settings.premium-features :as premium-features]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)

(methodical/defmethod events/publish-event! :around ::event
  [topic card]
  (when (or (premium-features/enable-audit-app?)
            ;; Cloud Starters won't have the Audit App enabled, but we want to log events in case they upgrade to premium
            (premium-features/is-hosted?))
    (next-method topic card)))

(defn maybe-prepare-update-event-data
  "When `:audit-db/previous` is present in the event-data, we return a map with previous and new versions of the
  objects, _keeping only fields that changed_.

  If `:audit-db/previous` is missing, this is a noop."
  [event]
  (if-let [previous (:audit-log/previous event)]
    (let [new (dissoc event :audit-log/previous)
          [previous-only new-only _both] (data/diff previous new)
          updated-keys (distinct (concat (keys previous-only) (keys new-only)))]
      {:previous (select-keys previous updated-keys)
       :new (select-keys new updated-keys)})
    event))

(derive ::card-event ::event)
(derive :event/card-create ::card-event)
(derive :event/card-update ::card-event)
(derive :event/card-delete ::card-event)

(methodical/defmethod events/publish-event! ::card-event
  [topic card]
  (audit-log/record-event! topic card))

(derive ::card-read-event :metabase/event)
(derive :event/card-read ::card-read-event)

(methodical/defmethod events/publish-event! ::card-read-event
  [topic card]
  (audit-log/record-event! topic card))

(derive ::card-query-event ::event)
(derive :event/card-query ::card-query-event)

(methodical/defmethod events/publish-event! ::card-query-event
  [topic {:keys [card_id] :as object}]
  (let [details (select-keys object [:cached :ignore_cache :context])]
    (audit-log/record-event! topic details api/*current-user-id* :model/Card card_id)))

(derive ::dashboard-event ::event)
(derive :event/dashboard-create ::dashboard-event)
(derive :event/dashboard-delete ::dashboard-event)

(methodical/defmethod events/publish-event! ::dashboard-event
  [topic dashboard]
  (audit-log/record-event! topic dashboard))

(derive ::dashboard-card-event ::event)
(derive :event/dashboard-add-cards ::dashboard-card-event)
(derive :event/dashboard-remove-cards ::dashboard-card-event)

(methodical/defmethod events/publish-event! ::dashboard-card-event
  [topic {:keys [dashcards id]}]
  ;; we expect that the object has just a dashboard :id at the top level
  ;; plus a `:dashcards` attribute which is a vector of the cards added/removed
  (let [details (-> (t2/select-one [:model/Dashboard :description :name] :id id)
                    (assoc :dashcards (for [{:keys [id card_id]} dashcards]
                                           (-> (t2/select-one [:model/Card :name :description], :id card_id)
                                               (assoc :id id)
                                               (assoc :card_id card_id)))))]
   (audit-log/record-event! topic details api/*current-user-id* :model/Dashboard id)))

(derive ::dashboard-read-event ::event)
(derive :event/dashboard-read ::dashboard-read-event)

(methodical/defmethod events/publish-event! ::dashboard-read-event
  [topic dashboard]
  (audit-log/record-event! topic dashboard))

(derive ::table-event ::event)
(derive :event/table-read ::table-event)
(derive :event/table-manual-scan ::table-event)

(methodical/defmethod events/publish-event! ::table-event
  [topic table]
  (audit-log/record-event! topic table))

(derive ::metric-event ::event)
(derive :event/metric-create ::metric-event)
(derive :event/metric-update ::metric-event)
(derive :event/metric-delete ::metric-event)

(methodical/defmethod events/publish-event! ::metric-event
  [topic object]
  (audit-log/record-event! topic object))

(derive ::pulse-event ::event)
(derive :event/pulse-create ::pulse-event)
(derive :event/pulse-delete ::pulse-event)
(derive :event/subscription-unsubscribe ::pulse-event)
(derive :event/subscription-unsubscribe-undo ::pulse-event)
(derive :event/alert-unsubscribe ::pulse-event)
(derive :event/subscription-create ::pulse-event)
(derive :event/subscription-update ::pulse-event)

(defn- create-details-map [pulse name is-alert parent]
  (let [channels  (:channels pulse)
        parent-id (if is-alert :card_id :dashboard_id)]
    {:archived   (:archived pulse)
     :name       name
     parent-id   parent
     :parameters (:parameters pulse)
     :channel    (map :channel_type channels)
     :schedule   (map :schedule_type channels)
     :recipients (map :recipients channels)}))

(methodical/defmethod events/publish-event! ::pulse-event
  [topic {:keys [id details] :as object}]
  ;; Check if topic is a pulse or not (can be an unsubscribe event, which only contains email)
  (let [details-map (if (some? id)
                      (create-details-map object (:name object) false (:dashboard_id object))
                      details)]
    (audit-log/record-event! topic details-map api/*current-user-id* :model/Pulse id)))

(derive ::alert-event ::event)
(derive :event/alert-create ::alert-event)
(derive :event/alert-delete ::alert-event)
(derive :event/alert-update ::alert-event)

(methodical/defmethod events/publish-event! ::alert-event
  [topic {:keys [card] :as alert}]
  (let [card-name (:name card)]
    ;; Alerts are centered around a card/question. Users always interact with the alert via the question
    (audit-log/record-event! topic (create-details-map alert card-name true (:id card)) api/*current-user-id* :mode/Card (:id alert))))

(derive ::segment-event ::event)
(derive :event/segment-create ::segment-event)
(derive :event/segment-update ::segment-event)
(derive :event/segment-delete ::segment-event)

(methodical/defmethod events/publish-event! ::segment-event
  [topic segment]
  (audit-log/record-event! topic segment))

(derive ::user-event ::event)
(derive :event/user-joined ::user-event)
(derive :event/user-invited ::user-event)
(derive :event/user-update ::user-event)
(derive :event/user-deactivated ::user-event)
(derive :event/user-reactivated ::user-event)
(derive :event/password-reset-initiated ::user-event)
(derive :event/password-reset-successful ::user-event)

(methodical/defmethod events/publish-event! ::user-event
  [topic object]
  {:pre [(let [id (:user-id object)]
           (or (nil? id)
               (pos-int? id)))]}
  (audit-log/record-event! topic object))

(derive ::install-event ::event)
(derive :event/install ::install-event)

(methodical/defmethod events/publish-event! ::install-event
  [topic _event]
  (when-not (t2/exists? :model/AuditLog :topic "install")
    (audit-log/record-event! topic {})))

(derive ::database-event ::event)
(derive :event/database-create ::database-event)
(derive :event/database-delete ::database-event)
(derive :event/database-manual-sync ::database-event)
(derive :event/database-manual-scan ::database-event)
(derive :event/database-discard-field-values ::database-event)

(methodical/defmethod events/publish-event! ::database-event
  [topic database]
  (audit-log/record-event! topic database))

(derive ::database-update-event ::event)
(derive :event/database-update ::database-update-event)

(methodical/defmethod events/publish-event! ::database-update-event
  [topic event]
  (audit-log/record-event! topic
                           (maybe-prepare-update-event-data event)
                           api/*current-user-id*
                           :model/Database
                           (:id event)))
