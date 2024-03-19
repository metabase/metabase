(ns metabase.search.semantic
  (:require
   [metabase.search.trigram :as tri])
  (:import
   (ai.djl.huggingface.translator TextEmbeddingTranslatorFactory)
   (ai.djl.repository.zoo Criteria ZooModel)
   (ai.djl.training.util ProgressBar)
   (clojure.lang PersistentVector)
   (io.github.jbellis.jvector.graph GraphIndexBuilder GraphSearcher GraphSearcher$Builder ListRandomAccessVectorValues
                                    NodeSimilarity$ExactScoreFunction SearchResult$NodeScore)
   (io.github.jbellis.jvector.pq CompressedVectors PQVectors ProductQuantization)
   (io.github.jbellis.jvector.util Bits)
   (io.github.jbellis.jvector.vector VectorEncoding VectorSimilarityFunction)
   (java.util ArrayList)))

(set! *warn-on-reflection* true)

(declare predict index)

(defonce CRITERIA
  (-> (Criteria/builder)
      (.setTypes String (Class/forName "[F"))
      (.optModelUrls "djl://ai.djl.huggingface.pytorch/sentence-transformers/all-MiniLM-L6-v2")
      (.optEngine "PyTorch")
      (.optTranslatorFactory (TextEmbeddingTranslatorFactory.))
      (.optProgress (ProgressBar.))
      (.build)))

(defonce ^ZooModel MODEL
  (.loadModel ^Criteria CRITERIA))

(defonce DATA
  (delay (vec (concat
               (tri/fetch-model "dashboard")
               (tri/fetch-model "card")))))

(defonce VECTORS
  (delay (mapv #(predict (tri/make-model-string %)) @DATA)))

(defonce INDEX
  (delay (index @VECTORS)))

(defn predict ^floats [^String s]
  (.predict (.newPredictor MODEL) s))

(defn index [vectors]
  (let [size       (count (first vectors))
        vectors    (ArrayList. ^PersistentVector vectors)
        pq         (ProductQuantization/compute
                    (ListRandomAccessVectorValues. vectors size)
                    (/ size 2)
                    false)
        q-vectors  (.encodeAll pq vectors)
        compressed (PQVectors. pq q-vectors)
        ravv       (ListRandomAccessVectorValues. vectors size)
        builder    (GraphIndexBuilder. ravv VectorEncoding/FLOAT32 VectorSimilarityFunction/COSINE (int 32) (int 100) (float 1.5) (float 1.4))
        graph      (.build builder)]
    {:graph      graph
     :ravv       ravv
     :compressed compressed
     :searcher   (.build (GraphSearcher$Builder. (.getView graph)))}))

(defn vcomparator [^ListRandomAccessVectorValues ravv s]
  (let [v (predict s)]
    (reify NodeSimilarity$ExactScoreFunction
      (similarityTo [_this j]
        (.compare VectorSimilarityFunction/EUCLIDEAN v (.vectorValue ravv j))))))

(defn search [{:keys [ravv
                      ^GraphSearcher searcher
                      ^CompressedVectors compressed]}
              top-k s]
  #_
  (let [query-v (predict s)
        sf (.approximateScoreFunctionFor compressed)])
  (.getNodes (.search searcher (vcomparator ravv s) nil (int top-k) (float 0.3) Bits/ALL)))

;;; API

(defn api-search [{:keys [search-string limit-int] :as ctx}]
  (let [nodes (search @INDEX limit-int search-string)]
    {:total            (count nodes)
     :limit            limit-int
     :offset           0
     :available_models ["dashboard" "card"]
     :models           ["dashboard" "card"]
     :data             (vec (for [^SearchResult$NodeScore item nodes
                                  :let                         [x (get @DATA (.node item))]]
                              {:archived    (:archived x)
                               :id          (:id x)
                               :collection  {:id (:collection_id x)
                                             :name (:collection_name x)}
                               #_{:authority_level "official"
                                                     :id              358
                                                     :name            "Revenue"
                                                     :type            nil}
                               :name        (:name x)
                               :description (:description x)
                               :model       (:model x)
                               :score       (:score x)
                               :updated_at  (:updated_at x)}))}))
