(ns metabase-enterprise.embedder.model
  "DJL + ONNX Runtime plumbing for the in-process embedder.
  Loads sentence-transformers/all-MiniLM-L6-v2 and keeps it resident for the life of the JVM.
  See [[metabase-enterprise.embedder.core]] for the public API and packaging story."
  (:require
   [clojure.java.io :as io]
   [metabase.util.log :as log])
  (:import
   (ai.djl.huggingface.translator TextEmbeddingTranslatorFactory)
   (ai.djl.inference Predictor)
   (ai.djl.repository.zoo Criteria ZooModel)
   (java.nio.file Paths)
   (java.util ArrayList)))

(set! *warn-on-reflection* true)

(def ^:private ^Class floats-class
  ;; `float[].class` isn't directly expressible in Clojure; resolve once.
  (Class/forName "[F"))

(defn- bundled-model-arch
  "The INT8 ONNX exports are ISA-flavored; pick the bundle matching the host CPU."
  []
  (case (System/getProperty "os.arch")
    ("aarch64" "arm64") "arm64"
    "avx2"))

(defn- model-source
  "Where to load the model from, in priority order:

  1. `MB_EMBEDDER_MODEL_PATH` — a local directory containing an extracted model (dev/testing escape hatch).
  2. The per-arch INT8 bundle packed into this jar's resources at build time (the production path).
  3. The DJL model-zoo URL, which downloads from HuggingFace into `~/.djl.ai/` — dev-only, and only
     with `MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true` so production can never silently reach the network."
  []
  (let [resource-path (str "metabase-embedder/all-MiniLM-L6-v2-int8-" (bundled-model-arch) ".zip")]
    (cond
      (some-> (System/getenv "MB_EMBEDDER_MODEL_PATH") not-empty)
      {:type :path :path (System/getenv "MB_EMBEDDER_MODEL_PATH")}

      (io/resource resource-path)
      {:type :url :url (str "jar:///" resource-path)}

      (= "true" (System/getenv "MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD"))
      {:type :url :url "djl://ai.djl.huggingface.onnxruntime/sentence-transformers/all-MiniLM-L6-v2"}

      :else
      (throw (ex-info (str "No embedder model available: the plugin jar carries no bundled model, "
                           "MB_EMBEDDER_MODEL_PATH is not set, and downloads are not enabled "
                           "(MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true, dev only).")
                      {:resource resource-path})))))

(defn- build-model ^ZooModel []
  (let [source   (model-source)
        criteria (-> (Criteria/builder)
                     (.setTypes String floats-class)
                     (.optEngine "OnnxRuntime")
                     (.optTranslatorFactory (TextEmbeddingTranslatorFactory.))
                     ;; Explicit so behavior doesn't depend on a serving.properties inside the bundle.
                     (.optArgument "pooling" "mean")
                     (.optArgument "normalize" "true"))]
    (log/info "Loading in-process embedder model from" (pr-str source))
    (-> (case (:type source)
          :path (-> criteria
                    (.optModelPath (Paths/get ^String (:path source) (into-array String [])))
                    ;; The extracted bundle names its weights model.onnx regardless of directory name.
                    (.optModelName "model"))
          :url  (.optModelUrls criteria ^String (:url source)))
        (.build)
        (.loadModel))))

;; An atom rather than a `delay`: a delay would permanently cache an exception from `build-model`
;; (e.g. a transient IO failure on first use) and every later deref would re-throw it until a JVM
;; restart. With an atom only success is cached; `locking` serializes the herd of indexer threads
;; racing to pay the one-time DJL/ONNX Runtime native init.
(defonce ^:private model* (atom nil))

(defn- model ^ZooModel []
  (or @model*
      (locking model*
        (or @model*
            (reset! model* (build-model))))))

(defn reset-model!
  "Close and discard the loaded model so the next embed reloads it. REPL affordance."
  []
  (locking model*
    (when-let [^ZooModel m @model*]
      (.close m))
    (reset! model* nil)))

(defn embed-texts
  "Embed `texts` (a seq of strings) → vector of `float[384]` arrays, in input order.
  The first call loads the model."
  [texts]
  ;; Predictor is not thread-safe in DJL; creating one per call is cheap relative to the forward pass.
  (with-open [predictor ^Predictor (.newPredictor (model))]
    (vec (.batchPredict predictor (ArrayList. ^java.util.Collection texts)))))
