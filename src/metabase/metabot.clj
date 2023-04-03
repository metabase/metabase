(ns metabase.metabot
  "The core metabot namespace. Consists primarily of functions named infer-X,
  where X is the thing we want to extract from the bot response."
  (:require
   [metabase.lib.native :as lib-native]
   [metabase.metabot.client :as metabot-client]
   [metabase.metabot.settings :as metabot-settings]
   [metabase.metabot.util :as metabot-util]
   [metabase.util.log :as log]))

(defn infer-sql
  "Given a model and prompt, attempt to generate a native dataset."
  ([model question]
   (if (metabot-settings/is-metabot-enabled)
     (let [context {:model model :user_prompt question}]
       (infer-sql context))
     (log/warn "Metabot is not enabled")))
  ([{:keys [model] :as context}]
   (log/debug "Metabot is inferring sql.")
   (let [{:keys [prompt_template version prompt]} (metabot-util/create-prompt context :infer_sql)
         {:keys [database_id inner_query]} model]
     (when-some [bot-sql (metabot-client/invoke-metabot prompt metabot-util/extract-sql)]
       (let [final-sql     (metabot-util/bot-sql->final-sql model bot-sql)
             template-tags (lib-native/template-tags inner_query)
             dataset       {:dataset_query          {:database database_id
                                                     :type     "native"
                                                     :native   {:query         final-sql
                                                                :template-tags template-tags}}
                            :display                :table
                            :visualization_settings {}}]
         {:card                     dataset
          :prompt_template_versions (vec
                                     (conj
                                      (:prompt_template_versions model)
                                      (format "%s:%s" prompt_template version)))})))))

(defn infer-model
  "Find the model in the db that best matches the prompt. Return nil if no good model found."
  ([database question]
   (if (metabot-settings/is-metabot-enabled)
     (let [context {:database database :user_prompt question}]
       (infer-model context))
     (log/warn "Metabot is not enabled")))
  ([{{:keys [models]} :database :as context}]
   (let [{:keys [prompt_template version prompt]} (metabot-util/create-prompt context :infer_model)
         ids->models (zipmap (map :id models) models)
         candidates (set (keys ids->models))
         best-model-id (metabot-client/invoke-metabot
                        prompt
                        (fn [message]
                          (some->> message
                                   (re-seq #"\d+")
                                   (map parse-long)
                                   (some candidates))))]
     (when-some [model (ids->models best-model-id)]
       (update model
               :prompt_template_versions
               (fnil conj [])
               (format "%s:%s" prompt_template version))))))

