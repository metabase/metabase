(ns metabase.notification.core
  (:require
   [metabase.models.notification :as models.notification]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private Notification
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:active       :boolean]
   [:payload_type (into [:enum] models.notification/notification-types)]
   [:created_at   :any]
   [:updated_at   :any]])

(def ^:private NotificationInfo
  [:multi {:dispatch :payload_type}
   [:notification/system-event [:merge
                                Notification
                                [:map {:closed true}
                                 ;; TODO: event-info schema
                                 [:event-info [:maybe :map]]]]]])

(mu/defn send-notification!
  "Send a `notification`"
  [_notification :- NotificationInfo]
  ::noop)
