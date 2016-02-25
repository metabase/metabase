(ns metabase.api.slack
  "/api/slack endpoints"
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [compojure.core :refer [PUT]]
            [metabase.api.common :refer :all]
            [metabase.config :as config]
            [metabase.integrations.slack :as slack]))

(defendpoint PUT "/settings"
  "Update the `slack-token`. You must be a superuser to do this."
  [:as {{slack-token :slack-token} :body}]
  {slack-token [Required NonEmptyString]}
  (check-superuser)
  (try
    ;; just check that channels.list doesn't throw an exception (that the connection works)
    (when-not config/is-test?
      (slack/GET :channels.list, :exclude_archived 1, :token slack-token))
    {:ok true}
    (catch clojure.lang.ExceptionInfo info
      {:status 400, :body (ex-data info)})))

(define-routes)
