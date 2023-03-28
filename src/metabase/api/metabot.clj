(ns metabase.api.metabot
  (:require
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.metabot :as metabot]
   [metabase.metabot.util :as metabot-util]
   [metabase.models :refer [Card Collection Database Field FieldValues Table]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;#_{:clj-kondo/ignore [:deprecated-var]}
;(api/defendpoint-schema POST "/webhook"
;  "Ask Metabot to generate a SQL query given a prompt about a given model."
;  [body]
;  ;{model-id ms/PositiveInt
;  ; question string?}
;  (let [b (json/parse-string body true)]
;    (tap> {:b b})
;    b))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/model/:model-id"
  "Ask Metabot to generate a SQL query given a prompt about a given model."
  [model-id :as {{:keys [question] :as body} :body}]
  ;{model-id ms/PositiveInt
  ; question string?}
  (tap> {:model-id model-id
         :request  body})
  (let [model (api/check-404 (t2/select-one Card :id model-id :dataset true))
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
  ;{database-id ms/PositiveInt
  ; question string?}
  (tap> {:database-id database-id
         :request     body})
  (let [{:as database} (api/check-404 (t2/select-one Database :id database-id))
        denormalized-database        (metabot-util/denormalize-database database)]
    (if-some [model (metabot/infer-model denormalized-database question)]
      (metabot/infer-sql model question)
      (throw
       (let [message (format
                      (str/join
                       " "
                       ["Query '%s' didn't find a good match to your data."
                        "Perhaps try a query that mentions the model name or columns more specificially."])
                      question)]
         (ex-info
          message
          {:status-code 400
           :message     message}))))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/feedback"
  "Ask Metabot to generate a SQL query given a prompt about a given database."
  [database-id :as {{:keys [prompt sql feedback correct_sql] :as body} :body}]
  ;{database-id ms/PositiveInt
  ; question string?}
  ;;great | wrong-data | incorrect-result | invalid-sql
  (tap> {:feedback body})
  {:message "Thanks for your feedback"})

(api/define-routes)
