(ns metabase.api.slack
  "/api/slack endpoints"
  (:require [clojure.java.io :as io]
            [compojure.core :refer [PUT]]
            [metabase.api.common :as api]
            [metabase.config :as config]
            [metabase.integrations.slack :as slack]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(api/defendpoint PUT "/settings"
  "Update Slack related settings. You must be a superuser to do this."
  [:as {{slack-app-token :slack-app-token, slack-files-channel :slack-files-channel} :body}]
  {slack-app-token     (s/maybe su/NonBlankString)
   slack-files-channel (s/maybe su/NonBlankString)}
  (api/check-superuser)
  (try
    (when (and slack-app-token (not config/is-test?))
      (when-not (slack/valid-token? slack-app-token)
        (throw (ex-info (tru "Invalid Slack token.")
                        {:errors {:slack-app-token (tru "Invalid token")}
                         :status-code 400}))))
    (slack/slack-app-token slack-app-token)
    (when slack-app-token
      (do
        (slack/slack-token-valid? true)
        ;; Clear the deprecated `slack-token` when setting a new `slack-app-token`
        (slack/slack-token nil)))
    (slack/slack-files-channel slack-files-channel)
    {:ok true}
    (catch clojure.lang.ExceptionInfo info
      {:status 400, :body (ex-data info)})))

(def ^:private slack-manifest
  (delay (slurp (io/resource "slack-manifest.yaml"))))

(api/defendpoint GET "/manifest"
  "Returns the YAML manifest file that should be used to bootstrap new Slack apps"
  []
  (api/check-superuser)
  @slack-manifest)

(api/define-routes)
