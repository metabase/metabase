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
  ([{:keys [model user_prompt] :as context}]
   (log/infof "Metabot is inferring sql for model '%s' with prompt '%s'." (:id model) user_prompt)
   (let [{:keys [prompt_template version prompt]} (metabot-util/create-prompt context :infer_sql)
         {:keys [database_id inner_query]} model]
     (if-some [bot-sql (metabot-client/invoke-metabot prompt metabot-util/extract-sql)]
       (let [final-sql     (metabot-util/bot-sql->final-sql model bot-sql)
             _             (log/infof "Inferred sql for model '%s' with prompt '%s':\n%s"
                                      (:id model)
                                      user_prompt
                                      final-sql)
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
                                      (format "%s:%s" prompt_template version)))})
       (log/infof "No sql inferred for model '%s' with prompt '%s'." (:id model) user_prompt)))))

(defn infer-model
  "Find the model in the db that best matches the prompt. Return nil if no good model found."
  ([database question]
   (if (metabot-settings/is-metabot-enabled)
     (let [context {:database database :user_prompt question}]
       (infer-model context))
     (log/warn "Metabot is not enabled")))
  ([{{database-id :id :keys [models]} :database :keys [user_prompt] :as context}]
   (log/infof "Metabot is inferring model for database '%s' with prompt '%s'." database-id user_prompt)
   (let [{:keys [prompt_template version prompt]} (metabot-util/create-prompt context :infer_model)
         ids->models   (zipmap (map :id models) models)
         candidates    (set (keys ids->models))
         best-model-id (metabot-client/invoke-metabot
                        prompt
                        (fn [message]
                          (some->> message
                                   (re-seq #"\d+")
                                   (map parse-long)
                                   (some candidates))))]
     (if-some [model (ids->models best-model-id)]
       (do
         (log/infof "Metabot selected best model for database '%s' with prompt '%s' as '%s'."
                    database-id user_prompt best-model-id)
         (update model
                 :prompt_template_versions
                 (fnil conj [])
                 (format "%s:%s" prompt_template version)))
       (log/infof "No model inferred for database '%s' with prompt '%s'." database-id user_prompt)))))

