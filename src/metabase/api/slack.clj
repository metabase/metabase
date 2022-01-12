(ns metabase.api.slack
  "/api/slack endpoints"
  (:require [compojure.core :refer [PUT]]
            [metabase.api.common :as api]
            [metabase.config :as config]
            [metabase.integrations.slack :as slack]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(api/defendpoint PUT "/settings"
  "Update Slack related settings. You must be a superuser to do this."
  [:as {{slack-app-token :slack-app-token} :body}]
  {slack-app-token     (s/maybe su/NonBlankString)}
  (api/check-superuser)
  (if-not slack-app-token
    (slack/slack-app-token nil)
    (try
      (when-not config/is-test?
        (when-not (slack/valid-token? slack-app-token)
          (throw (ex-info (tru "Invalid Slack token.")
          {:errors {:slack-app-token (tru "invalid token")}}))))
      ;; Clear the deprecated `slack-token` when setting a new `slack-app-token`
      (slack/slack-token nil)
      (slack/slack-app-token slack-app-token)
      {:ok true}
      (catch clojure.lang.ExceptionInfo info
        {:status 400, :body (ex-data info)}))))

(api/define-routes)
