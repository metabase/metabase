(ns metabase.metabot.mbql-inference
  (:require
   [metabase.metabot.inference-ws-client :as inference-ws-client]
   [metabase.metabot.precomputes :as precomputes]
   [metabase.metabot.settings :as metabot-settings]))

(def pre-cache (delay (precomputes/atomic-precomputes)))

(defn ^:dynamic precomputes [] @pre-cache)

(defn rank-data-by-prompt
  "Return the ranked datasets by the provided prompt.

  The prompt is a string and the datasets are a map of any set of keyed objects
   to the embedding representing this dataset. Note that values need not be a
   direct embedding of the keys. The keys can be anything and should be the
   desired output type to be used when doing rank selection on the dataset."
  ([endpoint prompt dataset->embeddings]
   (letfn [(dot [u v] (reduce + (map * u v)))]
     (let [prompt-embedding (get (inference-ws-client/bulk-embeddings endpoint {prompt prompt}) prompt)]
       (->> dataset->embeddings
            (map (fn [[k e]] {:object k :cosine-similarity (dot prompt-embedding e)}))
            (sort-by (comp - :cosine-similarity))))))
  ([endpoint prompt dataset->embeddings top-n]
   (take top-n (rank-data-by-prompt endpoint prompt dataset->embeddings))))

(defn infer-mbql
  "Generate mbql from a prompt."
  ([base-url prompt]
   (let [p          (precomputes)
         embeddings (precomputes/embeddings p)
         [{:keys [object]}] (rank-data-by-prompt base-url prompt embeddings 1)
         context    (apply precomputes/context p object)]
     (inference-ws-client/infer base-url
                                {:prompt  prompt
                                 :context [context]})))
  ([prompt]
   (infer-mbql (metabot-settings/metabot-inference-ws-url) prompt)))

(comment
  (infer-mbql
   "http://localhost:4000"
   "Show data where tax is greater than zero"))
