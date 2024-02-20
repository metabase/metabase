(ns metabase.search.semantic
  (:import [ai.djl.huggingface.translator TextEmbeddingTranslatorFactory]
           ai.djl.ModelException
           ai.djl.inference.Predictor
           ai.djl.repository.zoo.Criteria
           ai.djl.repository.zoo.ZooModel
           ai.djl.training.util.ProgressBar
           ai.djl.translate.TranslateException
           io.github.jbellis.jvector.graph.ListRandomAccessVectorValues
           io.github.jbellis.jvector.graph.GraphIndexBuilder
           io.github.jbellis.jvector.graph.GraphSearcher$Builder
           io.github.jbellis.jvector.graph.NodeSimilarity$ExactScoreFunction
           io.github.jbellis.jvector.vector.VectorSimilarityFunction
           io.github.jbellis.jvector.vector.VectorEncoding
           io.github.jbellis.jvector.util.Bits
           io.github.jbellis.jvector.pq.CompressedVectors
           io.github.jbellis.jvector.pq.PQVectors
           io.github.jbellis.jvector.pq.ProductQuantization
           [java.util ArrayList]
           [clojure.lang PersistentVector]))

(set! *warn-on-reflection* true)

(defonce CRITERIA
  (-> (Criteria/builder)
      (.setTypes String (Class/forName "[F"))
      (.optModelUrls "djl://ai.djl.huggingface.pytorch/sentence-transformers/all-MiniLM-L6-v2")
      (.optEngine "PyTorch")
      (.optTranslatorFactory (TextEmbeddingTranslatorFactory.))
      (.optProgress (ProgressBar.))
      (.build)))

(defonce MODEL
  (.loadModel ^Criteria CRITERIA))

(defn predict [s]
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

(defn vcomparator [ravv s]
  (let [v (predict s)]
    (reify NodeSimilarity$ExactScoreFunction
      (similarityTo [_this j]
        (.compare VectorSimilarityFunction/EUCLIDEAN v (.vectorValue ravv j))))))

(defn search [{:keys [ravv searcher compressed]} top-k s]
  #_
  (let [query-v (predict s)
        sf (.approximateScoreFunctionFor compressed)])
  (.getNodes (.search searcher (vcomparator ravv s) nil (int top-k) (float 0.3) Bits/ALL)))

(comment
  (def graph
    (index [(predict "Yearly revenue")
            (predict "Monthly subscribers")]))

  (def s (.build (GraphSearcher$Builder. (.getView (:graph graph)))))

  (for [item ]
    [(.node item) (.score item)])
  )


;;; fetching data

(require '[metabase.search.trigram :as tri])

(comment
  (tri/collect-model-q "card")
  (def data (vec (concat
                  (tri/fetch-model "dashboard")
                  (tri/fetch-model "card"))))
  (def vectors (mapv #(predict (tri/make-model-string %)) data))

  (def idx (index vectors))

  (for [item (search idx 10 "Earning information")
        :let [node (get data (.node item))]]
    (-> (select-keys node [:name :description])
        (assoc :score (.score item)
               :url (str "https://stats.metabase.com/dashboard/" (:id node))))))
