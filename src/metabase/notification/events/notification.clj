(ns metabase.notification.events.notification
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.events.core :as events]
   [metabase.notification.db :as notification.db]
   [metabase.notification.models :as models.notification]
   [metabase.notification.send :as notification.send]
   [metabase.task-history.core :as task-history]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(events/derive! :metabase/event ::notification)

(def ^:private supported-topics #{:event/user-invited
                                  :event/notification-create
                                  :event/slack-token-invalid
                                  :event/comment-created
                                  :event/support-access-grant-created
                                  :event/transform-failed
                                  :event/transform-failure-digest})

(def ^:private hydrate-transformer
  (mtx/transformer
   {:decoders {:map {:compile (fn [schema _]
                                (let [hydrates (into {}
                                                     (keep (fn [[k {:keys [hydrate] :as _p} _v]]
                                                             (when hydrate
                                                               [k hydrate])))
                                                     (mc/children schema))]
                                  (when (seq hydrates)
                                    (fn [x]
                                      (if (map? x)
                                        (reduce-kv
                                         (fn [acc k {:keys [key model] :as _hydrate-prop}]
                                           (cond-> acc
                                             (contains? x k) (assoc key (notification.db/instance model (get x k)))))
                                         x
                                         hydrates)
                                        x)))))}}}))

(defn- hydrate!
  "Given a schema and value, hydrate the keys that are marked as to-hydrate.
  Hydrated keys have the :hydrate properties that can be added by [[metabase.events.schema/with-hydration]].

    (hydrate! [:map
                [:user_id {:hydrate {:key :user
                                     :model [:model/User :email]}} :int]]
              {:user_id 1})
    ;; => {:user_id 1
           :user    {:email \"ngoc@metabase.com\"}}"
  [schema value]
  (mc/decode schema value hydrate-transformer))

(defn maybe-hydrate-event-info
  "Hydrate event-info if the topic has a schema."
  [topic event-info]
  (cond->> event-info
    (some? (events/event-schema topic))
    (hydrate! (events/event-schema topic))))

(defn- notifications-for-topic
  "Returns notifications for a given topic if it is supported and has notifications."
  [topic]
  (when (supported-topics topic)
    (models.notification/notifications-for-event topic)))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *skip-sending-notification?*
  "Used as a hack for when we need to skip sending notifications for certain events.

  It's an escape hatch until we implement conditional notifications."
  false)

(defn- event-infos
  "The event infos that `event` carries: one for each of its `:objects`, or the event itself."
  [event]
  (if (contains? event :objects)
    (mapv #(-> event (dissoc :objects) (assoc :object %)) (:objects event))
    [event]))

(defn- send-notifications!
  "Send `notifications` for the `event` of `topic`, with a task history row of their own."
  [topic event notifications]
  (task-history/with-task-history {:task         "notification-trigger"
                                   :task_details {:trigger_type     :notification-subscription/system-event
                                                  :event_name       topic
                                                  :notification_ids (map :id notifications)}}
    (log/debugf "Found %d notifications for event: %s" (count notifications) topic)
    (doseq [event-info (event-infos event)
            notification notifications]
      (notification.send/send-notification! (assoc notification :payload {:event_info  (maybe-hydrate-event-info topic event-info)
                                                                          :event_topic topic})))))

(defn- maybe-send-notification-for-topic!
  "Send the notifications of `topic` for `event`, or for each of the events of its `:events` when it has them, finding
  the notifications once."
  [topic event]
  (when-not *skip-sending-notification?*
    (when-let [notifications (notifications-for-topic topic)]
      (doseq [event (if (contains? event :events) (:events event) [event])]
        (send-notifications! topic event notifications)))))

(methodical/defmethod events/publish-event! ::notification
  [topic event-info]
  (maybe-send-notification-for-topic! topic event-info))

(events/derive! ::notification-row-create :metabase/event)
(events/derive! :event/notification-row-create ::notification-row-create)

(methodical/defmethod events/publish-event! ::notification-row-create
  "Publish one `:event/notification-create` for the Notifications that the batch created, fully hydrated now that its
  batch wrote all of it, as the user who created it, loading them together."
  [_topic {:keys [changes user-id]}]
  (when user-id
    (when-let [ids (not-empty (mapv (comp :id :object) changes))]
      (events/publish-event! :event/notification-create
                             {:objects (models.notification/hydrate-notification (notification.db/notifications-by-id ids))
                              :user-id user-id}))))
