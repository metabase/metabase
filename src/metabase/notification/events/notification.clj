(ns metabase.notification.events.notification
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.events.core :as events]
   [metabase.notification.models :as models.notification]
   [metabase.notification.send :as notification.send]
   [metabase.task-history.core :as task-history]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :metabase/event ::notification)

(def ^:private supported-topics #{:event/user-invited
                                  :event/notification-create
                                  :event/slack-token-invalid
                                  :event/comment-created
                                  :event/support-access-grant-created
                                  :event/transform-failed})

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
                                           (assoc acc key (t2/select-one model (get x k))))
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

(def ^:dynamic *skip-sending-notification?*
  "Used as a hack for when we need to skip sending notifications for certain events.

  It's an escape hatch until we implement conditional notifications."
  false)

(defn- maybe-send-notification-for-topic!
  [topic event-info]
  (when-not *skip-sending-notification?*
    (when-let [notifications (notifications-for-topic topic)]
      (task-history/with-task-history {:task         "notification-trigger"
                                       :task_details {:trigger_type     :notification-subscription/system-event
                                                      :event_name       topic
                                                      :notification_ids (map :id notifications)}}
        (log/debugf "Found %d notifications for event: %s" (count notifications) topic)
        (doseq [notification notifications]
          (notification.send/send-notification! (assoc notification :payload {:event_info  (maybe-hydrate-event-info topic event-info)
                                                                              :event_topic topic})))))))

(methodical/defmethod events/publish-event! ::notification
  [topic event-info]
  (maybe-send-notification-for-topic! topic event-info))
