(ns metabase-enterprise.security-center.settings
  "Settings for Security Center notification channels."
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting security-center-email-recipients
  (deferred-tru "List of email recipients for Security Center notifications. Null means all instance admin emails.")
  :type       :json
  :default    nil
  :encryption :no
  :feature    :admin-security-center
  :visibility :admin
  :export?    false
  :doc        false
  :audit      :getter
  :setter     (fn [new-value]
                ;; nil is valid (means "all admins"); non-nil must be non-empty
                (when (and (some? new-value) (empty? new-value))
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
