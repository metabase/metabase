(ns metabase.metabot.infer-dataset-query
  (:require
    [clojure.data.json :as json]
    [metabase.lib.convert :as lib.convert]
    [metabase.lib.core :as lib]
    [metabase.lib.native :as lib-native]
    [metabase.metabot.inference-ws-client :as inference-ws-client]
    [metabase.metabot.precomputes :as precomputes]
    [metabase.metabot.protocols :as metabot-protocols]
    [metabase.metabot.util :as metabot-util]
    [metabase.models :as models]
    [metabase.util.log :as log]
    [toucan2.core :as t2]))

(def pre-cache (delay (precomputes/atomic-precomputes)))

(defn ^:dynamic precomputes [] @pre-cache)

(defn rank-data-by-prompt
  "Return the ranked datasets by the provided prompt.

  The prompt is a string and the datasets are a map of any set of keyed objects
   to the embedding representing this dataset. Note that values need not be a
   direct embedding of the keys. The keys can be anything and should be the
   desired output type to be used when doing rank selection on the dataset."
  [embedder prompt dataset->embeddings]
  (letfn [(dot [u v] (reduce + (map * u v)))]
    (let [prompt-embedding (metabot-protocols/single embedder prompt)]
      (->> dataset->embeddings
           (map (fn [[k e]] {:object k :cosine-similarity (dot prompt-embedding e)}))
           (sort-by (comp - :cosine-similarity))))))

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
  [{:keys [model-id embedder]} user-prompt]
  (log/infof "Generating query for prompt: %s" user-prompt)
  (let [model              (if model-id
                             (t2/select-one models/Card :id model-id)
                             (let [p             (precomputes)
                                   embeddings    (metabot-protocols/embeddings p)
                                   [{[entity-type entity-id] :object}] (rank-data-by-prompt embedder user-prompt embeddings)
                                   resolved-type ({:model models/Card :card models/Card} entity-type)]
                               (t2/select-one resolved-type :id entity-id)))
        denormalized-model (dissoc (metabot-util/enrich-model model)
                                   :updated_at
                                   :created_at)]
    (-> {:user_prompt user-prompt
         :model       denormalized-model}
        inference-ws-client/infer-dataset-query
        postprocess-dataset-query)))

(comment

  (require '[clojure.data.json :as json])
  (let [[entity-type entity-id] [:card 1]
        resolved-type      ({:model models/Card :card models/Card} entity-type)
        model              (t2/select-one resolved-type :id entity-id)
        denormalized-model (metabot-util/enrich-model model)]
    (-> denormalized-model
        (dissoc :updated_at :created_at)
        json/write-str
        (json/read-str :key-fn keyword)))

  (require '[metabase.metabot.inference-ws.task-impl :as task-impl])
  (let [base-url "http://localhost:4000"
        embedder (task-impl/inference-ws-embedder base-url)]
    (infer-dataset-query
      {:embedder embedder}
      "Show data where tax is greater than zero"))
  )
