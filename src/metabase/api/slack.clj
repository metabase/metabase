(ns metabase.api.slack
  "/api/slack endpoints"
  (:require [clojure.tools.logging :as log]
            [clojure.set :as set]
            [cheshire.core :as cheshire]
            [compojure.core :refer [GET PUT DELETE POST]]
            [metabase.api.common :refer :all]
            [metabase.config :as config]
            [metabase.integrations [slack :refer [slack-api-get]]]
            [metabase.models.setting :as setting]))

(defn- humanize-error-messages
  "Convert raw error message responses from Slack into our normal api error response structure."
  [response body]
  (case (get body "error")
    "invalid_auth" {:errors {:slack-token "Invalid token"}}
    {:message "Sorry, something went wrong.  Please try again."}))

(defendpoint PUT "/settings"
  "Update multiple `Settings` values.  You must be a superuser to do this."
  [:as {settings :body}]
  {settings [Required Dict]}
  (check-superuser)
  (let [slack-token (:slack-token settings)
        response    (if-not (config/is-test?)
                      ;; in normal conditions, validate connection
                      (slack-api-get slack-token "channels.list" {:exclude_archived 1})
                      ;; for unit testing just respond with a success message
                      {:status 200 :body "{\"ok\":true}"})
        body        (if (= 200 (:status response)) (cheshire/parse-string (:body response)))]
    (if (= true (get body "ok"))
      ;; test was good, save our settings
      (setting/set :slack-token slack-token)
      ;; test failed, return response message
      {:status 500
       :body   (humanize-error-messages response body)})))

(define-routes)
