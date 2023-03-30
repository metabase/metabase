(ns metabase.api.metabot
  (:require
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.metabot :as metabot]
   [metabase.metabot.util :as metabot-util]
   [metabase.models :refer [Card Collection Database Field FieldValues Table]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/model/:model-id"
  "Ask Metabot to generate a SQL query given a prompt about a given model."
  [model-id :as {{:keys [question] :as body} :body}]
  ;{model-id ms/PositiveInt
  ; question string?}
  (tap> {:model-id model-id
         :request  body})
  (log/infof
   "Metabot '/api/metabot/model/%s' being called with prompt: '%s'"
   model-id
   question)
  (let [model          (api/check-404 (t2/select-one Card :id model-id :dataset true))
        model-metadata (metabot-util/denormalize-model model)]
    (or
     (metabot/infer-sql model-metadata question)
     (throw
      (let [message (format
                     "Query '%s' didn't produce any SQL. Perhaps try a more detailed query."
                     question)]
        (ex-info
         message
         {:status-code 400
          :message     message}))))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/database/:database-id"
  "Ask Metabot to generate a SQL query given a prompt about a given database."
  [database-id :as {{:keys [question] :as body} :body}]
  {database-id su/IntGreaterThanZero
   question    su/NonBlankString}
  (tap> {:database-id database-id
         :request     body})
  (log/infof
   "Metabot '/api/metabot/database/%s' being called with prompt: '%s'"
   database-id
   question)
  (let [{:as database} (api/check-404 (t2/select-one Database :id database-id))
        denormalized-database (metabot-util/denormalize-database database)]
    (if-some [model (metabot/infer-model denormalized-database question)]
      (metabot/infer-sql model question)
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
(api/defendpoint-schema POST "/feedback"
  "Record feedback on metabot results."
  [:as {feedback :body}]
  (let [feedback-keys [:correct_sql :feedback :prompt :prompt_template_versions :sql]]
    (tap> (select-keys feedback feedback-keys))
    (snowplow/track-event!
     ::snowplow/metabot-feedback-received api/*current-user-id*
     (select-keys feedback feedback-keys))
    {:message "Thanks for your feedback"}))

(api/define-routes)
