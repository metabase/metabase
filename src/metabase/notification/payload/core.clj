(ns metabase.notification.payload.core
  (:require
   [metabase.email.messages :as messages]
   [metabase.models.notification :as models.notification]
   [metabase.public-settings :as public-settings]
   [metabase.pulse.core :as pulse]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def Notification
  "Schema for the notification."
  ;; TODO: how do we make this schema closed after :merge?
  [:merge #_{:closed true}
   [:map
    [:payload_type                  (into [:enum] models.notification/notification-types)]
    [:id           {:optional true} ms/PositiveInt]
    [:active       {:optional true} :boolean]
    [:created_at   {:optional true} :any]
    [:updated_at   {:optional true} :any]]
   [:multi {:dispatch :payload_type}
    ;; system event is a bit special in that part of the payload comes from the event itself
    [:notification/system-event
     [:map
      [:payload
       [:map {:closed true}
        ;; TODO: event-info schema for each event type
        [:event_topic [:fn #(= "event" (-> % keyword namespace))]]
        [:event_info  [:maybe :map]]]]]]
    #_[:notification/alert
       [:map
        ;; replacement of pulse
        [:notification_alert
         [:map
          [:card_id ms/PositiveInt]
          [:creator_id ms/PositiveInt]]]]]
    [:notification/dashboard-subscription
     [:map
      [:creator_id ms/PositiveInt]
      ;; replacement of pulse
      [:dashboard_subscription #_{:optional true}
       [:map
        [:dashboard_id ms/PositiveInt]
        [:parameters {:optional true} [:maybe [:sequential :map]]]
        [:dashboard_subscription_dashcards {:optional true}
         [:sequential [:map
                        [:dashboard_card_id ms/PositiveInt]
                        [:include_csv       ms/BooleanValue]
                        [:include_xls       ms/BooleanValue]
                        [:pivot_results     ms/BooleanValue]]]]]]]]

    ;; for testing only
    [:notification/testing :map]]])

(def NotificationPayload
  "Schema for the notification payload."
  ;; TODO: how do we make this schema closed after :merge?
  [:merge
   [:map
    [:payload_type (into [:enum] models.notification/notification-types)]
    [:context      [:map]]]
   [:multi {:dispatch :payload_type}
    ;; override payload to add extra-context key
    [:notification/system-event
     [:map
      ;; override the payload with extra context
      [:payload
       [:map {:closed true}
        [:event_topic                   [:fn #(= "event" (-> % keyword namespace))]]
        [:event_info                    [:maybe :map]]
        [:custom       {:optional true} [:maybe :map]]]]]]
    [:notification/dashboard-subscription
     [:map
      [:payload [:map
                 ;; TODO: type this out
                 [:result                 [:sequential [:map]]]
                 [:dashboard              :map]
                 [:dashboard_subscription :map]]]]]
    [:notification/testing       :map]]])

(defn- default-context
  []
  ;; DO NOT delete or rename these fields, they are used in the notification templates
  {:application_name     (public-settings/application-name)
   :application_color    (public-settings/application-color)
   :application_logo_url (messages/logo-url)
   :site_name            (public-settings/site-name)
   :site_url             (public-settings/site-url)
   :admin_email          (public-settings/admin-email)
   :style                {:button (messages/button-style (pulse/primary-color))}})

(defmulti payload
  "Given a notification info, return the notification payload."
  :payload_type)

(mu/defn notification-payload :- NotificationPayload
  "Realize notification-info with :context and :payload."
  [notification :- Notification]
  (assoc (select-keys notification [:payload_type])
         :payload (payload notification)
         :context (default-context)))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Load the implementations                                     ;;
;; ------------------------------------------------------------------------------------------------;;
(when-not *compile-files*
  (u/find-and-load-namespaces! "metabase.notification.payload.impl"))
