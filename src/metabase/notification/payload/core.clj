(ns metabase.notification.payload.core
  (:require
   [metabase.appearance.core :as appearance]
   [metabase.notification.models :as models.notification]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.notification.payload.temp-storage :as notification.payload.temp-storage]
   [metabase.system.core :as system]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [potemkin :as p]))

(p/import-vars
 [notification.payload.execute
  execute-dashboard
  process-virtual-dashcard]
 [notification.payload.temp-storage
  cleanup!
  is-cleanable?])

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
    [:notification/system-event
     [:map
      [:payload
       [:map
        [:event_name [:fn #(= "event" (-> % keyword namespace))]]
        [:action     {:optional true} [:maybe :keyword]]
        [:table_id   {:optional true} [:maybe pos-int?]]]]
      [:event_info  [:maybe :map]]]]
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
      [:payload :map]]]
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
                 [:subscriptions     [:maybe [:sequential ::models.notification/NotificationSubscription]]]]]]]
    [:notification/testing   :map]]])

(defn- logo-url
  "Return the URL for the application logo. If the logo is the default, return a URL to the Metabase logo."
  []
  (let [url (appearance/application-logo-url)]
    (cond
      (= url "app/assets/img/logo.svg") "http://static.metabase.com/email_logo.png"
      ;; NOTE: disabling whitelabeled URLs for now since some email clients don't render them correctly
      ;; We need to extract them and embed as attachments like we do in metabase.channel.render.image-bundle
      ;; (data-uri-svg? url)               (themed-image-url url color)
      :else nil)))

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

(defn default-settings
  "Return the default context for the notification."
  []
  ;; DO NOT delete or rename these fields, they are used in the notification templates
  {:application_name     (appearance/application-name)
   :application_color    (appearance/application-color)
   :application_logo_url (logo-url)
   :site_name            (appearance/site-name)
   :site_url             (system/site-url)
   :admin_email          (system/admin-email)
   :style                {:button (button-style (appearance/application-color))}})

(defmulti notification-payload
  "Given a notification info, return the notification payload."
  {:arglists '([notification-info])}
  :payload_type)

(defmulti notification-payload-schema
  "Given a notification info, return the notification payload schema."
  {:arglists '([notification-info])}
  :payload_type)

(defmulti skip-reason
  "Return the reason to skip the notification, or nil if it should be sent."
  {:arglists '([notification-payload])}
  :payload_type)

(defmethod skip-reason :default
  [_notification-payload]
  nil)
