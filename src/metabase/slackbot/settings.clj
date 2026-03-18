(ns metabase.slackbot.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.string :as u.str]))

(defsetting metabot-slack-signing-secret
  (deferred-tru "Signing secret for verifying requests from the Metabot Slack app")
  :type       :string
  :visibility :admin
  :encryption :when-encryption-key-set
  :export?    false
  :audit      :no-value
  :getter     (fn []
                (-> (setting/get-value-of-type :string :metabot-slack-signing-secret)
                    (u.str/mask 4))))

(defn unobfuscated-metabot-slack-signing-secret
  "Get the unobfuscated value of [[metabot-slack-signing-secret]]."
  []
  (setting/get-value-of-type :string :metabot-slack-signing-secret))

(defsetting slackbot-event-handler-pool-size
  (deferred-tru "Maximum number of concurrent Slack event handler threads.")
  :visibility :internal
  :type       :integer
  :default    64
  :setter     :none
  :export?    false)
