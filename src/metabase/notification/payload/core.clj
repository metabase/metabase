(ns metabase.notification.payload.core
  (:require
   [metabase.channel.render.core :as channel.render]
   [metabase.models.notification :as models.notification]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.public-settings :as public-settings]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [potemkin :as p]
   [toucan2.core :as t2]))

(p/import-vars
 [notification.payload.execute
  process-virtual-dashcard])

(def Notification
  "Schema for the notification."
  ;; TODO: how do we make this schema closed after :merge?
  [:merge #_{:closed true}
   [:map
    [:payload_type                  (into [:enum] models.notification/notification-types)]
    ;; allow unsaved notification to be sent
    [:id           {:optional true} [:maybe ms/PositiveInt]]
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
    [:notification/card
     [:map
      ;; replacement of pulse
      [:alert      [:map
                    [:card_id                           ms/PositiveInt]
                    [:schedule                          :map]
                    [:alert_condition  {:optional true} [:enum "rows" "goal"]]
                    [:alert_above_goal {:optional true} [:maybe ms/BooleanValue]]
                    [:alert_first_only {:optional true} [:maybe ms/BooleanValue]]
                    [:include_csv      {:optional true} [:maybe ms/BooleanValue]]
                    [:include_xls      {:optional true} [:maybe ms/BooleanValue]]
                    [:format_rows      {:optional true} [:maybe ms/BooleanValue]]
                    [:pivot_results    {:optional true} [:maybe ms/BooleanValue]]]]
      [:creator_id ms/PositiveInt]]]
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
    [:notification/dashboard
     [:map
      [:payload [:map
                 [:dashboard_parts             [:sequential notification.payload.execute/Part]]
                 [:dashboard                   :map]
                 [:dashboard_subscription      :map]
                 [:style                       :map]
                 [:parameters {:optional true} [:maybe [:sequential :map]]]]]]]
    [:notification/card
     [:map
      [:payload [:map
                 [:card_part [:maybe notification.payload.execute/Part]]
                 [:card      :map]
                 [:style     :map]
                 [:alert     :map]]]]]
    [:notification/testing   :map]]])

(defn- logo-url
  "Return the URL for the application logo. If the logo is the default, return a URL to the Metabase logo."
  []
  (let [url (public-settings/application-logo-url)]
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

(defn- default-context
  []
  ;; DO NOT delete or rename these fields, they are used in the notification templates
  {:application_name     (public-settings/application-name)
   :application_color    (public-settings/application-color)
   :application_logo_url (logo-url)
   :site_name            (public-settings/site-name)
   :site_url             (public-settings/site-url)
   :admin_email          (public-settings/admin-email)
   :style                {:button (button-style (channel.render/primary-color))}})

(defmulti payload
  "Given a notification info, return the notification payload."
  {:arglists '([notification-info])}
  :payload_type)

(mu/defn notification-payload :- NotificationPayload
  "Realize notification-info with :context and :payload."
  [notification :- Notification]
  (assoc (select-keys notification [:payload_type])
         :creator (t2/select-one [:model/User :id :first_name :last_name :email] (:creator_id notification))
         :payload (payload notification)
         :context (default-context)))

(defmulti should-send-notification?
  "Determine whether a notification should be sent. Default to true."
  {:arglists '([notification-payload])}
  :payload_type)

(defmethod should-send-notification? :default
  [_notification-payload]
  true)
