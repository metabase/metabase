(ns metabase.events.notification
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.events :as events]
   [metabase.events.schema :as events.schema]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [metabase.public-settings :as public-settings]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :metabase/event ::notification)

(def ^:private supported-topics #{:event/user-invited})

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
                                         (fn [_acc k {:keys [key model] :as _hydrate-prop}]
                                           (assoc x key (t2/select-one model (get x k))))
                                         x
                                         hydrates)
                                        x)))))}}}))

(defn- hydrate!
  "Given a schema and value, hydrate the keys that are marked as to-hydrate.
  Hydrated keys have the :hydrate properties that can be added by [[events.schema/with-hydration]].

    (hydrate! [:map
                [:user_id {:hydrate {:key :user
                                     :model [:model/User :email]}} :int]]
              {:user_id 1})
    ;; => {:user_id 1
           :user    {:email \"ngoc@metabase.com\"}}"
  [schema value]
  (mc/decode schema value hydrate-transformer))

(defn- notifications-for-topic
  "Returns notifications for a given topic if it is supported and has notifications."
  [topic]
  (when (supported-topics topic)
    (models.notification/notifications-for-event topic)))

(defn- enriched-event-info
  [topic event-info]
  ;; DO NOT delete or rename these fields, they are used in the notification templates
  {:settings    {:application-name (public-settings/application-name)
                 :site-name        (public-settings/site-name)}
   :event-info  (cond->> event-info
                  (some? (events.schema/topic->schema topic))
                  (hydrate! (events.schema/topic->schema topic)))
   :event-topic topic})

(defn- maybe-send-notification-for-topic!
  [topic event-info]
  (when-let [notifications (notifications-for-topic topic)]
    (let [enriched-event-info (enriched-event-info topic event-info)]
      (log/infof "Found %d notifications for event: %s" (count notifications) topic)
      (doseq [notification notifications]
        (notification/*send-notification!* (assoc notification :payload enriched-event-info))))))

(methodical/defmethod events/publish-event! ::notification
  [topic event-info]
  (maybe-send-notification-for-topic! topic event-info))
