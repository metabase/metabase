(ns metabase.channel.events.email
  (:require
   [metabase.channel.email.internal :as email.internal]
   [metabase.events.core :as events]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]))

(derive ::email-event :metabase/event)

;;;;

(derive :event/email.alert-stopped-because-archived ::email-event)

(mr/def :event/email.alert-stopped-because-archived
  "Email to notify users when a card associated to their alert has been archived"
  [:map
   [:card             :any]
   [:recipient-emails :any]
   [:actor            :any]])

(derive :event/email.alert-stopped-because-archived ::alert-stopped-because-archived)

(methodical/defmethod events/publish-event! ::alert-stopped-because-archived
  [_topic {:keys [card recipient-emails actor]}]
  (email.internal/send-alert-stopped-because-archived-email! card recipient-emails actor))

;;;;

(derive :event/email.broken-subscription-notification ::email-event)

(mr/def :event/email.broken-subscription-notification
  "Email dashboard and subscription creators information about a broken subscription due to bad parameters"
  [:map
   [:dashboard-id      pos-int?]
   [:dashboard-name    :any]
   [:pulse-creator     :any]
   [:dashboard-creator :any]
   [:affected-users    :any]
   [:bad-parameters    :any]])

(derive :event/email.broken-subscription-notification ::broken-subscription-notification)

(methodical/defmethod events/publish-event! ::broken-subscription-notification
  [_topic payload]
  (email.internal/send-broken-subscription-notification! payload))

;;;;

(derive :event/email.you-unsubscribed-notification-card ::email-event)

(mr/def :event/email.you-unsubscribed-notification-card
  "Send an email to `unsubscribed-emails` letting them know they've unsubscribed themselves from `notification`"
  [:map
   [:notification        :any]
   [:unsubscribed-emails [:sequential :string]]])

(derive :event/email.you-unsubscribed-notification-card ::you-unsubscribed-notification-card)

(methodical/defmethod events/publish-event! ::you-unsubscribed-notification-card
  [_topic {:keys [notification unsubscribed-emails]}]
  (email.internal/send-you-unsubscribed-notification-card-email! notification unsubscribed-emails))

;;;;

(derive :event/email.alert-stopped-because-changed ::email-event)

(mr/def :event/email.alert-stopped-because-changed
  "Email to notify users when a card associated to their alert changed in a way that invalidates their alert"
  [:map
   [:card             :any]
   [:recipient-emails :any]
   [:actor            :any]])

(derive :event/email.alert-stopped-because-changed ::alert-stopped-because-changed)

(methodical/defmethod events/publish-event! ::alert-stopped-because-changed
  [_topic {:keys [card recipient-emails actor]}]
  (email.internal/send-alert-stopped-because-changed-email! card recipient-emails actor))

;;;;

(derive :event/email.persistent-model-error ::email-event)

(mr/def :event/email.persistent-model-error
  "Send an email informing the user about errors in the persistent model refresh task."
  [:map
   [:database-id     pos-int?]
   [:persisted-infos :any]
   [:trigger         :any]])

(derive :event/email.persistent-model-error ::persistent-model-error)

(methodical/defmethod events/publish-event! ::persistent-model-error
  [_topic {:keys [database-id persisted-infos trigger]}]
  (email.internal/send-persistent-model-error-email! database-id persisted-infos trigger))

;;;;

(derive :event/email.you-were-removed-notification-card ::email-event)

(mr/def :event/email.you-were-removed-notification-card
  "Send an email to `removed-users` letting them know `admin` has removed them from `notification`"
  [:map
   [:notification   :any]
   [:removed-emails :any]
   [:actor          :any]])

(derive :event/email.you-were-removed-notification-card ::you-were-removed-notification-card)

(methodical/defmethod events/publish-event! ::you-were-removed-notification-card
  [_topic {:keys [notification removed-emails actor]}]
  (email.internal/send-you-were-removed-notification-card-email! notification removed-emails actor))

;;;;

(derive :event/email.you-were-added-card-notification ::email-event)

(mr/def :event/email.you-were-added-card-notification
  "Send an email to `added-users` letting them know `admin-adder` has added them to `notification`"
  [:map
   [:notification      :any]
   [:added-user-emails :any]
   [:adder             :any]])

(derive :event/email.you-were-added-card-notification ::you-were-added-card-notification)

(methodical/defmethod events/publish-event! ::you-were-added-card-notification
  [_topic {:keys [notification added-user-emails adder]}]
  (email.internal/send-you-were-added-card-notification-email! notification added-user-emails adder))

;;;;

(derive :event/email.user-joined-admin-notification ::email-event)

(mr/def :event/email.user-joined-admin-notification
  "Send an email to the `invitor` (the Admin who invited `new-user`) letting them know `new-user` has joined."
  [:map
   [:new-user     :any]
   [:google-auth? {:optional true, :default false} [:maybe :boolean]]])

(derive :event/email.user-joined-admin-notification ::user-joined-admin-notification)

(methodical/defmethod events/publish-event! ::user-joined-admin-notification
  [_topic {:keys [new-user google-auth?]}]
  (email.internal/send-user-joined-admin-notification-email! new-user :google-auth? google-auth?))

;;;;

(derive :event/email.follow-up ::email-event)

(mr/def :event/email.follow-up
  "Send an email to the system admin following up on the installation."
  [:map
   [:email :string]])

(derive :event/email.follow-up ::follow-up)

(methodical/defmethod events/publish-event! ::follow-up
  [_topic {:keys [email]}]
  (email.internal/send-follow-up-email! email))

;;;;

(derive :event/email.creator-sentiment ::email-event)

(mr/def :event/email.creator-sentiment
  "Send an email to a creator with a link to a survey. If a [[blob]] is included, it will be turned into json and then
  base64 encoded."
  [:map
   [:user :any]
   [:blob :any]])

(derive :event/email.creator-sentiment ::creator-sentiment)

(methodical/defmethod events/publish-event! ::creator-sentiment
  [_topic {:keys [user blob]}]
  (email.internal/send-creator-sentiment-email! user blob))

;;;;

(derive :event/email.password-reset ::email-event)

(mr/def :event/email.password-reset
  "Send an email informing the user how to reset their password."
  [:map
   [:email              :string]
   [:sso-source         :any]
   [:password-reset-url [:maybe :string]]
   [:is-active?         :any]])

(derive :event/email.password-reset ::password-reset)

(methodical/defmethod events/publish-event! ::password-reset
  [_topic {:keys [email sso-source password-reset-url is-active?]}]
  (email.internal/send-password-reset-email! email sso-source password-reset-url is-active?))

;;;;

(derive :event/email.login-from-new-device ::email-event)

(mr/def :event/email.login-from-new-device
  "Send an email informing the user that is the first time we've seen a login from device. Expects login history
  information as returned by [[metabase.login-history.models.login-history/human-friendly-infos]]."
  [:map
   [:login-history [:map
                    [:user_id pos-int?]]]])

(derive :event/email.login-from-new-device ::login-from-new-device)

(methodical/defmethod events/publish-event! ::login-from-new-device
  [_topic {:keys [login-history]}]
  (email.internal/send-login-from-new-device-email! login-history))
