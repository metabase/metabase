(ns metabase-enterprise.metabot-v3.api.slackbot.config
  "Configuration, manifest, and validation helpers for slackbot."
  (:require
   [metabase-enterprise.metabot-v3.api.slackbot.client :as slackbot.client]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.channel.settings :as channel.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.system.core :as system]
   [metabase.util.encryption :as encryption]))

(set! *warn-on-reflection* true)

(defn build-slack-manifest
  "Build the full Metabot Slack app manifest for the given base URL."
  [base-url]
  {:display_information {:name "Metabot"
                         :description "Your AI-powered data assistant"
                         :background_color "#509EE3"}
   :features {:app_home {:home_tab_enabled false
                         :messages_tab_enabled true
                         :messages_tab_read_only_enabled false}
              :bot_user {:display_name "Metabot"
                         :always_online false}
              :assistant_view {:assistant_description "Your AI-powered data assistant"}
              :slash_commands [{:command "/metabot"
                                :url (str base-url "/api/ee/metabot-v3/slack/commands")
                                :description "Issue a Metabot command"
                                :should_escape false}]}
   :oauth_config {:redirect_urls [(str base-url "/auth/sso/slack-connect/callback")]
                  :scopes {:bot ["app_mentions:read"
                                 "assistant:write"
                                 "channels:history"
                                 "chat:write"
                                 "chat:write.customize"
                                 "chat:write.public"
                                 "channels:join"
                                 "channels:read"
                                 "commands"
                                 "groups:read"
                                 "groups:history"
                                 "im:history"
                                 "im:read"
                                 "files:read"
                                 "files:write"
                                 "mpim:read"
                                 "users:read"]}}
   :settings {:event_subscriptions {:request_url (str base-url "/api/ee/metabot-v3/slack/events")
                                    :bot_events ["app_home_opened"
                                                 "app_mention"
                                                 "message.channels"
                                                 "message.im"
                                                 "assistant_thread_started"
                                                 "assistant_thread_context_changed"]}
              :interactivity {:is_enabled true
                              :request_url (str base-url "/api/ee/metabot-v3/slack/interactive")}
              :org_deploy_enabled true
              :socket_mode_enabled false
              :token_rotation_enabled false}})

(defn setup-complete?
  "Returns true if all required Slack settings are configured to process events."
  []
  (boolean
   (and (some? (system/site-url))
        (premium-features/enable-sso-slack?)
        (sso-settings/slack-connect-client-id)
        (sso-settings/slack-connect-client-secret)
        (metabot.settings/metabot-slack-signing-secret)
        (channel.settings/unobfuscated-slack-app-token)
        (encryption/default-encryption-enabled?))))

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defn validate-bot-token!
  "Validate a Slack bot token using the auth.test endpoint.
   Throws an exception with appropriate status code if validation fails:
   - 400 for invalid/revoked tokens
   - 502 for Slack API errors (e.g., Slack is down)
   Returns the response map on success."
  [token]
  (slackbot.client/auth-test {:token token}))
