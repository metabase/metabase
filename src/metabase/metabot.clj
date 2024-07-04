(ns metabase.metabot
  "The core metabot namespace. Consists primarily of functions named infer-X,
  where X is the thing we want to extract from the bot response."
  (:require
   [cheshire.core :as json]
   [metabase.lib.native :as lib-native]
   [metabase.metabot.client :as metabot-client]
   [metabase.metabot.feedback :as metabot-feedback]
   [metabase.metabot.settings :as metabot-settings]
   [metabase.metabot.util :as metabot-util]
   [metabase.models :refer [Table]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [potemkin :as p]
   [toucan2.core :as t2]))

(comment metabot-feedback/keep-me
         metabot-util/keep-me)

(p/import-vars
 [metabot-feedback
  submit-feedback]
 [metabot-util
  denormalize-database
  denormalize-model
  supported?])

(defn infer-viz
  "Determine an 'interesting' visualization for this data."
  [{sql :sql :as context}]
  (log/infof "Metabot is inferring visualization for sql '%s'." sql)
  (if (metabot-settings/is-metabot-enabled)
    (if (metabot-util/select-all? sql)
      ;; A SELECT * query just short-circuits to a tabular display
      {:template {:display                :table
                  :visualization_settings {}}}
      ;; More interesting SQL merits a more interesting display
      (let [{:keys [prompt_template version] :as prompt} (metabot-util/create-prompt context)]
        {:template                (metabot-util/find-result
                                   (fn [message]
                                     (metabot-util/response->viz
                                      (json/parse-string message keyword)))
                                   (metabot-client/invoke-metabot prompt))
         :prompt_template_version (format "%s:%s" prompt_template version)}))
    (log/warn "Metabot is not enabled")))

(defn infer-sql
  "Given a model and prompt, attempt to generate a native dataset."
  [{:keys [model user_prompt] :as context}]
  (log/infof "Metabot is inferring sql for model '%s' with prompt '%s'." (:id model) user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [{:keys [prompt_template version] :as prompt} (metabot-util/create-prompt context)
          {:keys [database_id inner_query]} model]
      (if-some [bot-sql (metabot-util/find-result
                         metabot-util/extract-sql
                         (metabot-client/invoke-metabot prompt))]
        (let [final-sql     (metabot-util/bot-sql->final-sql model bot-sql)
              _             (log/infof "Inferred sql for model '%s' with prompt '%s':\n%s"
                                       (:id model)
                                       user_prompt
                                       final-sql)
              template-tags (lib-native/extract-template-tags inner_query)
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
                                       (format "%s:%s" prompt_template version)))
           :bot-sql                  bot-sql})
        (log/infof "No sql inferred for model '%s' with prompt '%s'." (:id model) user_prompt)))
    (log/warn "Metabot is not enabled")))

(defn match-best-model
  "Find the model in the db that best matches the prompt using embedding matching."
  [{{database-id :id :keys [models]} :database :keys [user_prompt]}]
  (log/infof "Metabot is inferring model for database '%s' with prompt '%s'." database-id user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [models (->> models
                      (map (fn [{:keys [create_table_ddl] :as model}]
                             (let [{:keys [prompt embedding tokens]} (metabot-client/create-embedding create_table_ddl)]
                               (assoc model
                                      :prompt prompt
                                      :embedding embedding
                                      :tokens tokens)))))]
      (if-some [{best-mode-name :name
                 best-model-id  :id
                 :as            model} (metabot-util/best-prompt-object models user_prompt)]
        (do
          (log/infof "Metabot selected best model for database '%s' with prompt '%s' as '%s' (%s)."
                     database-id user_prompt best-model-id best-mode-name)
          model)
        (log/infof "No model inferred for database '%s' with prompt '%s'." database-id user_prompt)))
    (log/warn "Metabot is not enabled")))

(defn infer-model
  "Find the model in the db that best matches the prompt. Return nil if no good model found."
  [{{database-id :id :keys [models]} :database :keys [user_prompt] :as context}]
  (log/infof "Metabot is inferring model for database '%s' with prompt '%s'." database-id user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [{:keys [prompt_template version] :as prompt} (metabot-util/create-prompt context)
          ids->models   (zipmap (map :id models) models)
          candidates    (set (keys ids->models))
          best-model-id (metabot-util/find-result
                         (fn [message]
                           (some->> message
                                    (re-seq #"\d+")
                                    (map parse-long)
                                    (some candidates)))
                         (metabot-client/invoke-metabot prompt))]
      (if-some [model (ids->models best-model-id)]
        (do
          (log/infof "Metabot selected best model for database '%s' with prompt '%s' as '%s'."
                     database-id user_prompt best-model-id)
          (update model
                  :prompt_template_versions
                  u/conjv
                  (format "%s:%s" prompt_template version)))
        (log/infof "No model inferred for database '%s' with prompt '%s'." database-id user_prompt)))
    (log/warn "Metabot is not enabled")))

(defn infer-native-sql-query
  "Given a database and user prompt, determine a sql query to answer my question."
  [{{database-id :id} :database
    :keys             [user_prompt prompt_template_versions] :as context}]
  (log/infof "Metabot is inferring sql for database '%s' with prompt '%s'." database-id user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [prompt-objects (->> (t2/select [Table :name :schema :id] :db_id database-id)
                              (map metabot-util/memoized-create-table-embedding)
                              (filter identity))
          ddl            (metabot-util/generate-prompt prompt-objects user_prompt)
          context        (assoc-in context [:database :create_database_ddl] ddl)
          {:keys [prompt_template version] :as prompt} (metabot-util/create-prompt context)]
      (if-some [sql (metabot-util/find-result
                     metabot-util/extract-sql
                     (metabot-client/invoke-metabot prompt))]
        {:sql                      sql
         :prompt_template_versions (conj
                                    (vec prompt_template_versions)
                                    (format "%s:%s" prompt_template version))}
        (log/infof "No sql inferred for database '%s' with prompt '%s'." database-id user_prompt)))
    (log/warn "Metabot is not enabled")))
