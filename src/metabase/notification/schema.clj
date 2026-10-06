(ns metabase.notification.schema
  "Malli schemas for the notification module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::notification
  "A Notification as selected from the app DB: every column of `:notification`."
  [:merge
   ::notification.update
   [:map {:closed true}
    [:id           ms/PositiveInt]]])

(mr/def ::notification.update
  "What an update (or insert) of a Notification accepts: every column of `:notification` except `id`, all optional."
  [:map {:closed true}
   [:payload_type {:optional true} [:maybe [:or :keyword :string]]]
   [:active       {:optional true} [:maybe :boolean]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:internal_id  {:optional true} [:maybe :string]]
   [:payload_id   {:optional true} [:maybe ms/PositiveInt]]
   [:creator_id   {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::notification-card
  "A NotificationCard as selected from the app DB: every column of `:notification_card`."
  [:merge
   ::notification-card.update
   [:map {:closed true}
    [:id             ms/PositiveInt]]])

(mr/def ::notification-card.update
  "What an update (or insert) of a NotificationCard accepts: every column of `:notification_card` except `id`, all optional."
  [:map {:closed true}
   [:card_id        {:optional true} [:maybe ::lib.schema.id/card]]
   [:send_once      {:optional true} [:maybe :boolean]]
   [:send_condition {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:disable_links  {:optional true} [:maybe :boolean]]])

(mr/def ::notification-handler
  "A NotificationHandler as selected from the app DB: every column of `:notification_handler`."
  [:merge
   ::notification-handler.update
   [:map {:closed true}
    [:id              ms/PositiveInt]]])

(mr/def ::notification-handler.update
  "What an update (or insert) of a NotificationHandler accepts: every column of `:notification_handler` except `id`, all optional."
  [:map {:closed true}
   [:channel_type    {:optional true} [:maybe [:or :keyword :string]]]
   [:notification_id {:optional true} [:maybe ms/PositiveInt]]
   [:channel_id      {:optional true} [:maybe ms/PositiveInt]]
   [:template_id     {:optional true} [:maybe ms/PositiveInt]]
   [:active          {:optional true} [:maybe :boolean]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at      {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::notification-recipient.details
  "The `:details` column of a NotificationRecipient, decoded."
  [:or
   [:map {:closed true}]
   [:map {:closed true}
    [:value                    :string]
    [:channel_id {:optional true} [:maybe :string]]]
   [:map {:closed true}
    [:pattern                  :string]
    [:is_optional {:optional true} :boolean]]])

(mr/def ::notification-recipient
  "A NotificationRecipient as selected from the app DB: every column of `:notification_recipient`."
  [:merge
   ::notification-recipient.update
   [:map {:closed true}
    [:id                      ms/PositiveInt]]])

(mr/def ::notification-recipient.update
  "What an update (or insert) of a NotificationRecipient accepts: every column of `:notification_recipient` except `id`, all optional."
  [:map {:closed true}
   [:notification_handler_id {:optional true} [:maybe ms/PositiveInt]]
   [:type                    {:optional true} [:maybe [:or :keyword :string]]]
   [:user_id                 {:optional true} [:maybe ::lib.schema.id/user]]
   [:permissions_group_id    {:optional true} [:maybe ms/PositiveInt]]
   [:details                 {:optional true} [:maybe ::notification-recipient.details]]
   [:created_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::notification-subscription
  "A NotificationSubscription as selected from the app DB: every column of `:notification_subscription`."
  [:merge
   ::notification-subscription.update
   [:map {:closed true}
    [:id              ms/PositiveInt]]])

(mr/def ::notification-subscription.update
  "What an update (or insert) of a NotificationSubscription accepts: every column of `:notification_subscription` except `id`, all optional."
  [:map {:closed true}
   [:notification_id {:optional true} [:maybe ms/PositiveInt]]
   [:type            {:optional true} [:maybe [:or :keyword :string]]]
   [:event_name      {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:cron_schedule   {:optional true} [:maybe :string]]
   [:ui_display_type {:optional true} [:maybe [:or :keyword :string]]]])
