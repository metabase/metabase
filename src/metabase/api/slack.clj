(ns metabase.api.slack
  "/api/slack endpoints"
  (:require [compojure.core :refer [PUT]]
            [metabase.api.common :refer :all]
            [metabase.config :as config]
            [metabase.integrations.slack :as slack]
            [metabase.models.setting :as setting]))

(defendpoint PUT "/settings"
  "Update Slack related settings. You must be a superuser to do this."
  [:as {{slack-token :slack-token, metabot-enabled :metabot-enabled, :as slack-settings} :body}]
  {slack-token     [Required NonEmptyString]
   metabot-enabled [Required]}
  (check-superuser)
  (try
    ;; just check that channels.list doesn't throw an exception (a.k.a. that the token works)
    (when-not config/is-test?
      (slack/GET :channels.list, :exclude_archived 1, :token slack-token))
    (setting/set-many! slack-settings)
    {:ok true}
    (catch clojure.lang.ExceptionInfo info
      {:status 400, :body (ex-data info)})))

(define-routes)
