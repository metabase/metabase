(ns metabase.notification.payload.core
  (:require
   [metabase.appearance.core :as appearance]
   [metabase.notification.models :as models.notification]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.notification.payload.temp-storage :as notification.payload.temp-storage]
   [metabase.premium-features.core :as premium-features]
   [metabase.system.core :as system]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [potemkin :as p]
   [toucan2.core :as t2]))

(p/import-vars
 [notification.payload.execute
  execute-dashboard
  process-virtual-dashcard]
 [notification.payload.temp-storage
  cleanup!
  cleanable?])

(mr/def ::Notification
  "Schema for the notification."
  ;; TODO: how do we make this schema closed after :merge?
  [:merge #_{:closed true}
   [:map
    [:payload_type                   (into [:enum] models.notification/notification-types)]
    ;; allow unsaved notification to be sent
    [:id                      {:optional true} [:maybe ms/PositiveInt]]
    [:active                  {:optional true} :boolean]
    [:created_at              {:optional true} :any]
    [:updated_at              {:optional true} :any]
    [:subscriptions           {:optional true} [:sequential ::models.notification/NotificationSubscription]]
    ;;  the subscription that triggered this notification
    [:triggering_subscription {:optional true} ::models.notification/NotificationSubscription]]
   [:multi {:dispatch :payload_type}
    ;; system event is a bit special in that part of the payload comes from the event itself
    [:notification/system-event
     [:map
      [:payload
       [:map {:closed true}
        ;; TODO: event-info schema for each event type
        [:event_topic [:fn #(= "event" (-> % keyword namespace))]]
        [:event_info  [:maybe :map]]]]]]
    [:notification/card
     [:map
      [:payload    {:optional true} ::models.notification/NotificationCard]
      [:creator_id                  ms/PositiveInt]]]
    [:notification/dashboard
     [:map
      [:creator_id ms/PositiveInt]
      ;; replacement of pulse
      [:dashboard_subscription #_{:optional true}
       [:map
        [:dashboard_id ms/PositiveInt]
        [:parameters {:optional true} [:maybe [:sequential :map]]]
        [:dashboard_subscription_dashcards {:optional true}
         [:sequential [:map
                       [:card_id                        [:maybe ms/PositiveInt]]
                       [:include_csv   {:optional true} [:maybe ms/BooleanValue]]
                       [:include_xls   {:optional true} [:maybe ms/BooleanValue]]
                       [:format_rows   {:optional true} [:maybe ms/BooleanValue]]
                       [:pivot_results {:optional true} [:maybe ms/BooleanValue]]]]]]]]]
    ;; for testing only
    [:notification/testing :map]]])

(mr/def ::NotificationPayload
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
    [:notification/dashboard
     [:map
      [:payload [:map
                 [:dashboard_parts             [:sequential ::notification.payload.execute/Part]]
                 [:dashboard                   :map]
                 [:dashboard_subscription      :map]
                 [:style                       :map]
                 [:parameters {:optional true} [:maybe [:sequential :map]]]]]]]
    [:notification/card
     [:map
      [:payload [:map
                 [:card_part         [:maybe ::notification.payload.execute/Part]]
                 [:card              :map]
                 [:style             :map]
                 [:notification_card ::models.notification/NotificationCard]
                 [:subscriptions     [:sequential ::models.notification/NotificationSubscription]]]]]]
    [:notification/testing   :map]]])

(defn- logo-url
  "Return the URL for the application logo. If the logo is the default, return a URL to the Metabase logo.
   For data URIs, returns the raw data URI - the email channel will convert it to an attachment."
  []
  (let [url (appearance/application-logo-url)]
    (if (= url "app/assets/img/logo.svg")
      "http://static.metabase.com/email_logo.png"
      url)))

(defn- button-style
  "Return a CSS style string for a button with the given color."
  [color]
  (str "display: inline-block; "
       "box-sizing: border-box; "
       "padding: 0.5rem 1.375rem; "
       "font-size: 1.063rem; "
       "font-weight: bold; "
       "text-decoration: none; "
       "cursor: pointer; "
       "color: #fff; "
       "border: 1px solid " color "; "
       "background-color: " color "; "
       "border-radius: 4px;"))

(defn- default-context
  []
  ;; DO NOT delete or rename these fields, they are used in the notification templates
  {:application_name     (appearance/application-name)
   :application_color    (appearance/application-color)
   :application_logo_url (logo-url)
   :include_branding     (not (premium-features/enable-whitelabeling?))
   :site_name            (appearance/site-name)
   :site_url             (system/site-url)
   :admin_email          (system/admin-email)
   :style                {:button (button-style (appearance/application-color))}})

(defmulti payload
  "Given a notification info, return the notification payload."
  {:arglists '([notification-info])}
  :payload_type)

(mu/defn notification-payload :- ::NotificationPayload
  "Realize notification-info with :context and :payload."
  [notification :- ::Notification]
  (assoc (select-keys notification [:payload_type])
         :creator (t2/select-one [:model/User :id :first_name :last_name :email] (:creator_id notification))
         :payload (payload notification)
         :context (default-context)))

(defmulti skip-reason
  "Determine whether a notification should be sent. Default to nil."
  {:arglists '([notification-payload])}
  :payload_type)

(defmethod skip-reason :default
  [_notification-payload]
  nil)
