(ns metabase-enterprise.security-center.settings
  "Settings for Security Center notification channels."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting security-center-email-recipients
  (deferred-tru "List of email recipients for Security Center notifications.")
  :type       :json
  :default    nil
  :encryption :no
  :feature    :admin-security-center
  :visibility :admin
  :export?    false
  :doc        false
  :audit      :getter
  :getter     (fn []
                (or
                 (some->> (setting/get-value-of-type :json :security-center-email-recipients)
                          (mapv #(update % :type keyword)))
                 ;; default to all admins -- can't use (perms/admin-group) inline in :default as the group may not exist yet
                 [{:type :notification-recipient/group, :permissions_group_id (:id (perms/admin-group))}]))
  :setter     (fn [new-value]
                (when (or (nil? new-value) (empty? new-value))
                  (throw (ex-info (str (deferred-tru "At least one email recipient is required."))
                                  {:status-code 400})))
                (setting/set-value-of-type! :json :security-center-email-recipients new-value)))

(defsetting security-center-slack-channel
  (deferred-tru "Slack channel for Security Center notifications. Null means Slack notifications are disabled.")
  :type       :string
  :default    nil
  :encryption :no
  :feature    :admin-security-center
  :visibility :admin
  :export?    false
  :doc        false
  :audit      :getter
  :setter     (fn [new-value]
                (when (and (some? new-value)
                           (not (setting/get-value-of-type :boolean :slack-token-valid?)))
                  (throw (ex-info (str (deferred-tru "Slack is not configured for this instance."))
                                  {:status-code 400})))
                (setting/set-value-of-type! :string :security-center-slack-channel new-value)))
