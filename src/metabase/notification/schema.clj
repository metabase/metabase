(ns metabase.notification.schema
  "Malli schemas for the notification module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::notification
  "A Notification as selected from the app DB: every column of `:notification`."
  [:merge
   ::notification.columns
   [:map {:closed true}
    [:id           ms/PositiveInt]]])

(mr/def ::notification.columns
  "Every column of `:notification` except `id`, all optional."
  [:map {:closed true}
   [:payload_type {:optional true} [:maybe [:or :keyword :string]]]
   [:active       {:optional true} [:maybe :boolean]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:internal_id  {:optional true} [:maybe :string]]
   [:payload_id   {:optional true} [:maybe ms/PositiveInt]]
   [:creator_id   {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::notification.create
  "What an insert of a Notification accepts."
  (mr/schema ::notification.columns))

(mr/def ::notification.update
  "What an update of a Notification accepts: no immutable columns (`:created_at` is fixed at creation and never
  changes after that)."
  (mut/select-keys (mr/schema ::notification.columns)
                   [:payload_type :active :updated_at :internal_id :payload_id :creator_id]))

(mr/def ::notification.partial
  "A Notification row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::notification [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::notification.column
  "A column of `:notification`, for the `:columns` option of the queries in [[metabase.notification.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::notification.columns))))

(mr/def ::notification-card
  "A NotificationCard as selected from the app DB: every column of `:notification_card`."
  [:merge
   ::notification-card.columns
   [:map {:closed true}
    [:id             ms/PositiveInt]]])

(mr/def ::notification-card.columns
  "Every column of `:notification_card` except `id`, all optional."
  [:map {:closed true}
   [:card_id        {:optional true} [:maybe ::lib.schema.id/card]]
   [:send_once      {:optional true} [:maybe :boolean]]
   [:send_condition {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at     {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at     {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:disable_links  {:optional true} [:maybe :boolean]]])

(mr/def ::notification-card.create
  "What an insert of a NotificationCard accepts."
  (mr/schema ::notification-card.columns))

(mr/def ::notification-card.update
  "What an update of a NotificationCard accepts: no immutable columns (`:created_at` is fixed at creation and
  never changes after that)."
  (mut/select-keys (mr/schema ::notification-card.columns)
                   [:card_id :send_once :send_condition :updated_at :disable_links]))

(mr/def ::notification-card.partial
  "A NotificationCard row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::notification-card [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::notification-card.column
  "A column of `:notification_card`, for the `:columns` option of the queries in [[metabase.notification.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::notification-card.columns))))

(mr/def ::notification-handler
  "A NotificationHandler as selected from the app DB: every column of `:notification_handler`."
  [:merge
   ::notification-handler.columns
   [:map {:closed true}
    [:id              ms/PositiveInt]]])

(mr/def ::notification-handler.columns
  "Every column of `:notification_handler` except `id`, all optional."
  [:map {:closed true}
   [:channel_type    {:optional true} [:maybe [:or :keyword :string]]]
   [:notification_id {:optional true} [:maybe ms/PositiveInt]]
   [:channel_id      {:optional true} [:maybe ms/PositiveInt]]
   [:template_id     {:optional true} [:maybe ms/PositiveInt]]
   [:active          {:optional true} [:maybe :boolean]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at      {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::notification-handler.create
  "What an insert of a NotificationHandler accepts."
  (mr/schema ::notification-handler.columns))

(mr/def ::notification-handler.update
  "What an update of a NotificationHandler accepts: no immutable columns (`:created_at` is fixed at creation, and
  `:notification_id` -- the Notification a handler is created under -- never changes after that)."
  (mut/select-keys (mr/schema ::notification-handler.columns)
                   [:channel_type :channel_id :template_id :active :updated_at]))

(mr/def ::notification-handler.partial
  "A NotificationHandler row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::notification-handler [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::notification-handler.column
  "A column of `:notification_handler`, for the `:columns` option of the queries in [[metabase.notification.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::notification-handler.columns))))

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
   ::notification-recipient.columns
   [:map {:closed true}
    [:id                      ms/PositiveInt]]])

(mr/def ::notification-recipient.columns
  "Every column of `:notification_recipient` except `id`, all optional."
  [:map {:closed true}
   [:notification_handler_id {:optional true} [:maybe ms/PositiveInt]]
   [:type                    {:optional true} [:maybe [:or :keyword :string]]]
   [:user_id                 {:optional true} [:maybe ::lib.schema.id/user]]
   [:permissions_group_id    {:optional true} [:maybe ms/PositiveInt]]
   [:details                 {:optional true} [:maybe ::notification-recipient.details]]
   [:created_at              {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::notification-recipient.create
  "What an insert of a NotificationRecipient accepts."
  (mr/schema ::notification-recipient.columns))

(mr/def ::notification-recipient.update
  "What an update of a NotificationRecipient accepts: no immutable columns (`:created_at` is fixed at creation, and
  `:notification_handler_id` -- the NotificationHandler a recipient is created under -- never changes after that)."
  (mut/select-keys (mr/schema ::notification-recipient.columns)
                   [:type :user_id :permissions_group_id :details :updated_at]))

(mr/def ::notification-recipient.partial
  "A NotificationRecipient row as selected, where a `:columns` narrowing may have left out any column. `:details` is
  typed loosely here because decoding an encrypted JSON column does not round-trip keywords."
  [:merge
   ::notification-recipient
   [:map {:closed true}
    [:id      {:optional true} ms/PositiveInt]
    [:details {:optional true} [:maybe [:map]]]]])

(mr/def ::notification-recipient.column
  "A column of `:notification_recipient`, for the `:columns` option of the queries in
  [[metabase.notification.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::notification-recipient.columns))))

(mr/def ::notification-subscription
  "A NotificationSubscription as selected from the app DB: every column of `:notification_subscription`."
  [:merge
   ::notification-subscription.columns
   [:map {:closed true}
    [:id              ms/PositiveInt]]])

(mr/def ::notification-subscription.columns
  "Every column of `:notification_subscription` except `id`, all optional."
  [:map {:closed true}
   [:notification_id {:optional true} [:maybe ms/PositiveInt]]
   [:type            {:optional true} [:maybe [:or :keyword :string]]]
   [:event_name      {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:cron_schedule   {:optional true} [:maybe :string]]
   [:ui_display_type {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::notification-subscription.create
  "What an insert of a NotificationSubscription accepts."
  (mr/schema ::notification-subscription.columns))

(mr/def ::notification-subscription.update
  "What an update of a NotificationSubscription accepts: no immutable columns (`:created_at` is fixed at creation,
  and `:notification_id` -- the Notification a subscription is created under -- never changes after that)."
  (mut/select-keys (mr/schema ::notification-subscription.columns)
                   [:type :event_name :cron_schedule :ui_display_type]))

(mr/def ::notification-subscription.partial
  "A NotificationSubscription row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::notification-subscription [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::notification-subscription.column
  "A column of `:notification_subscription`, for the `:columns` option of the queries in
  [[metabase.notification.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::notification-subscription.columns))))
