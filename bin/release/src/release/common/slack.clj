(ns release.common.slack
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [environ.core :as env]
            [metabuild-common.core :as u]))

(defn post-message!
  "Posts a message to the Slack a channel using `SLACK_WEBHOOK_URL`. If `NO_SLACK` is set, this is a no-op."
  ([format-string & args]
   (post-message! (apply format format-string args)))

  ([msg]
   (when-not (env/env :no-slack)
     (let [slack-webhook-url (u/env-or-throw :slack-webhook-url)
           body              (json/generate-string {:text (str msg)})]
       (http/post slack-webhook-url {:headers {"Content-Type" "application/json"}
                                     :body    body})
       :ok))))
