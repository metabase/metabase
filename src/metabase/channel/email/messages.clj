(ns metabase.channel.email.messages
  "Convenience functions for sending templated email messages.  Each function here should represent a single email.
   NOTE: we want to keep this about email formatting, so don't put heavy logic here RE: building data for emails.

  NOTE: This namespace is deprecated, all of these emails will soon be converted to System Email Notifications."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.app-db.core :as app-db]
   [metabase.appearance.core :as appearance]
   [metabase.channel.email :as email]
   [metabase.channel.email.logo :as email.logo]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.template.core :as channel.template]
   [metabase.channel.urls :as urls]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.util :as lib.util]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :as i18n :refer [trs tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn app-name-trs
  "Return the user configured application name, or Metabase translated
  via trs if a name isn't configured."
  []
  (or (appearance/application-name)
      (trs "Metabase")))

(defn- logo-bundle
  "Get the logo bundle for the current application logo."
  []
  (email.logo/logo-bundle (appearance/application-logo-url)))

(defn logo-url
  "Return the URL for the application logo. If the logo is the default, return a URL to the Metabase logo.
   For data URIs, returns the cid: reference (requires logo-attachment to be included in email)."
  []
  (:image-src (logo-bundle)))

(defn logo-attachment
  "Return the logo attachment map for embedding in emails, or nil if not needed."
  []
  (:attachment (logo-bundle)))

