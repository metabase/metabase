(ns metabase-enterprise.embedder.model
  "Lazy DJL/ONNX Runtime lifecycle for the single bundled Arctic embedding model."
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
(defonce ^:private loaded-model (atom nil))

(defn- model
  ^ZooModel [model-name]
  (or @loaded-model
      (locking loaded-model
        (or @loaded-model
            (let [loaded (build-model model-name)]
              (reset! loaded-model loaded)
              loaded)))))

(defn reset-model!
  "Close the resident model. Intended for tests and REPL use when no inference is active."
  []
  (locking loaded-model
    (when (instance? ZooModel @loaded-model)
      (.close ^ZooModel @loaded-model))
    (reset! loaded-model nil)))

(defn embed-batch
  "Embed one already-bounded batch of texts."
  [model-name texts]
  (with-open [predictor ^Predictor (.newPredictor (model model-name))]
    (vec (.batchPredict predictor (ArrayList. ^java.util.Collection texts)))))
