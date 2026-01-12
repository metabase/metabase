(ns metabase.channel.api.slack
  "/api/slack endpoints"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.slack :as slack]
   [metabase.config.core :as config]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- truncate-url
  "Cut length of long URLs to avoid spamming the Slack channel"
  [url]
  (if (<= (count url) 45)
    url
    (str (subs url 0 38) "..." (subs url (- (count url) 5)))))

(defn- create-slack-message-blocks
  "Create blocks for the Slack message with diagnostic information"
  [diagnostic-info file-info]
  (let [version-info (get-in diagnostic-info [:bugReportDetails :metabase-info :version])
        description (get diagnostic-info :description)
        reporter (get diagnostic-info :reporter)
        file-url (if (string? file-info)
                   file-info
                   (:url file-info))]
    [{:type "rich_text"
      :elements [{:type "rich_text_section"
                  :elements [{:type "text"
                              :text "New bug report from "}
                             (if reporter
                               {:type "link"
                                :url (str "mailto:" (:email reporter))
                                :text (:name reporter)}
                               {:type "text"
                                :text "anonymous user"})
                             {:type "text"
                              :text "\n\nDescription:\n"
                              :style {:bold true}}]}]}
     {:type "section" :text {:type "mrkdwn" :text (or description "N/A")}}
     {:type "rich_text"
      :elements [{:type "rich_text_section"
                  :elements [{:type "text"
                              :text "\n\nURL:\n"
                              :style {:bold true}}
                             {:type "link"
                              :text (truncate-url (get diagnostic-info :url))
                              :url (get diagnostic-info :url)}
                             {:type "text"
                              :text "\n\nVersion info:\n"
                              :style {:bold true}}]}
                 {:type "rich_text_preformatted"
                  :border 0
                  :elements [{:type "text"
                              :text (json/encode version-info {:pretty true})}]}]}
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/settings"
  "Update Slack related settings. You must be a superuser to do this. Also updates the slack-cache.
  There are 3 cases where we alter the slack channel/user cache:
  1. falsy token           -> clear
  2. invalid token         -> clear
  3. truthy, valid token   -> refresh "
  [_route-params
   _query-params
   {:keys [slack-app-token slack-bug-report-channel]}
   :- [:map
       [:slack-app-token          {:optional true} [:maybe ms/NonBlankString]]
       [:slack-bug-report-channel {:optional true} [:maybe :string]]]]
  (perms/check-has-application-permission :setting)
  (try
    ;; Clear settings if no values are provided
    (when (nil? slack-app-token)
      (channel.settings/slack-app-token! nil)
      (slack/clear-channel-cache!))

    (when (and slack-app-token
               (not config/is-test?)
               (not (slack/valid-token? slack-app-token)))
      (slack/clear-channel-cache!)
      (throw (ex-info (tru "Invalid Slack token.")
                      {:errors {:slack-app-token (tru "invalid token")}})))
    (channel.settings/slack-app-token! slack-app-token)
    (if slack-app-token
      (do (channel.settings/slack-token-valid?! true)
          ;; Clear the deprecated `slack-token` when setting a new `slack-app-token`
          (channel.settings/slack-token! nil)
          ;; refresh user/conversation cache when token is newly valid
          (slack/refresh-channels-and-usernames-when-needed!))
      ;; clear user/conversation cache when token is newly empty
      (slack/clear-channel-cache!))

    (when slack-bug-report-channel
      (let [processed-bug-channel (channel.settings/process-files-channel-name slack-bug-report-channel)]
        (when (not (slack/channel-exists? processed-bug-channel))
          (throw (ex-info (tru "Slack channel not found.")
                          {:errors {:slack-bug-report-channel (tru "channel not found")}})))
        (channel.settings/slack-bug-report-channel! processed-bug-channel)))

    {:ok true}
    (catch clojure.lang.ExceptionInfo info
      {:status 400, :body (ex-data info)})))

(def ^:private slack-manifest
  (delay (slurp (io/resource "slack-manifest.yaml"))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/manifest"
  "Returns the YAML manifest file that should be used to bootstrap new Slack apps"
  []
  (perms/check-has-application-permission :setting)
  @slack-manifest)

;; Handle bug report submissions to Slack
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/bug-report"
  "Send diagnostic information to the configured Slack channels."
  [_route-params
   _query-params
   {diagnostic-info :diagnosticInfo} :- [:map
                                         ;; TODO FIXME -- this should not use `camelCase` keys
                                         [:diagnosticInfo map?]]]
  (try
    (let [bug-report-channel (slack/bug-report-channel)
          file-content (.getBytes (json/encode diagnostic-info {:pretty true}))
          file-info (slack/upload-file! file-content "diagnostic-info.json")
          blocks (create-slack-message-blocks diagnostic-info file-info)]
      (slack/post-chat-message!
       {:channel bug-report-channel :blocks blocks})
      {:success true
       :file-url (get file-info :permalink_public)})
    (catch Exception e
      {:success false
       :error (.getMessage e)})))
