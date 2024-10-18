(ns metabase.notification.payload.core
  (:require
   [metabase.email.messages :as messages]
   [metabase.models.notification :as models.notification]
   [metabase.public-settings :as public-settings]
   [metabase.pulse.render.style :as style]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private Notification
  [:map {:closed true}
   [:payload_type                  (into [:enum] models.notification/notification-types)]
   [:id           {:optional true} ms/PositiveInt]
   [:active       {:optional true} :boolean]
   [:created_at   {:optional true} :any]
   [:updated_at   {:optional true} :any]])

(def NotificationInfo
  "Schema for the notificaiton info."
  [:merge
   Notification
   [:multi {:dispatch :payload_type}
    [:notification/system-event [:merge
                                 Notification
                                 [:map {:closed true}
                                  ;; part of the payload from system events come from the event itself
                                  [:payload
                                   [:map {:closed true}
                                    ;; TODO: event-info schema for each event type
                                    [:event-topic [:fn #(= "event" (-> % keyword namespace))]]
                                    [:event-info  [:maybe :map]]]]]]]
    [:notification/dashboard-subscription [:merge
                                           Notification
                                           [:map {:closed true}
                                            [:payload_id ms/PositiveInt]]]]
    ;; for testing only
    [:notification/testing       :map]]])

(def NotificationPayload
  "Schema for the notification payload."
  [:merge
   NotificationInfo
   [:map {:closed true}
    [:context [:map]]]
   [:multi {:dispatch :payload_type}
    [:notification/system-event [:merge
                                 Notification
                                 [:map {:closed true}
                                  [:payload
                                   [:map {:closed true}
                                    ;; TODO: event-info schema for each event type
                                    [:event-topic [:fn #(= "event" (-> % keyword namespace))]]
                                    [:event-info  [:maybe :map]]
                                    #_[:context     :map]]]]]]
    [:notification/dashboard-subscription [:merge
                                           Notification
                                           [:map {:closed true}
                                            [:payload_id ms/PositiveInt]]]]
    ;; for testing only
    #_[::mc/default nil]]])

(defmulti notification-payload*
  "Given a notification info, return the payload."
  :payload_type)

(defn- default-context
  []
  ;; DO NOT delete or rename these fields, they are used in the notification templates
  {:application-name     (public-settings/application-name)
   :application-logo-url (messages/logo-url)
   :site-name            (public-settings/site-name)
   :site-url             (public-settings/site-url)
   :admin-email          (public-settings/admin-email)
   :style                {:button (messages/button-style (style/primary-color))}})

(mu/defn notification-payload
  "Realize notification-info with :context and :payload."
  [notification-info]
  (-> notification-info
      notification-payload*
      (assoc :context (default-context))))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Load the implementations                                     ;;
;; ------------------------------------------------------------------------------------------------;;
(u/find-and-load-namespaces! "metabase.notification.payload")
