(ns metabase.api.metabot
  (:require
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.models.persisted-info :as persisted-info]
   ;[metabase.query-processor :as qp]
   ;[metabase.query-processor.middleware.permissions :as qp.perms]
   [wkok.openai-clojure.api :as openai.api]
   ))

(set! *warn-on-reflection* true)

(def bot-directions
  (str "You are a helpful assistant that writes SQL based on my input."
       "Don't explain your answer, just show me the SQL."))

(defn model-description [model-id]
  ;; TODO - Create natural language description of a model here using field_vals, etc.
  (str "I have a table with columns created_at, user_id, and status and the column \"status\""
       "has valid values of \"open\", \"closed\", \"blocked\""))

(defn write-sql [model-id prompt]
  (openai.api/create-chat-completion
   {:model    "gpt-3.5-turbo"
    :messages [{:role "system" :content bot-directions}
               {:role "assistant" :content (model-description model-id)}
               {:role "user" :content prompt}]}))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/model"
  "Fetch a native version of an MBQL query."
  [:as {{:keys [database model source-table question] :as x} :body}]
  (tap> x)
  (binding [persisted-info/*allow-persisted-substitution* false]
    ;(qp.perms/check-current-user-has-adhoc-native-query-perms query)
    (let [response {:sql_query               (if (and
                                                  (System/getenv "OPENAI_API_KEY")
                                                  (System/getenv "OPENAI_ORGANIZATION"))
                                               (->> (:choices (write-sql 0 question)) first :message :content)
                                               "Set OPENAI_API_KEY and OPENAI_ORGANIZATION env vars and relaunch!")
                    :original_question       question
                    :suggested_visualization [:pie_chart]}]
      (tap> response)
      response)))

(api/define-routes)