(defn button-style
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

;;; Various Context Helper Fns. Used to build Stencil template context

(defn common-context
  "Context that is used across multiple email templates, and that is the same for all emails"
  []
  {:applicationName    (appearance/application-name)
   :applicationColor   (channel.render/primary-color)
   :applicationLogoUrl (logo-url)
   :buttonStyle        (button-style (channel.render/primary-color))
   :colorTextLight     channel.render/color-text-light
   :colorTextMedium    channel.render/color-text-medium
   :colorTextDark      channel.render/color-text-dark
   :siteUrl            (system/site-url)})

(defn- make-message-attachment
  "Convert a content-id/url pair to an email attachment map."
  [[content-id url]]
  {:type         :inline
   :content-id   content-id
   :content-type "image/png"
   :content      url})

(defn- send-email-with-logo!
  "Send an email, including the logo as an attachment if it's a data URI.
   Takes the same args as email/send-message! but handles logo attachments automatically."
  [{:keys [message] :as email-args}]
  (if-let [attachment (logo-attachment)]
    (email/send-message!
     (assoc email-args
            :message-type :attachments
            :message      (vec (cons {:type    "text/html; charset=utf-8"
                                      :content message}
                                     [(make-message-attachment (first attachment))]))))
    (email/send-message! email-args)))

;;; ### Public Interface

(defn- all-admin-recipients
  "Return a sequence of email addresses for all Admin users.

  The first recipient will be the site admin (or oldest admin if unset), which is the address that should be used in
  `mailto` links (e.g., for the new user to email with any questions)."
  []
  (concat (when-let [admin-email (system/admin-email)]
            [admin-email])
          (t2/select-fn-set :email 'User, :is_superuser true, :is_active true, :type "personal" {:order-by [[:id :asc]]})))

(defn send-user-joined-admin-notification-email!
  "Send an email to the `invitor` (the Admin who invited `new-user`) letting them know `new-user` has joined."
  [new-user & {:keys [google-auth?]}]
  {:pre [(map? new-user)]}
  (let [recipients (all-admin-recipients)]
    (send-email-with-logo!
     {:subject      (str (if google-auth?
                           (trs "{0} created a {1} account" (:common_name new-user) (app-name-trs))
                           (trs "{0} accepted their {1} invite" (:common_name new-user) (app-name-trs))))
      :recipients   recipients
      :message-type :html
      :message      (channel.template/render "metabase/channel/email/user_joined_notification.hbs"
                                             (merge (common-context)
                                                    {:logoHeader        true
                                                     :joinedUserName    (or (:first_name new-user) (:email new-user))
                                                     :joinedViaSSO      google-auth?
                                                     :joinedUserEmail   (:email new-user)
                                                     :joinedDate        (t/format "EEEE, MMMM d" (t/zoned-date-time)) ; e.g. "Wednesday, July 13".
                                                     :adminEmail        (first recipients)
                                                     :joinedUserEditUrl (str (system/site-url) "/admin/people")}))})))

(defn send-password-reset-email!
  "Format and send an email informing the user how to reset their password."
  [email sso-source password-reset-url is-active?]
  {:pre [(u/email? email)
         ((some-fn string? nil?) password-reset-url)]}
  (let [google-sso? (= :google sso-source)
        message-body (channel.template/render
                      "metabase/channel/email/password_reset.hbs"
                      (merge (common-context)
                             {:emailType        "password_reset"
                              :google           google-sso?
                              :nonGoogleSSO     (and (not google-sso?) (some? sso-source))
                              :passwordResetUrl password-reset-url
                              :logoHeader       true
                              :isActive         is-active?
                              :adminEmail       (system/admin-email)
                              :adminEmailSet    (boolean (system/admin-email))}))]
    (send-email-with-logo!
     {:subject      (trs "[{0}] Password Reset Request" (app-name-trs))
      :recipients   [email]
      :message-type :html
      :message      message-body})))

(mu/defn send-login-from-new-device-email!
  "Format and send an email informing the user that this is the first time we've seen a login from this device. Expects
  login history information as returned by [[metabase.login-history.models.login-history/human-friendly-infos]]."
  [{user-id :user_id, :keys [timestamp], :as login-history} :- [:map [:user_id pos-int?]]]
  (let [user-info    (or (t2/select-one [:model/User :last_name :first_name :email :locale] :id user-id)
                         (throw (ex-info (tru "User {0} does not exist" user-id)
                                         {:user-id user-id, :status-code 404})))
        user-locale  (or (:locale user-info) (i18n/site-locale))
        timestamp    (u.date/format-human-readable timestamp user-locale)
        username     (or (:first_name user-info) (:last_name user-info) (:email user-info))
        context      (merge (common-context)
                            {:first-name username
                             :device     (:device_description login-history)
                             :location   (:location login-history)
                             :timestamp  timestamp})
        message-body (channel.template/render "metabase/channel/email/login_from_new_device.hbs"
                                              context)]
    (email/send-message!
     {:subject      (trs "We''ve Noticed a New {0} Login, {1}" (app-name-trs) username)
      :recipients   [(:email user-info)]
      :message-type :html
      :message      message-body})))

(defn- admin-or-ee-monitoring-details-emails
  "Find emails for users that have an interest in monitoring the database.
   If oss that means admin users.
   If ee that also means users with monitoring and details permissions."
  [database-id]
  (let [monitoring (perms/application-perms-path :monitoring)
        user-ids-with-monitoring (when (premium-features/enable-advanced-permissions?)
                                   (->> {:select   [:pgm.user_id]
                                         :from     [[:permissions_group_membership :pgm]]
                                         :join     [[:permissions_group :pg] [:= :pgm.group_id :pg.id]]
                                         :where    [:and
                                                    [:exists {:select [1]
                                                              :from [[:permissions :p]]
                                                              :where [:and
                                                                      [:= :p.group_id :pg.id]
                                                                      [:= :p.object monitoring]]}]]
                                         :group-by [:pgm.user_id]}
                                        app-db/query
                                        (mapv :user_id)))
        user-ids (filter
                  #(perms/user-has-permission-for-database? % :perms/manage-database :yes database-id)
                  user-ids-with-monitoring)]
    (into
     []
     (distinct)
     (concat
      (all-admin-recipients)
      (when (seq user-ids)
        (t2/select-fn-set :email :model/User {:where [:and
                                                      [:= :is_active true]
                                                      [:in :id user-ids]]}))))))

(defn send-persistent-model-error-email!
  "Format and send an email informing the user about errors in the persistent model refresh task."
  [database-id persisted-infos trigger]
  {:pre [(seq persisted-infos)]}
  (let [database (:database (first persisted-infos))
        emails (admin-or-ee-monitoring-details-emails database-id)
        timezone (some-> database qp.timezone/results-timezone-id t/zone-id)
        context {:database-name (:name database)
                 :errors
                 (for [[idx persisted-info] (m/indexed persisted-infos)
                       :let [card (:card persisted-info)
                             collection (or (:collection card)
                                            (collection/root-collection-with-ui-details nil))]]
                   {:is-not-first (not= 0 idx)
                    :error (:error persisted-info)
                    :card-id (:id card)
                    :card-name (:name card)
                    :collection-name (:name collection)
                    ;; February 1, 2022, 3:10 PM
                    :last-run-at (t/format "MMMM d, yyyy, h:mm a z" (t/zoned-date-time (:refresh_begin persisted-info) timezone))
                    :last-run-trigger trigger
                    :card-url (urls/card-url (:id card))
                    :collection-url (urls/collection-url (:id collection))
                    :caching-log-details-url (urls/tools-caching-details-url (:id persisted-info))})}
        message-body (channel.template/render "metabase/channel/email/persisted-model-error.hbs"
                                              (merge (common-context) context))]
    (when (seq emails)
      (email/send-message!
       {:subject      (trs "[{0}] Model cache refresh failed for {1}" (app-name-trs) (:name database))
        :recipients   (vec emails)
        :message-type :html
        :message      message-body}))))

(defn send-follow-up-email!
  "Format and send an email to the system admin following up on the installation."
  [email]
  {:pre [(u/email? email)]}
  (let [context (merge (common-context)
                       {:emailType    "notification"
                        :logoHeader   true
                        :heading      (trs "We hope you''ve been enjoying Metabase.")
                        :callToAction (trs "Would you mind taking a quick 5 minute survey to tell us how it’s going?")
                        :link         "https://metabase.com/feedback/active"})
        email-msg {:subject      (trs "[{0}] Tell us how things are going." (app-name-trs))
                   :recipients   [email]
                   :message-type :html
                   :message      (channel.template/render "metabase/channel/email/follow_up_email.hbs" context)}]
    (send-email-with-logo! email-msg)))

(defn send-creator-sentiment-email!
  "Format and send an email to a creator with a link to a survey. If a [[blob]] is included, it will be turned into json
  and then base64 encoded."
  [{:keys [email first_name]} blob]
  {:pre [(u/email? email)]}
  (let [encoded-info    (when blob
                          (-> blob
                              json/encode
                              .getBytes
                              codecs/bytes->b64-str))
        context (merge (common-context)
                       {:emailType  "notification"
                        :logoHeader true
                        :first-name first_name
                        :link       (cond-> "https://metabase.com/feedback/creator"
                                      encoded-info (str "?context=" encoded-info))}
                       (when-not (premium-features/is-hosted?)
                         {:self-hosted (system/site-url)}))
        message {:subject      "Metabase would love your take on something"
                 :recipients   [email]
                 :message-type :html
                 :message      (channel.template/render "metabase/channel/email/creator_sentiment_email.hbs" context)}]
    (send-email-with-logo! message)))

(defn generate-pulse-unsubscribe-hash
  "Generates hash to allow for non-users to unsubscribe from pulses/subscriptions.

  Deprecated: only used for dashboard subscriptions for now, should be migrated to `generate-notification-unsubscribe-hash`
  once we migrate all the dashboard subscriptions to the new notification system."
  [pulse-id email]
  (codecs/bytes->hex
   (encryption/validate-and-hash-secret-key
    (json/encode {:salt     (channel.settings/site-uuid-for-unsubscribing-url)
                  :email    email
                  :pulse-id pulse-id}))))

(defn generate-notification-unsubscribe-hash
  "Generates hash to allow for non-users to unsubscribe from notifications."
  [notification-id email]
  (codecs/bytes->hex
   (encryption/validate-and-hash-secret-key
    (json/encode {:salt            (channel.settings/site-uuid-for-unsubscribing-url)
                  :email           email
                  :notification-id notification-id}))))

(defn pulse->alert-condition-kwd
  "Given an `alert` return a keyword representing what kind of goal needs to be met."
  [{:keys [alert_above_goal alert_condition] :as _alert}]
  (if (= "goal" alert_condition)
    (if (true? alert_above_goal)
      :meets
      :below)
    :rows))

(defn- send-email-sync!
  ([recipients subject template-path template-context]
   (send-email-sync! recipients subject template-path template-context false))
  ([recipients subject template-path template-context bcc?]
   (when (seq recipients)
     (try
       (email/send-email-retrying!
        {:recipients   recipients
         :message-type :html
         :subject      subject
         :message      (channel.template/render template-path template-context)
         :bcc?         bcc?})
       (catch Exception e
         (log/errorf e "Failed to send message to '%s' with subject '%s'" (str/join ", " recipients) subject))))))

(defn- send-email!
  "Sends an email on a background thread, returning a future."
  [& args]
  (future (apply send-email-sync! args)))

(defn- template-path [template-name]
  (str "metabase/channel/email/" template-name ".hbs"))

;; Paths to the templates for all of the alerts emails
(def ^:private you-unsubscribed-template   (template-path "notification_card_unsubscribed"))
(def ^:private removed-template            (template-path "notification_card_you_were_removed"))
(def ^:private added-template              (template-path "notification_card_you_were_added"))
(def ^:private changed-stopped-template    (template-path "card_notification_changed_stopped"))
(def ^:private archived-template           (template-path "card_notification_archived"))

(defn- username
  [user]
  (or (:common_name user)
      (->> [(:first_name user) (:last_name user)]
           (remove nil?)
           (str/join " "))))

(defn send-you-unsubscribed-notification-card-email!
  "Send an email to `who-unsubscribed` letting them know they've unsubscribed themselves from `notification`"
  [notification unsubscribed-emails]
  (send-email! unsubscribed-emails "You unsubscribed from an alert" you-unsubscribed-template notification true))

(defn send-you-were-removed-notification-card-email!
  "Send an email to `removed-users` letting them know `admin` has removed them from `notification`"
  [notification removed-emails actor]
  (send-email! removed-emails "You’ve been unsubscribed from an alert" removed-template (assoc notification :actor_name (username actor)) true))

(defn send-you-were-added-card-notification-email!
  "Send an email to `added-users` letting them know `admin-adder` has added them to `notification`"
  [notification added-user-emails adder]
  (let [subject (format "%s added you to an alert" (username adder))]
    (send-email! added-user-emails subject added-template notification true)))

(def ^:private not-working-subject "One of your alerts has stopped working")

(defn send-alert-stopped-because-archived-email!
  "Email to notify users when a card associated to their alert has been archived"
  [card recipient-emails recipient-emails-with-no-links archiver]
  (send-email! recipient-emails not-working-subject archived-template
               {:card card
                :actor archiver}
               true)
  (send-email! recipient-emails-with-no-links not-working-subject archived-template
               {:card card
                :actor archiver
                :disable_links true}
               true))

(defn send-alert-stopped-because-changed-email!
  "Email to notify users when a card associated to their alert changed in a way that invalidates their alert"
  [card recipient-emails recipient-emails-with-no-links archiver]
  (send-email! recipient-emails not-working-subject changed-stopped-template
               {:card card
                :actor archiver}
               true)
  (send-email! recipient-emails-with-no-links not-working-subject changed-stopped-template
               {:card card
                :actor archiver
                :disable_links true}
               true))

(defn send-broken-subscription-notification!
  "Email dashboard and subscription creators information about a broken subscription due to bad parameters"
  [{:keys [dashboard-id dashboard-name pulse-creator dashboard-creator affected-users bad-parameters disable_links]}]
  (let [{:keys [siteUrl] :as context} (common-context)]
    (email/send-message!
     :subject (trs "Subscription to {0} removed" dashboard-name)
     :recipients (distinct (map :email [pulse-creator dashboard-creator]))
     :message-type :html
     :message (channel.template/render
               "metabase/channel/email/broken_subscription_notification.hbs"
               (merge context
                      {:dashboardName            dashboard-name
                       :badParameters            (map
                                                  (fn [{:keys [value] :as param}]
                                                    (cond-> param
                                                      (coll? value)
                                                      (update :value #(lib.util/join-strings-with-conjunction
                                                                       (i18n/tru "or")
                                                                       %))))
                                                  bad-parameters)
                       :affectedUsers            (map
                                                  (fn [{:keys [notification-type] :as m}]
                                                    (cond-> m
                                                      notification-type
                                                      (update :notification-type name)))
                                                  (into
                                                   [{:notification-type :email
                                                     :recipient         (:common_name dashboard-creator)
                                                     :role              "Dashboard Creator"}
                                                    {:notification-type :email
                                                     :recipient         (:common_name pulse-creator)
                                                     :role              "Subscription Creator"}]
                                                   (map #(assoc % :role "Subscriber") affected-users)))
                       :dashboardUrl             (format "%s/dashboard/%s" siteUrl dashboard-id)
                       :disable_links            disable_links})))))
