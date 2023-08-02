(ns metabase.metabot
  "The core metabot namespace. Consists primarily of functions named infer-X,
  where X is the thing we want to extract from the bot response."
  (:require
    [metabase.metabot.infer-dataset-query :as idq]))

(defn infer-dataset-query [{:keys [embedder model-id] :as calling-context} user_prompt]
  {:pre [(or model-id embedder) user_prompt]}
  (idq/infer-dataset-query calling-context user_prompt))
