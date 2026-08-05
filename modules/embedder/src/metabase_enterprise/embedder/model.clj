(ns metabase-enterprise.embedder.model
  "Lazy DJL/ONNX Runtime lifecycle for the bundled embedding models."
  (:require
   [metabase-enterprise.embedder.catalog :as catalog]
   [metabase.util.log :as log])
  (:import
   (ai.djl.huggingface.translator TextEmbeddingTranslatorFactory)
   (ai.djl.inference Predictor)
   (ai.djl.repository.zoo Criteria ZooModel)
   (java.util ArrayList)))

(set! *warn-on-reflection* true)

(def ^:private ^Class floats-class
  (Class/forName "[F"))

(defn- build-model
  ^ZooModel [model-name]
  (let [spec          (catalog/model-spec model-name)
        resource-path (catalog/bundle-resource model-name)]
    (when-not (catalog/bundle-present? model-name)
      (throw (ex-info (format "The embedder plugin does not contain the %s model bundle." model-name)
                      {:model-name model-name
                       :resource   resource-path
                       :reason     :model-bundle-missing})))
    (log/info "Loading bundled in-process embedding model" model-name)
    (-> (Criteria/builder)
        (.setTypes String floats-class)
        (.optEngine (get-in spec [:runtime :engine]))
        (.optTranslatorFactory (TextEmbeddingTranslatorFactory.))
        (.optModelName "model")
        (.optModelUrls (str "jar:///" resource-path))
        (.optArgument "pooling" (get-in spec [:runtime :pooling]))
        (.optArgument "normalize" (str (boolean (get-in spec [:runtime :normalize?]))))
        (.optArgument "includeTokenTypes" (str (boolean (get-in spec [:runtime :include-token-types?]))))
        (.build)
        (.loadModel))))

;; Only successful loads are retained. A transient first-load failure is therefore retryable without restarting.
;; Keep one resident ZooModel per catalog model: Library retrieval uses Arctic while Data Complexity Score uses MiniLM.
(defonce ^:private loaded-models (atom {}))

(defn- model
  ^ZooModel [model-name]
  (or (get @loaded-models model-name)
      (locking loaded-models
        (or (get @loaded-models model-name)
            (let [loaded (build-model model-name)]
              (swap! loaded-models assoc model-name loaded)
              loaded)))))

(defn reset-model!
  "Close the resident model. Intended for tests and REPL use when no inference is active."
  []
  (locking loaded-models
    (doseq [loaded (vals @loaded-models)]
      (.close ^ZooModel loaded))
    (reset! loaded-models {})))

(defn embed-batch
  "Embed one already-bounded batch of texts."
  [model-name texts]
  (with-open [predictor ^Predictor (.newPredictor (model model-name))]
    (vec (.batchPredict predictor (ArrayList. ^java.util.Collection texts)))))
