(ns metabase.metabot.openai.task-impl
  (:require
    [metabase.metabot.openai.client :as metabot-client]
    [metabase.metabot.openai.infer-mbql :as infer-mbql]
    [metabase.metabot.task-api :as task-api]
    [metabase.metabot.util :as metabot-util]
    [metabase.models :as models]
    [toucan2.core :as t2]))

(def openai-infer-mbql-context-generator
  (reify task-api/ContextGenerator
    (context [_ {:keys [context-entities prompt]}]
      (let [[[_ id]] context-entities
            model (t2/select-one models/Card :id id)]
        {:model       (update model :result_metadata #(mapv metabot-util/add-field-values %))
         :schema      (infer-mbql/schema model)
         :user_prompt prompt}))))

(def openai-mbql-inferencer
  (reify task-api/MBQLInferencer
    (infer-mbql [_ {:keys [context]}]
      (let [mbql (-> context
                     infer-mbql/generate-prompt
                     metabot-client/invoke-metabot
                     infer-mbql/parse-result)]
        {:mbql (dissoc mbql :llm/usage)}))))