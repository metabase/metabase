(ns metabase.api.metabot
  (:require
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.metabot :as metabot]
   [metabase.metabot.feedback :as metabot-feedback]
   [metabase.metabot.util :as metabot-util]
   [metabase.models :refer [Card Database]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-database-support
  "Do a preliminary check to ensure metabot will work. Throw an exception if not."
  [database-id]
  (when-not (metabot-util/supported? database-id)
    (throw
     (let [message "Metabot is not supported for this database type."]
       (ex-info
        message
        {:status-code 400
         :message     message})))))

(defn- infer-sql-or-throw
  "An http-friendly version of infer-sql that throws a useful error if it fails to produce sql."
  [context question]
  (or
   (metabot/infer-sql context)
   (throw
    (let [message (format
                   "Query '%s' didn't produce any SQL. Perhaps try a more detailed query."
                   question)]
      (ex-info
       message
       {:status-code 400
        :message     message})))))

(defn- add-viz-to-dataset
  "Given a calling context and resulting dataset, add a more interesting visual to the card."
  [context {:keys [bot-sql] :as dataset}]
  (let [context (assoc context :sql bot-sql :prompt_task :infer_viz)
        {:keys [template prompt_template_version]} (metabot/infer-viz context)]
    (cond-> (update dataset :card merge template)
      prompt_template_version
      (update :prompt_template_versions conj prompt_template_version))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/model/:model-id"
  "Ask Metabot to generate a SQL query given a prompt about a given model."
  [model-id :as {{:keys [question]} :body}]
  ;{model-id ms/PositiveInt
  ; question string?}
  (log/infof
   "Metabot '/api/metabot/model/%s' being called with prompt: '%s'"
   model-id
   question)
  (let [model   (api/check-404 (t2/select-one Card :id model-id :dataset true))
        _       (check-database-support (:database_id model))
        context {:model       (metabot-util/denormalize-model model)
                 :user_prompt question
                 :prompt_task :infer_sql}
        dataset (infer-sql-or-throw context question)]
    (add-viz-to-dataset context dataset)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/database/:database-id"
  "Ask Metabot to generate a native question given a prompt about a given database."
  [database-id :as {{:keys [question]} :body}]
  {database-id su/IntGreaterThanZero
   question    su/NonBlankString}
  (log/infof
   "Metabot '/api/metabot/database/%s' being called with prompt: '%s'"
   database-id
   question)
  (let [{:as database} (api/check-404 (t2/select-one Database :id database-id))
        _       (check-database-support (:id database))
        context {:database    (metabot-util/denormalize-database database)
                 :user_prompt question
                 :prompt_task :infer_model}]
    (if-some [model (metabot/infer-model context)]
      (let [context (merge context {:model model :prompt_task :infer_sql})
            dataset (infer-sql-or-throw context question)]
        (add-viz-to-dataset context dataset))
      (throw
       (let [message (format
                      (str/join
                       " "
                       ["Query '%s' didn't find a good match to your data."
                        "Perhaps try a query that mentions the model name or columns more specifically."])
                      question)]
         (ex-info
          message
          {:status-code 400
           :message     message}))))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/database/:database-id/query"
  "Ask Metabot to generate a SQL query given a prompt about a given database."
  [database-id :as {{:keys [question]} :body}]
  {database-id su/IntGreaterThanZero
   question    su/NonBlankString}
  (log/infof
   "Metabot '/api/metabot/database/%s/query' being called with prompt: '%s'"
   database-id
   question)
  (let [{:as database} (api/check-404 (t2/select-one Database :id database-id))
        _       (check-database-support (:id database))
        context {:database    (metabot-util/denormalize-database database)
                 :user_prompt question
                 :prompt_task :infer_native_sql}]
    (metabot/infer-native-sql-query context)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/feedback"
  "Record feedback on metabot results."
  [:as {feedback :body}]
  (if-some [stored-feedback (metabot-feedback/submit-feedback feedback)]
    {:feedback stored-feedback
     :message  "Thanks for your feedback"}
    (throw
     (let [message "There was a problem submitting your feedback."]
       (ex-info
        message
        {:status-code 500
         :message     message})))))

(api/define-routes)
