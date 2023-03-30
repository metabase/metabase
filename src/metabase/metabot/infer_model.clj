(ns metabase.metabot.infer-model
  (:require [metabase.metabot.client :as metabot-client]
            [metabase.metabot.util :as metabot-util]
            [metabase.util.log :as log]))

(defn- find-table-id [message candidates]
  (when message
    (let [discovered (map parse-long (re-seq #"\d+" message))]
      (first (filter candidates discovered)))))

(defn infer-model
  "Find the model in the db that best matches the prompt. Return nil if no good model found."
  [{{:keys [models]} :database :as context}]
  (let [{:keys [version prompt_template] :as template} (metabot-util/prompt-template :infer_model)
        _             (log/infof "Generating SQL from prompt template: '%s:%s'" prompt_template version)
        messages      (metabot-util/prompt-template->messages template context)
        best-model-id (metabot-client/invoke-metabot
                       messages
                       #(find-table-id % (set (map :id models))))]
    (when-some [model (some (fn [{model-id :id :as model}] (when (= model-id best-model-id) model)) models)]
      (update model :prompt_template_versions (fnil conj []) (format "%s:%s" prompt_template version)))))
