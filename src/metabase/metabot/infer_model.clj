(ns metabase.metabot.infer-model
  (:require [metabase.metabot.client :as metabot-client]
            [metabase.metabot.util :as metabot-util]
            [metabase.util.log :as log]))

(defn- find-table-id [message candidates]
  (when message
    (let [discovered (map parse-long (re-seq #"\d+" message))]
      (first (filter candidates discovered)))))

(def template
  (delay
   (->> (group-by (comp keyword :prompt_template) @metabot-util/prompt-templates)
        :infer_model
        (apply max-key :version))))

(defn infer-model
  "Find the model in the db that best matches the prompt. Return nil if no good model found."
  [{{:keys [models]} :database :as context}]
  (let [{:keys [version model_type] :as template} @template
        _             (log/infof "Generating SQL from prompt template: '%s:%s'" model_type version)
        messages      (metabot-util/prompt-template->messages template context)
        best-model-id (metabot-client/invoke-metabot
                       messages
                       #(find-table-id % (set (map :id models))))]
    (some (fn [{model-id :id :as model}] (when (= model-id best-model-id) model)) models)))
