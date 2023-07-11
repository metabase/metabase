(ns metabase.metabot.standalone
  (:require [clj-http.client :as http]
            [clojure.data.json :as json]
            [clojure.math :as math]
            [clojure.string :as str]
            [metabase.models :refer [Card] :as models]
            [toucan2.core :as t2]))

(defn dot [u v]
  (reduce + (map * u v)))

(defn mag [u]
  (math/sqrt (dot u u)))

(defn unitize [u]
  (let [m (mag u)]
    (mapv #(/ % m) u)))

(defn model->context [{model-name :name model-id :id :keys [result_metadata]}]
  {:table_name model-name
   :table_id   model-id
   :fields     (for [{field-id :id field-name :display_name field_type :base_type} result_metadata]
                 {:field_id field-id :field_name field-name :field_type field_type})})

(defn model->summary [{model-name :name model-description :description :keys [result_metadata]}]
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

(defn infer [{:keys [prompt context]}]
  {:pre [prompt context]}
  (let [request {:method       :post
                 :url          (format "%s/infer" base-url)
                 :body         (json/write-str {:prompt prompt :context context})
                 :as           :json
                 :content-type :json}
        {:keys [body status]} (http/request request)]
    (when (= 200 status)
      (:llm_generated body))))

(defn closest
  "Return the ranked datasets"
  [prompt dataset->embeddings]
  (let [prompt-embedding (embeddings prompt)]
    (->> dataset->embeddings
         (map (fn [[k e]] [k (dot prompt-embedding e)]))
         (sort-by (comp - second)))))

(comment
  (token-count "This is a test")
  (mag (embeddings "This is a test"))

  (let [samples ["This is a test of EBS"
                 "This is a test of the EBS (Emergency Broadcasting System)"
                 "In an emergency, seek shelter"
                 "The emergency broadcasting system is a public service"
                 "The emergency broadcasting system is being tested"
                 "The disaster radio thing is being checked out"
                 "System of a Down is on the radio"
                 "I like turtles"
                 "Do you like green eggs and ham"]]
    (closest
      "This is a test of the emergency broadcasting system"
      (zipmap samples (map embeddings samples))))

  (let [context (->> (t2/select Card :database_id 1 :dataset true)
                     (map model->context))]
    (infer {:prompt  "Show me orders where tax is greater than 0"
            :context context}))

  (->> (t2/select Card :database_id 1 :dataset true)
       (map model->context))

  (->> (t2/select Card :database_id 1 :dataset true)
       (map model->summary))

  (t2/select-one-fn :result_metadata Card :database_id 1 :dataset true)
  (t2/select-one Card :database_id 1 :dataset true)

  (defn model->summary [model])


  (t2/select-one Card :database_id 1 :dataset true))