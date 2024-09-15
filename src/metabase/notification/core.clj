(ns metabase.notification.core
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.channel.core :as channel]
   [metabase.models.notification :as models.notification]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private Notification
  [:map {:closed true}
   [:payload_type (into [:enum] models.notification/notification-types)]
   [:id           {:optional true} ms/PositiveInt]
   [:active       {:optional true} :boolean]
   [:created_at   {:optional true} :any]
   [:updated_at   {:optional true} :any]])

(defn- hydra
  ([k model]
   (hydra k model {}))
  ([k model opts]
   (assoc opts :hydrate {:key     k
                         :model model})))

(def ^:private hydrate-transformer
  (mtx/transformer
   {:decoders {:map {:compile (fn [schema _]
                                (let [hydrates (into {}
                                                     (keep (fn [[k {:keys [hydrate] :as _p} _v]]
                                                             [k hydrate]))
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

(defn do-hydrate
  [schema value]
  (mc/decode schema value hydrate-transformer))

(do-hydrate
 [:map [:user_id (hydra :user [:model/User :first_name :last_name] {:optional true})
        pos-int?]]
 {:user_id 1})

(def NotificationInfo
  "Schema for the notificaiton info."
  [:multi {:dispatch :payload_type}
   [:notification/system-event [:merge
                                Notification
                                [:map {:closed true}
                                 [:payload
                                  [:map {:closed true}
                                   ;; TODO: event-info schema for each event type
                                   [:event-topic [:fn #(= "event" (-> % keyword namespace))]]
                                   [:event-info [:maybe :map]]
                                   [:settings   :map]]]]]]])

(defn- hydrate-notification-handler
  [notification-handlers]
  (t2/hydrate notification-handlers
              :channel
              :template
              :recipients))

(mu/defn send-notification!
  "Send the notification to all handlers synchronously."
  [notification-info :- NotificationInfo]
  (let [noti-handlers (hydrate-notification-handler (t2/select :model/NotificationHandler :notification_id (:id notification-info)))]
    (log/infof "[Notification %d] Found %d handlers" (:id notification-info) (count noti-handlers))
    (doseq [handler noti-handlers]
      (let [channel-type (:channel_type handler)
            messages     (channel/render-notification
                          channel-type
                          notification-info
                          (:template handler)
                          (:recipients handler))]
        (log/infof "[Notification %d] Got %d messages for channel %s" (:id notification-info) (count messages) (:channel_type handler))
        (doseq [message messages]
          (channel/send! (or (:channel handler)
                             {:type channel-type}) message))))))
