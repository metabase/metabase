(ns metabase.metabot
  "The core metabot namespace. Consists primarily of functions named infer-X,
  where X is the thing we want to extract from the bot response."
  (:require
    [metabase.lib.core :as lib]
    [metabase.lib.convert :as lib.convert]
    [metabase.metabot.inference-ws-client :as inference-ws-client]
    [metabase.metabot.precomputes :as precomputes]
    [metabase.metabot.protocols :as metabot-protocols]
    [metabase.metabot.util :as metabot-util]
    [metabase.models :as models]
    [metabase.util.log :as log]
    [toucan2.core :as t2]))

(def pre-cache (delay (precomputes/atomic-precomputes)))

(defn ^:dynamic precomputes [] @pre-cache)

(defn postprocess-dataset-query
  "Coerce the dataset query if need be to something consumable in a card.

  Specifically:
  - pMBQL/MBQLv2 needs to be converted to legacy MBQL
  - Native queries need to have template tags added to their results"
  [{:keys [dataset_query]}]
  (if (:lib/type dataset_query)
    (lib.convert/->legacy-MBQL (lib/normalize dataset_query))
    dataset_query))

(defn infer-dataset-query
  "Generate a dataset query from a prompt."
  [{:keys [model-id user-prompt]}]
  (log/infof "Generating query for prompt: %s" user-prompt)
  (let [model              (if model-id
                             (t2/select-one models/Card :id model-id)
                             (let [p             (precomputes)
                                   embeddings    (metabot-protocols/embeddings p)
                                   [{[entity-type entity-id] :object}] (metabot-util/rank-data-by-prompt user-prompt embeddings)
                                   resolved-type ({:model models/Card :card models/Card} entity-type)]
                               (t2/select-one resolved-type :id entity-id)))
        denormalized-model (dissoc (metabot-util/enrich-model model)
                                   :updated_at
                                   :created_at)]
    (-> {:user_prompt user-prompt
         :model       denormalized-model}
        inference-ws-client/call-infer-dataset-query-endpoint
        postprocess-dataset-query)))

(comment
  (require '[toucan2.core :as t2])
  (let [model-id (t2/select-one-fn :id 'Card :dataset true)]
    (infer-dataset-query
      {:model-id    model-id
       :user-prompt "How many items do I have?"}))
  )
