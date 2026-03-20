(ns metabase.slackbot.settings
  (:require
   [metabase.server.settings :as server.settings]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defn metabot-slack-signing-secret
  "Signing secret for verifying requests from the Metabot Slack app.
   Delegates to [[metabase.server.settings/metabot-slack-signing-secret]]."
  []
  (server.settings/metabot-slack-signing-secret))

(defn unobfuscated-metabot-slack-signing-secret
  "Get the unobfuscated value of [[metabot-slack-signing-secret]].
   Delegates to [[metabase.server.settings/unobfuscated-metabot-slack-signing-secret]]."
  []
  (server.settings/unobfuscated-metabot-slack-signing-secret))

(defsetting slackbot-event-handler-pool-size
  (deferred-tru "Maximum number of concurrent Slack event handler threads.")
  :visibility :internal
  :type       :integer
  :default    64
  :setter     :none
  :export?    false)
