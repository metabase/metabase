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
  [{:keys [model user_prompt] :as context}]
  (log/infof "Metabot is inferring sql for model '%s' with prompt '%s'." (:id model) user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [{:keys [prompt_template version prompt]} (metabot-util/create-prompt context)
          {:keys [database_id inner_query]} model]
      (if-some [bot-sql (metabot-util/find-result
                         metabot-util/extract-sql
                         (metabot-client/invoke-metabot prompt))]
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
        (log/infof "No sql inferred for model '%s' with prompt '%s'." (:id model) user_prompt)))
    (log/warn "Metabot is not enabled")))

(defn infer-model
  "Find the model in the db that best matches the prompt. Return nil if no good model found."
  [{{database-id :id :keys [models]} :database :keys [user_prompt] :as context}]
  (log/infof "Metabot is inferring model for database '%s' with prompt '%s'." database-id user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [{:keys [prompt_template version prompt]} (metabot-util/create-prompt context)
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
                  (fnil conj [])
                  (format "%s:%s" prompt_template version)))
        (log/infof "No model inferred for database '%s' with prompt '%s'." database-id user_prompt)))
    (log/warn "Metabot is not enabled")))

(defn infer-sql-query
  "Given a database and user prompt, determine a sql query to answer my question."
  [{:keys [database user_prompt] :as context}]
  (log/infof "Metabot is inferring sql for database '%s' with prompt '%s'." (:id database) user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [x {:prompt_template "infer_sql",
             :version         "0001",
             :messages        [{:role    "system",
                                :content "You are a helpful assistant that writes SQL to query the database '%%DATABASE:SQL_NAME%%' using SELECT statements based on user input."}
                               {:role    "assistant",
                                :content "This is the SQL used to create the database '%%DATABASE:SQL_NAME%%'"}
                               {:role    "assistant",
                                :content "%%DATABASE:CREATE_DATABASE_DDL%%"}
                               {:role    "assistant",
                                :content "All tables in the database '%%DATABASE:SQL_NAME%%' have data in them."}
                               {:role    "assistant",
                                :content "Use this information to write a SQL query to answer my question.'"}
                               {:role    "assistant",
                                :content "Do not explain the SQL statement, just give me the raw SELECT statement."}
                               {:role "user", :content "%%USER_PROMPT%%"}]}
          x (assoc x :prompt (#'metabot-util/prompt-template->messages x context))
          {:keys [prompt_template version prompt]} x
          ;{:keys [prompt_template version prompt]} (metabot-util/create-prompt context)
          ;{:keys [database_id inner_query]} model
          ]
      (or
       (metabot-util/find-result
        metabot-util/extract-sql
        (metabot-client/invoke-metabot prompt))
       (log/infof "No sql inferred for database '%s' with prompt '%s'." (:id database) user_prompt)))
    (log/warn "Metabot is not enabled")))

