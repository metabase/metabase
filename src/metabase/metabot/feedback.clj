(ns metabase.metabot.feedback
  (:require [cheshire.core :as json]
            [clj-http.client :as client]
            [metabase.analytics.snowplow :as snowplow]
            [metabase.api.common :as api]
            [metabase.metabot.settings :as metabot-settings]))

(def snowplow-keys [:entity_type :prompt_template_versions :feedback_type])
(def feedback-keys (into snowplow-keys [:prompt :sql]))

(defn store-detailed-feedback [feedback]
  (let [feedback (select-keys feedback feedback-keys)
        {:keys [status body]} (client/request
                               {:url              (metabot-settings/metabot-feedback-url)
                                :method           :post
                                :body             (json/generate-string
                                                   feedback
                                                   {:pretty true})
                                :throw-exceptions false
                                :as               :json
                                :accept           :json
                                :content-type     :json})]
    (when (= 200 status) body)))

(defn submit-feedback [feedback]
  (let [snowplow-feedback (select-keys feedback snowplow-keys)]
    (snowplow/track-event!
     ::snowplow/metabot-feedback-received api/*current-user-id*
     snowplow-feedback)
    (store-detailed-feedback feedback)))

(comment
  (store-detailed-feedback {:prompt "FESFSFSFse"}))
