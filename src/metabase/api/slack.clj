(ns metabase.api.slack
  "/api/slack endpoints"
  (:require
   [clojure.java.io :as io]
   [compojure.core :refer [PUT]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.config :as config]
   [metabase.integrations.slack :as slack]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(api/defendpoint PUT "/settings"
  "Update Slack related settings. You must be a superuser to do this. Also updates the slack-cache.
  There are 3 cases where we alter the slack channel/user cache:
  1. falsy token           -> clear
  2. invalid token         -> clear
  3. truthy, valid token   -> refresh "
  [:as {{slack-app-token :slack-app-token, slack-files-channel :slack-files-channel} :body}]
  {slack-app-token     [:maybe ms/NonBlankString]
   slack-files-channel [:maybe ms/NonBlankString]}
  (validation/check-has-application-permission :setting)
  (try
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
    (let [processed-files-channel (slack/process-files-channel-name slack-files-channel)]
      (when (and processed-files-channel (not (slack/channel-exists? processed-files-channel)))
        ;; Files channel could not be found; clear the token we had previously set since the integration should not be
        ;; enabled.
        (slack/slack-token-valid?! false)
        (slack/slack-app-token! nil)
        (throw (ex-info (tru "Slack channel not found.")
                        {:errors {:slack-files-channel (tru "channel not found")}})))
      (slack/slack-files-channel! processed-files-channel))
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

(api/define-routes)
