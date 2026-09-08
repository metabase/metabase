(ns metabase.notification.schema
  "Malli schemas for the notification module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::notification
  "A Notification as selected from the app DB: every column of `:notification`."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:payload_type [:or :keyword :string :map sequential?]]
   [:active       :boolean]
   [:created_at   ms/TemporalInstant]
   [:updated_at   ms/TemporalInstant]
   [:internal_id  [:maybe :string]]
   [:payload_id   [:maybe ms/PositiveInt]]
   [:creator_id   [:maybe ::lib.schema.id/user]]])

(mr/def ::notification.update
  "What an update (or insert) of a Notification accepts: every column of `:notification` except `id`, all optional."
  [:map {:closed true}
   [:payload_type {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:active       {:optional true} [:maybe :boolean]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:internal_id  {:optional true} [:maybe :string]]
   [:payload_id   {:optional true} [:maybe ms/PositiveInt]]
   [:creator_id   {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::notification-card
  "A NotificationCard as selected from the app DB: every column of `:notification_card`."
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:card_id        [:maybe ::lib.schema.id/card]]
   [:send_once      :boolean]
   [:send_condition [:or :keyword :string :map sequential?]]
   [:created_at     ms/TemporalInstant]
   [:updated_at     ms/TemporalInstant]
   [:disable_links  [:maybe :boolean]]])

(mr/def ::notification-card.update
  "What an update (or insert) of a NotificationCard accepts: every column of `:notification_card` except `id`, all optional."
  [:map {:closed true}
   [:card_id        {:optional true} [:maybe ::lib.schema.id/card]]
   [:send_once      {:optional true} [:maybe :boolean]]
   [:send_condition {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:created_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:disable_links  {:optional true} [:maybe :boolean]]])

(mr/def ::notification-handler
  "A NotificationHandler as selected from the app DB: every column of `:notification_handler`."
  [:map {:closed true}
   [:id              ms/PositiveInt]
   [:channel_type    [:or :keyword :string :map sequential?]]
   [:notification_id ms/PositiveInt]
   [:channel_id      [:maybe ms/PositiveInt]]
   [:template_id     [:maybe ms/PositiveInt]]
   [:active          :boolean]
   [:created_at      ms/TemporalInstant]
   [:updated_at      ms/TemporalInstant]])

(mr/def ::notification-handler.update
  "What an update (or insert) of a NotificationHandler accepts: every column of `:notification_handler` except `id`, all optional."
  [:map {:closed true}
   [:channel_type    {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:notification_id {:optional true} [:maybe ms/PositiveInt]]
   [:channel_id      {:optional true} [:maybe ms/PositiveInt]]
   [:template_id     {:optional true} [:maybe ms/PositiveInt]]
   [:active          {:optional true} [:maybe :boolean]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at      {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::notification-recipient
  "A NotificationRecipient as selected from the app DB: every column of `:notification_recipient`."
  [:map {:closed true}
   [:id                      ms/PositiveInt]
   [:notification_handler_id ms/PositiveInt]
   [:type                    [:or :keyword :string :map sequential?]]
   [:user_id                 [:maybe ::lib.schema.id/user]]
   [:permissions_group_id    [:maybe ms/PositiveInt]]
   [:details                 [:maybe [:or :string :map sequential?]]]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]])

(mr/def ::notification-recipient.update
  "What an update (or insert) of a NotificationRecipient accepts: every column of `:notification_recipient` except `id`, all optional."
  [:map {:closed true}
   [:notification_handler_id {:optional true} [:maybe ms/PositiveInt]]
   [:type                    {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:user_id                 {:optional true} [:maybe ::lib.schema.id/user]]
   [:permissions_group_id    {:optional true} [:maybe ms/PositiveInt]]
   [:details                 {:optional true} [:maybe [:or :string :map sequential?]]]
   [:created_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::notification-subscription
  "A NotificationSubscription as selected from the app DB: every column of `:notification_subscription`."
  [:map {:closed true}
   [:id              ms/PositiveInt]
   [:notification_id ms/PositiveInt]
   [:type            [:or :keyword :string :map sequential?]]
   [:event_name      [:maybe [:or :keyword :string :map sequential?]]]
   [:created_at      ms/TemporalInstant]
   [:cron_schedule   [:maybe :string]]
   [:ui_display_type [:maybe [:or :keyword :string :map sequential?]]]])

(mr/def ::notification-subscription.update
  "What an update (or insert) of a NotificationSubscription accepts: every column of `:notification_subscription` except `id`, all optional."
  [:map {:closed true}
   [:notification_id {:optional true} [:maybe ms/PositiveInt]]
   [:type            {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:event_name      {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:cron_schedule   {:optional true} [:maybe :string]]
   [:ui_display_type {:optional true} [:maybe [:or :keyword :string :map sequential?]]]])
