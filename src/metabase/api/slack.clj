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
  (try
    (slack/slack-app-token slack-app-token)
    {:ok true}
    (catch clojure.lang.ExceptionInfo info
      (throw (ex-info (ex-message info)
                      (assoc (ex-data info) :status-code 400))))))

(api/define-routes)
