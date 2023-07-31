(ns metabase.metabot.mbql-inference
  (:require
    [metabase.metabot.precomputes :as precomputes]
    [metabase.metabot.task-api :as task-api]
    [metabase.models :as models]
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
    (let [prompt-embedding (task-api/single embedder prompt)]
      (->> dataset->embeddings
           (map (fn [[k e]] {:object k :cosine-similarity (dot prompt-embedding e)}))
           (sort-by (comp - :cosine-similarity))))))

(defn simplified-model [entity-refs]
  (for [[entity-type entity-id] entity-refs
        :let [resolved-type ({:model models/Card :card models/Card} entity-type)
              entity        (t2/select-one resolved-type :id entity-id)]]
    (-> entity
        (select-keys [:name
                      :id
                      :description
                      :database_id
                      :result_metadata])
        (update :result_metadata
                (fn [rsmd]
                  (mapv
                    (fn [entry]
                      (select-keys entry
                                   [:name
                                    :display_name
                                    :description
                                    :field_ref
                                    :base_type
                                    :effective_type]))
                    rsmd))))))

(defn infer-mbql
  "Generate mbql from a prompt."
  [{:keys [embedder inferencer context-generator]} prompt]
  (let [p                         (precomputes)
        embeddings                (precomputes/embeddings p)
        [{:keys [object]}] (rank-data-by-prompt embedder prompt embeddings)
        context                   (task-api/context context-generator {:prompt prompt :context-entities [object]})
        models (simplified-model [object])]
    (task-api/infer-mbql inferencer {:prompt  prompt
                                     :context context
                                     :models  models})))

(comment
  (require '[metabase.metabot.inference-ws.task-impl :as inference-ws-task-impl])
  (let [base-url          "http://localhost:4000"
        inferencer        (inference-ws-task-impl/inference-ws-mbql-inferencer base-url)
        embedder          (inference-ws-task-impl/inference-ws-embedder base-url)
        context-generator (inference-ws-task-impl/inference-ws-context-generator)]
    (infer-mbql
      {:embedder          embedder
       :inferencer        inferencer
       :context-generator context-generator}
      "Show data where tax is greater than zero"))

  (require '[metabase.metabot.openai.task-impl :as openai-task-impl])
  (let [inferencer        openai-task-impl/openai-mbql-inferencer
        context-generator openai-task-impl/openai-infer-mbql-context-generator
        base-url          "http://localhost:4000"
        embedder          (inference-ws-task-impl/inference-ws-embedder base-url)]
    (infer-mbql
      {:embedder          embedder
       :inferencer        inferencer
       :context-generator context-generator}
      "Show data where tax is greater than zero")))
