(ns metabase.metabot.standalone
  (:require [clj-http.client :as http]
            [clojure.core.memoize :as memoize]
            [clojure.data.json :as json]
            [clojure.string :as str]
            [metabase.models :refer [Card] :as models]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(defn model->context
  "Convert a model to a 'context', the representation used to tell the LLM
  about what is stored in the model.

  The context contains the table name and id as well as field names and ids.
  This is what the LLMs are currently trained on, so modifying this context
  will likely require retraining as well. We probably _should_ remove ids since
  they add no value when we replace them in the prompts and we should add model
  descriptions for fields."
  [{model-name :name model-id :id :keys [result_metadata]}]
  {:table_name model-name
   :table_id   model-id
   :fields     (for [{field-id :id field-name :display_name field_type :base_type} result_metadata]
                 {:field_id field-id :field_name field-name :field_type field_type})})

(defn model->summary
  "Create a summary description appropriate for embedding.

  The embeddings created here will be compared to the embedding for the prompt
  and the closest match(es) will be used for inferencing. This summary should
  contain terms that relate well to the user prompt. The summary should be
  word-oriented rather than data oriented (provide a sentence, not json) as the
  comparison will be sentence to sentence."
  [{model-name :name model-description :description :keys [result_metadata]}]
  (let [fields-str (str/join "," (map :display_name result_metadata))]
    (if (seq model-description)
      (format "%s: %s: %s" model-name model-description fields-str)
      (format "%s: %s" model-name fields-str))))

;; TODO - Move to metabase.metabot.settings once we've settled on all the right values
(def base-url "http://ec2-35-91-13-182.us-west-2.compute.amazonaws.com:5000")

(defn token-count
  "Return the token count for a given string.

  Token count is dependent on the tokenizer used in the backing service, but is
   often some variant of what GPT uses. This function can be used to precompute
   prompt, context, or other strings used in inference to ensure token budgets
  are not exceeded."
  [input-string]
  (let [request {:method       :post
                 :url          (format "%s/tokenCount" base-url)
                 :body         (json/write-str {:input input-string})
                 :as           :json
                 :content-type :json}
        {:keys [body status]} (http/request request)]
    (when (= 200 status)
      (:token_count body))))

(defn embeddings
  "Convert the input string to an embedding vector (a vector of floats).

  Embeddings can be precomputed for all dataset (e.g. model, table) candidates
  to be searched for downselection for final inferencing."
  [input-string]
  (let [request {:method       :post
                 :url          (format "%s/embed" base-url)
                 :body         (json/write-str {:input input-string})
                 :as           :json
                 :content-type :json}
        {:keys [body status]} (http/request request)]
    (when (= 200 status)
      (:embeddings body))))

(defn bulk-embeddings
  "Convert the input map of {obj-str encoding} to a map of {obj-str embedding (a vector of floats)}."
  [obj-strs->encodings]
  (let [request {:method       :post
                 :url          (format "%s/bulkEmbed" base-url)
                 :body         (json/write-str {:input obj-strs->encodings})
                 :content-type :json}
        {:keys [body status]} (http/request request)]
    (when (= 200 status)
      (get (json/read-str body) "embeddings"))))

(defn infer
  "Infer LLM output from a provided prompt and context.

  The prompt is the user prompt and the context is a machine-generated
  description of the data to be used when performing inferencing. Ideally, this
  data will be a single dataset (model or table), but multiple datasets can be
  provided. In this latter case, the expectation is that the LLM will know how
  to select the best single dataset if it doesn't know how to do joins or that
  it will select and join as desired from the provided datasets to provide the
  final answer."
  [{:keys [prompt context]}]
  {:pre [prompt context]}
  (let [request {:method       :post
                 :url          (format "%s/infer" base-url)
                 :body         (json/write-str {:prompt prompt :context context})
                 :as           :json
                 :content-type :json}
        {:keys [body status]} (http/request request)]
    (when (= 200 status)
      (:llm_generated body))))

(defn rank-data-by-prompt
  "Return the ranked datasets by the provided prompt.

  The prompt is a string and the datasets are a map of any set of keyed objects
   to the embedding representing this dataset. Note that values need not be a
   direct embedding of the keys. The keys can be anything and should be the
   desired output type to be used when doing rank selection on the dataset."
  ([prompt dataset->embeddings]
   (letfn [(dot [u v] (reduce + (map * u v)))]
     (let [prompt-embedding (embeddings prompt)]
       (->> dataset->embeddings
            (map (fn [[k e]] {:object k :cosine-similarity (dot prompt-embedding e)}))
            (sort-by (comp - :cosine-similarity))))))
  ([prompt dataset->embeddings top-n]
   (take top-n (rank-data-by-prompt prompt dataset->embeddings))))

(defn model->precomputes
  "From a model, compute the items we will use when doing inferencing.

  These values are all candidates for precomputing and storage as they will
  only change when the model changes."
  [model]
  (let [context       (model->context model)
        compa-summary (model->summary model)
        embeddings    (embeddings compa-summary)
        token-count   (token-count (json/write-str context))]
    {:context       context
     :compa-summary compa-summary
     :embeddings    embeddings
     :token-count   token-count}))


(def ^:private memoized-model->precomputes
  "Memoize `model->precomputes` as this data rarely changes. Ultimately, we are
  going to want to store all of this in the app db."
  (memoize/ttl
    ^{::memoize/args-fn (fn [{:keys [id database_id]}] [id database_id])}
    (fn [model]
      (try
        (model->precomputes model)
        (catch Exception _
          (log/warn "Unable to get model precomputes")
          [])))
    ;; 1 hour
    :ttl/threshold (* 1000 60 60)))

(defn infer-il
  "Produce inferred il/or from a set of models to choose from, a prompt, and
  number of desired models to include in the context.

  Currently, uses a ttl cache of 1 hour to store precomputed results:
  - model context
  - summary used to generate embeddings
  - embeddings
  - token count"
  [models prompt top-n]
  (let [models+         (map
                          (fn [model]
                            (let [precomputes (memoized-model->precomputes model)]
                              (assoc model :precomputes precomputes)))
                          models)
        context         (->> (zipmap models+ (map (comp :embeddings :precomputes) models+))
                             (rank-data-by-prompt prompt)
                             (take top-n)
                             (map (comp :context :precomputes :object)))
        inference-input {:prompt  prompt
                         :context context}]
    (infer inference-input)))

(comment
  ;; Basic API functions:
  ;; How many tokens in this string?
  (token-count "This is a test")
  ;; What is the embedding vector for this string?
  (embeddings "This is a test")
  ;; What is the embedding vector for this string?
  (bulk-embeddings {"This is a test" "The encoded version of this is a test"})

  ;; This will create a context of ALL models in db 1. For any nontrivial
  ;; database this will produce context that is far too large.
  (let [prompt  "Show me orders where tax is greater than 0"
        context (->> (t2/select Card :database_id 1 :dataset true)
                     (map model->context))]
    (infer {:prompt  prompt
            :context context}))

  ;; This creates a context of only a single model. Note that the context shape
  ;; is still a seq of contexts, but with only a single element
  (let [prompt  "Show me orders where tax is greater than 0"
        context (->> (t2/select-one Card :database_id 1 :dataset true)
                     model->context
                     vector)]
    (infer {:prompt  prompt
            :context context}))

  ;; To get around the above limitations (a mega-context or knowing up front
  ;; what model to encode), we are going to use embeddings. In this trivial
  ;; example we are going to show how you can provide a map of keys to
  ;; embeddings and return the ranked keys along with cosine similarity in
  ;; embedding space. You can return all keys or just the top N.
  (let [prompt  "This is a test of the emergency broadcasting system"
        samples ["This is a test of EBS"
                 "This is a test of the EBS (Emergency Broadcasting System)"
                 "In an emergency, seek shelter"
                 "The emergency broadcasting system is a public service"
                 "The emergency broadcasting system is being tested"
                 "The disaster radio thing is being checked out"
                 "System of a Down is on the radio"
                 "I like turtles"
                 "Do you like green eggs and ham"]]
    (rank-data-by-prompt prompt (zipmap samples (map embeddings samples)))
    (rank-data-by-prompt prompt (zipmap samples (map embeddings samples)) 3))

  ;; IRL you'd want to create a map of thing to choose (a model, potentially
  ;; with precomputed values) to embeddings for those things to choose.
  ;; Once you've chosen the N best things, you can create a context with that
  ;; selected subset and then do inferencing.
  (let [prompt          "Show me orders where tax is greater than 0"
        top-n           1
        models          (t2/select Card :database_id 1 :dataset true)
        models+         (map
                          (fn [model]
                            (let [precomputes (model->precomputes model)]
                              (assoc model :precomputes precomputes)))
                          models)
        ranked-models   (->> (zipmap models+ (map (comp :embeddings :precomputes) models+))
                             (rank-data-by-prompt prompt)
                             (take top-n))
        context         (map (comp :context :precomputes :object) ranked-models)
        inference-input {:prompt  prompt
                         :context context}]
    (infer inference-input))

  ;; Bring it all together.
  (let [prompt "Show me orders where tax is greater than 0"
        top-n  1
        models (t2/select Card :database_id 1 :dataset true)]
    (infer-il models prompt top-n))
  )