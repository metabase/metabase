(ns metabase-enterprise.slackbot.settings
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.string :as u.str]))

(defsetting metabot-slack-signing-secret
  (deferred-tru "Signing secret for verifying requests from the Metabot Slack app")
  :type       :string
  :visibility :admin
  :encryption :when-encryption-key-set
  :feature    :metabot-v3
  :export?    false
  :audit      :no-value
  :getter     (fn []
                (-> (setting/get-value-of-type :string :metabot-slack-signing-secret)
                    (u.str/mask 4))))

(defn unobfuscated-metabot-slack-signing-secret
  "Get the unobfuscated value of [[metabot-slack-signing-secret]]."
  []
  (setting/get-value-of-type :string :metabot-slack-signing-secret))

(defenterprise metabot-slack-signing-secret-setting
  "Returns the Slack signing secret for Metabot."
  :feature :metabot-v3
  []
  (unobfuscated-metabot-slack-signing-secret))
