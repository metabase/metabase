(ns metabase.channel-interface.core
  (:require
   [potemkin :as p]))

(p/defprotocol+ EmailService
  (-send-alert-stopped-because-archived-email! [this card recipient-emails archiver]
    "Email to notify users when a card associated to their alert has been archived")

  (-send-broken-subscription-notification! [this dashboard-subscription-info]
    "Email dashboard and subscription creators information about a broken subscription due to bad parameters")

  (-send-you-unsubscribed-notification-card-email! [this notification unsubscribed-emails]
    "Send an email to `who-unsubscribed` letting them know they've unsubscribed themselves from `notification`")

  (-send-alert-stopped-because-changed-email! [this card recipient-emails archiver]
    "Email to notify users when a card associated to their alert changed in a way that invalidates their alert")

  (-send-persistent-model-error-email! [this database-id persisted-infos trigger]
    "Format and send an email informing the user about errors in the persistent model refresh task.")

  (-send-you-were-removed-notification-card-email! [this notification removed-emails actor]
    "Send an email to `removed-users` letting them know `admin` has removed them from `notification`")

  (-send-you-were-added-card-notification-email! [this notification added-user-emails adder]
    "Send an email to `added-users` letting them know `admin-adder` has added them to `notification`")

  (-send-user-joined-admin-notification-email! [this new-user {:keys [google-auth?], :as _options}]
    "Send an email to the `invitor` (the Admin who invited `new-user`) letting them know `new-user` has joined.")

  (-send-follow-up-email! [this email]
    "Format and send an email to the system admin following up on the installation.")

  (-send-creator-sentiment-email! [this user blob]
    "Format and send an email to a creator with a link to a survey. If a [[blob]] is included, it will be turned into
  json and then base64 encoded.")

  (-send-password-reset-email! [this email sso-source password-reset-url is-active?]
    "Format and send an email informing the user how to reset their password.")

  (-send-login-from-new-device-email! [this login-history]
    "Format and send an email informing the user that this is the first time we've seen a login from this device.
  Expects\n login history information as returned
  by [[metabase.login-history.models.login-history/human-friendly-infos]]."))

(defonce ^:private ^:dynamic *email-service*
  (atom nil))

(defn set-email-service!
  "Set the default email service (default implementation of [[EmailService]])."
  [email-serivce]
  (reset! *email-service* email-serivce))

(defn- email-service []
  @*email-service*)

(defn send-alert-stopped-because-archived-email!
  "Email to notify users when a card associated to their alert has been archived"
  [card recipient-emails archiver]
  (-send-alert-stopped-because-archived-email! (email-service) card recipient-emails archiver))

(defn send-broken-subscription-notification!
  "Email dashboard and subscription creators information about a broken subscription due to bad parameters"
  [dashboard-subscription-info]
  (-send-broken-subscription-notification! (email-service) dashboard-subscription-info))

(defn send-you-unsubscribed-notification-card-email!
  "Send an email to `who-unsubscribed` letting them know they've unsubscribed themselves from `notification`"
  [notification unsubscribed-emails]
  (-send-you-unsubscribed-notification-card-email! (email-service) notification unsubscribed-emails))

(defn send-alert-stopped-because-changed-email!
  "Email to notify users when a card associated to their alert changed in a way that invalidates their alert"
  [card recipient-emails archiver]
  (-send-alert-stopped-because-changed-email! (email-service) card recipient-emails archiver))

(defn send-persistent-model-error-email!
  "Format and send an email informing the user about errors in the persistent model refresh task."
  [database-id persisted-infos trigger]
  (-send-persistent-model-error-email! (email-service) database-id persisted-infos trigger))

(defn send-you-were-removed-notification-card-email!
  "Send an email to `removed-users` letting them know `admin` has removed them from `notification`"
  [notification removed-emails actor]
  (-send-you-were-removed-notification-card-email! (email-service) notification removed-emails actor))

(defn send-you-were-added-card-notification-email!
  "Send an email to `added-users` letting them know `admin-adder` has added them to `notification`"
  [notification added-user-emails adder]
  (-send-you-were-added-card-notification-email! (email-service) notification added-user-emails adder))

(defn send-user-joined-admin-notification-email!
  "Send an email to the `invitor` (the Admin who invited `new-user`) letting them know `new-user` has joined."
  ([new-user]
   (send-user-joined-admin-notification-email! new-user nil))
  ([new-user {:keys [google-auth?]}]
   (-send-user-joined-admin-notification-email! (email-service) new-user {:google-auth? google-auth?})))

(defn send-follow-up-email!
  "Format and send an email to the system admin following up on the installation."
  [email]
  (-send-follow-up-email! (email-service) email))

(defn send-creator-sentiment-email!
  "Format and send an email to a creator with a link to a survey. If a [[blob]] is included, it will be turned into
  json and then base64 encoded."
  [user blob]
  (-send-creator-sentiment-email! (email-service) user blob))

(defn send-password-reset-email!
  "Format and send an email informing the user how to reset their password."
  [email sso-source password-reset-url is-active?]
  (-send-password-reset-email! (email-service) email sso-source password-reset-url is-active?))

(defn send-login-from-new-device-email!
  "Format and send an email informing the user that this is the first time we've seen a login from this device. Expects
  login history information as returned by [[metabase.login-history.models.login-history/human-friendly-infos]]."
  [login-history]
  (-send-login-from-new-device-email! (email-service) login-history))
