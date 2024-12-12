(ns metabase.api.slack
  "/api/slack endpoints"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [compojure.core :refer [PUT]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.config :as config]
   [metabase.integrations.slack :as slack]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- create-slack-message-blocks
  "Create blocks for the Slack message with diagnostic information"
  [diagnostic-info file-info]
  (let [metabase-info (get-in diagnostic-info [:bugReportDetails :metabase-info])
        system-info (get-in diagnostic-info [:bugReportDetails :system-info])
        version-info (get-in diagnostic-info [:bugReportDetails :metabase-info :version])
        description (get diagnostic-info :description)
        file-url (if (string? file-info)
                   file-info
                   (:url file-info))]
    [{:type "section"
      :text {:type "mrkdwn"
             :text "A new bug report has been submitted. Please check it out!"}}
     {:type "section"
      :text {:type "mrkdwn"
             :text (str "*Description:*\n" (or description "N/A"))}}
     {:type "section"
      :fields [{:type "mrkdwn"
                :text (str "*URL:*\n" (get diagnostic-info :url "N/A"))}
               {:type "mrkdwn"
                :text (str "*App database:*\n"
                           (get metabase-info :application-database "N/A"))}
               {:type "mrkdwn"
                :text (str "*Java Runtime:*\n"
                           (get system-info :java.runtime.name "N/A"))}
               {:type "mrkdwn"
                :text (str "*Java Version:*\n"
                           (get system-info :java.runtime.version "N/A"))}
               {:type "mrkdwn"
                :text (str "*OS Name:*\n"
                           (get system-info :os.name "N/A"))}
               {:type "mrkdwn"
                :text (str "*OS Version:*\n"
                           (get system-info :os.version "N/A"))}
               {:type "mrkdwn"
                :text (str "*Version info:*\n```"
                           (json/encode version-info {:pretty true})
                           "```")}]}
     {:type "divider"}
     {:type "actions"
      :elements [{:type "button"
                  :text {:type "plain_text"
                         :text "Jump to debugger"
                         :emoji true}
                  :url (str "https://metabase-debugger.vercel.app/?fileId="
                            (if (string? file-info)
                              (last (str/split file-info #"/"))  ; Extract file ID from URL
                              (:id file-info)))
                  :style "primary"}
                 {:type "button"
                  :text {:type "plain_text"
                         :text "Download the report"
                         :emoji true}
                  :url file-url}]}]))

(api/defendpoint PUT "/settings"
  "Update Slack related settings. You must be a superuser to do this. Also updates the slack-cache.
  There are 3 cases where we alter the slack channel/user cache:
  1. falsy token           -> clear
  2. invalid token         -> clear
  3. truthy, valid token   -> refresh "
  [:as {{slack-app-token :slack-app-token, slack-files-channel :slack-files-channel, slack-bug-report-channel :slack-bug-report-channel} :body}]
  {slack-app-token     [:maybe ms/NonBlankString]
   slack-files-channel    [:maybe ms/NonBlankString]
   slack-bug-report-channel [:maybe :string]}
  (validation/check-has-application-permission :setting)
  (try
    ;; Clear settings if no values are provided
    (when (nil? slack-app-token)
      (slack/slack-app-token! nil)
      (slack/clear-channel-cache!))

    (when (nil? slack-files-channel)
      (slack/slack-files-channel! "metabase_files"))

    (when (and slack-app-token
               (not config/is-test?)
               (not (slack/valid-token? slack-app-token)))
      (slack/clear-channel-cache!)
      (throw (ex-info (tru "Invalid Slack token.")
                      {:errors {:slack-app-token (tru "invalid token")}})))
    (slack/slack-app-token! slack-app-token)
    (if slack-app-token
      (do (slack/slack-token-valid?! true)
          ;; Clear the deprecated `slack-token` when setting a new `slack-app-token`
          (slack/slack-token! nil)
          ;; refresh user/conversation cache when token is newly valid
          (slack/refresh-channels-and-usernames-when-needed!))
      ;; clear user/conversation cache when token is newly empty
      (slack/clear-channel-cache!))

    (when slack-files-channel
      (let [processed-files-channel (slack/process-files-channel-name slack-files-channel)]
        (when-not (slack/channel-exists? processed-files-channel)
          ;; Files channel could not be found; clear the token we had previously set since the integration should not be
          ;; enabled.
          (slack/slack-token-valid?! false)
          (slack/slack-app-token! nil)
          (slack/clear-channel-cache!)
          (throw (ex-info (tru "Slack channel not found.")
                          {:errors {:slack-files-channel (tru "channel not found")}})))
        (slack/slack-files-channel! processed-files-channel)))

    (when slack-bug-report-channel
      (let [processed-bug-channel (slack/process-files-channel-name slack-bug-report-channel)]
        (when (not (slack/channel-exists? processed-bug-channel))
          (throw (ex-info (tru "Slack channel not found.")
                          {:errors {:slack-bug-report-channel (tru "channel not found")}})))
        (slack/slack-bug-report-channel! processed-bug-channel)))

    {:ok true}
    (catch clojure.lang.ExceptionInfo info
      {:status 400, :body (ex-data info)})))

(def ^:private slack-manifest
  (delay (slurp (io/resource "slack-manifest.yaml"))))

(api/defendpoint GET "/manifest"
  "Returns the YAML manifest file that should be used to bootstrap new Slack apps"
  []
  (validation/check-has-application-permission :setting)
  @slack-manifest)

;; Handle bug report submissions to Slack
(api/defendpoint POST "/bug-report"
  "Send diagnostic information to the configured Slack channels."
  [:as {{:keys [diagnosticInfo]} :body}]
  {diagnosticInfo map?}
  (try
    (let [files-channel (slack/files-channel)
          bug-report-channel (slack/bug-report-channel)
          file-content (.getBytes (json/encode diagnosticInfo {:pretty true}))
          file-info (slack/upload-file! file-content
                                        "diagnostic-info.json"
                                        files-channel)]

      (let [blocks (create-slack-message-blocks diagnosticInfo file-info)]

        (slack/post-chat-message!
         bug-report-channel
         nil
         {:blocks blocks})

        {:success true
         :file-url (get file-info :permalink_public)}))
    (catch Exception e
      {:success false
       :error (.getMessage e)})))

(api/define-routes)
