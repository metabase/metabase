(ns metabase.api.slack
  "/api/slack endpoints"
  (:require [compojure.core :refer [PUT]]
            [metabase.api.common :as api]
            [metabase.config :as config]
            [metabase.integrations.slack :as slack]
            [metabase.models.setting :as setting]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]))

(api/defendpoint PUT "/settings"
  "Update Slack related settings. You must be a superuser to do this."
  [:as {{slack-token :slack-token, metabot-enabled :metabot-enabled, :as slack-settings} :body}]
  {slack-token     (s/maybe su/NonBlankString)
   metabot-enabled s/Bool}
  (api/check-superuser)
  (if-not slack-token
    (setting/set-many! {:slack-token nil, :metabot-enabled false})
    (try
      (when-not config/is-test?
        (when-not (slack/valid-token? slack-token)
          (throw (ex-info (tru "Invalid Slack token.") {:status-code 400}))))
      (setting/set-many! slack-settings)
      {:ok true}
      (catch clojure.lang.ExceptionInfo info
        {:status 400, :body (ex-data info)}))))

(api/define-routes)
