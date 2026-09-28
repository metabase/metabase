(ns metabase-enterprise.semantic-search.query-semantics-vectors
  "Frozen embedding vectors for the shared search semantics corpus.

  The semantic tests read these instead of calling a model. After changing a document or query in
  `search/query_semantics.edn`, regenerate the file from a REPL with a local Ollama serving the model:

    (freeze!)"
  (:require
   [clj-http.client :as http]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.query-semantics :as fixtures]
   [metabase.util.json :as json])
  (:import
   (java.nio ByteBuffer)
   (java.util Base64)))

(set! *warn-on-reflection* true)

(def ^:private resource-path "search/arctic_embed_l_v2_vectors.edn")

(def ^:private ollama-model "Snowflake/snowflake-arctic-embed-l-v2.0:latest")

(def ^:private header
  (str/join "\n" [";; Frozen F16 Ollama output from Snowflake/snowflake-arctic-embed-l-v2.0:latest"
                  ";; (model ID 5de93a84837d). Query input includes the production `query: ` prefix."
                  ";; Document inputs use ingestion's `[card]\\nname: ...` embeddable-text format."
                  ";; Values are 1024 IEEE-754 float32 components in big-endian Base64."
                  ";; Decoding is local; no model or network access is needed by the test."
                  ";; Regenerate with metabase-enterprise.semantic-search.query-semantics-vectors/freeze!."]))

(def metadata
  "The model and encoding behind the frozen vectors."
  {:model           "Snowflake/snowflake-arctic-embed-l-v2.0"
   :ollama-model-id "5de93a84837d"
   :dimensions      1024
   :encoding        :float32-be-base64})

(defn document-text
  "The text production embeds for a fixture document indexed as a card."
  [{:keys [name description]}]
  (#'search.ingestion/embeddable-text {:model "card", :name name, :description description}))

(defn query-text
  "The text production embeds for `query` with the model's own query prefix.

  The semantic tests clear `ee-embedding-query-prefix`, which would otherwise replace it."
  [query]
  (str (#'semantic.embedding/default-query-prefix (:model metadata)) query))

(defn- semantic-queries
  [{:keys [query comparisons] :as case}]
  (cons query (map #(:query (fixtures/comparison-spec case % :semantic)) comparisons)))

(defn- embedding-inputs
  "Every text the semantic tests embed for `cases`."
  [cases]
  (distinct (concat (for [case cases, query (semantic-queries case)]
                      (query-text query))
                    (for [case cases, doc (vals (:docs case))]
                      (document-text doc)))))

(defn read-vectors
  "Decode the frozen vectors into a map from embedded text to vector."
  []
  (let [{:keys [dimensions encoding vectors]} (-> resource-path io/resource slurp edn/read-string)]
    (when-not (= encoding :float32-be-base64)
      (throw (ex-info "Unexpected vector encoding" {:encoding encoding})))
    (update-vals vectors
                 (fn [^String encoded]
                   (let [bytes (.decode (Base64/getDecoder) encoded)]
                     (when-not (= (alength bytes) (* 4 dimensions))
                       (throw (ex-info "Unexpected vector length" {:bytes (alength bytes)})))
                     (let [buffer (ByteBuffer/wrap bytes)]
                       (mapv (fn [_] (double (.getFloat buffer))) (range dimensions))))))))

(defn- encode
  [vector]
  (let [buffer (ByteBuffer/allocate (* 4 (count vector)))]
    (doseq [x vector]
      (.putFloat buffer (float x)))
    (.encodeToString (Base64/getEncoder) (.array buffer))))

(defn- check-model!
  "Refuse to mix vectors from a different build of the model."
  [ollama-url]
  (let [models (-> (http/get (str ollama-url "/api/tags") {:as :string}) :body json/decode+kw :models)
        digest (some #(when (= ollama-model (:name %)) (:digest %)) models)]
    (when-not (some-> digest (str/starts-with? (:ollama-model-id metadata)))
      (throw (ex-info "Ollama does not serve the expected model build"
                      {:model ollama-model, :expected (:ollama-model-id metadata), :digest digest})))))

(defn- embed
  "Embed one input at a time, as the existing vectors were, so batching cannot change the output."
  [ollama-url input]
  (let [vector (-> (http/post (str ollama-url "/api/embed")
                              {:body         (json/encode {:model ollama-model, :input [input]})
                               :content-type :json
                               :as           :string})
                   :body json/decode+kw :embeddings first)]
    (when-not (= (:dimensions metadata) (count vector))
      (throw (ex-info "Unexpected vector length" {:input input, :dimensions (count vector)})))
    vector))

(defn freeze!
  "Embed every corpus input with a local Ollama and rewrite the vectors file in test_resources."
  [& {:keys [ollama-url] :or {ollama-url "http://localhost:11434"}}]
  (check-model! ollama-url)
  (let [inputs  (vec (embedding-inputs fixtures/cases))
        entries (sort-by first (map (fn [input] [input (encode (embed ollama-url input))]) inputs))]
    (spit (io/file "test_resources" resource-path)
          (str header "\n"
               "{:model " (pr-str (:model metadata)) "\n"
               " :ollama-model-id " (pr-str (:ollama-model-id metadata)) "\n"
               " :dimensions " (:dimensions metadata) "\n"
               " :encoding " (:encoding metadata) "\n"
               " :vectors\n {"
               (str/join "\n  " (map (fn [[input encoded]] (str (pr-str input) " " (pr-str encoded))) entries))
               "}}\n"))
    (count entries)))
