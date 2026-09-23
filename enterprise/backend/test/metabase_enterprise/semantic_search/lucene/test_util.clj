(ns metabase-enterprise.semantic-search.lucene.test-util
  "Fixtures for the Lucene semantic search backend: a capturing embedding provider, a scratch index directory and a
  clean `semantic_search_embedding` table."
  (:require
   [metabase-enterprise.semantic-search.lucene.index :as lucene.index]
   [metabase-enterprise.semantic-search.lucene.sync :as lucene.sync]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.embeddings.provider :as embeddings.provider]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(comment semantic.settings/keep-me)

(set! *warn-on-reflection* true)

(def ^:dynamic *embeddings*
  "Text → vector lookup the test provider answers from. Texts outside it get a constant vector."
  {})

(def ^:dynamic *embedded-texts*
  "Atom collecting every text the test provider was asked to embed, so tests can assert on cache hits."
  nil)

(def ^:dynamic *embedder-fails?*
  "When true the test provider throws, standing in for an embedding service that is down."
  false)

(def ^:dynamic *embed-fn*
  "Function from text to a vector, overriding the [[*embeddings*]] lookup. Use it when the exact text a document
  embeds is awkward to predict, e.g. the `embeddable_text` search ingestion builds for a card."
  nil)

(def ^:private default-vector [0.01 0.02 0.03 0.04])

(embeddings.provider/register-provider!
 "lucene-test"
 {:embedding-spi-version embeddings.provider/embedding-spi-version
  :readiness             (constantly {:ready? true})
  :resolve-model         embeddings.provider/legacy-resolved-model
  :embed-texts           (fn [model texts _opts]
                           (when *embedder-fails?*
                             (throw (ex-info "Embedding service is down" {})))
                           (when *embedded-texts*
                             (swap! *embedded-texts* into texts))
                           (let [dims   (:vector-dimensions model)
                                 lookup (or *embed-fn* #(get *embeddings* % default-vector))]
                             (mapv (fn [text]
                                     (vec (take dims (concat (lookup text) (repeat 0.0)))))
                                   texts)))})

(defn embedded-texts
  "Every text the test provider has been asked to embed since the fixture started."
  []
  (some-> *embedded-texts* deref vec))

(defn reset-embedded-texts!
  "Forget what the test provider has embedded so far."
  []
  (some-> *embedded-texts* (reset! [])))

(defn document
  "A minimal ingestion document for `model`/`id`, shaped like [[metabase.search.ingestion]] produces."
  [model id & {:as overrides}]
  (let [document-name (or (:name overrides) (str "doc " id))]
    (merge {:model            model
            :id               id
            :name             document-name
            :archived         false
            :collection_id    nil
            :searchable_text  document-name
            :embeddable_text  (str "[" model "]\nname: " document-name)
            :display_data     {:name document-name}
            :legacy_input     (json/encode {:id id :model model :name document-name})}
           overrides)))

(defn do-with-lucene-store!
  "Impl for [[with-lucene-store]]."
  [dims f]
  (mt/with-temp-dir [dir nil]
    (binding [lucene.index/*index-root* (str dir)
              *embedded-texts*          (atom [])]
      (mt/with-temporary-setting-values [ee-embedding-provider         "lucene-test"
                                         ee-embedding-model            "test-model"
                                         ee-embedding-model-dimensions dims]
        (lucene.sync/stop!)
        (t2/delete! :model/SemanticSearchEmbedding)
        (try
          (f)
          (finally
            (lucene.sync/stop!)
            (lucene.index/close!)
            (t2/delete! :model/SemanticSearchEmbedding)))))))

(defmacro with-lucene-store
  "Run `body` with the capturing test embedding provider configured, an empty `semantic_search_embedding` table, a
  stopped sync timer and [[lucene.index/*index-root*]] pointed at a scratch directory. `dims` sets the provider's
  vector width."
  {:style/indent 1}
  [[dims] & body]
  `(do-with-lucene-store! ~dims (fn [] ~@body)))
