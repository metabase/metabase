(ns metabase.api.metabot
  (:require
    [compojure.core :refer [POST]]
    [metabase.api.common :as api]
    [metabase.metabot :as metabot]
    [metabase.metabot.feedback :as metabot-feedback]
    [metabase.metabot.util :as metabot-util]
    [metabase.models :refer [Card]]
    [metabase.util.log :as log]
    #_{:clj-kondo/ignore [:deprecated-namespace]}
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
  (let [model (api/check-404 (t2/select-one Card :id model-id :dataset true))
        _     (check-database-support (:database_id model))
        query (metabot/infer-dataset-query {:model-id model-id :user-prompt question})]
    {:card {:dataset_query          query
            :display                :table
            :visualization_settings {}}}))

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
  (let [query (metabot/infer-dataset-query {:user-prompt question})]
    {:card {:dataset_query          query
            :display                :table
            :visualization_settings {}}}))

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
  (let [query (metabot/infer-dataset-query {:user-prompt question})]
    {:card {:dataset_query          query
            :display                :table
            :visualization_settings {}}}))

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

