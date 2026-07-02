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

  1. `MB_EMBEDDER_MODEL_PATH` — a local directory containing an extracted model.
  2. `MB_EMBEDDER_MODEL_URL` — any DJL-supported model URL (`file:`, `https:`, `s3:`, `djl://` zoo,
     `jar:///` classpath).
     With 1 and 2 the embedder runs a model other than the bundled one; pair them with matching
     `MB_EE_EMBEDDING_MODEL` / `MB_EE_EMBEDDING_MODEL_DIMENSIONS` so the pgvector index is labeled (and
     sized) for what is actually loaded.
  3. The per-arch INT8 bundle packed into this jar's resources at build time (the production default).
  4. The DJL model-zoo URL for the default model, downloading into `~/.djl.ai/` — dev-only, and only with
     `MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true` so production can never silently reach the network.

  Each source carries `:include-token-types?`: the HF INT8 exports we bundle (and dirs prepared like them)
  have a third `token_type_ids` graph input the translator must feed, while the DJL zoo export takes two.
  Overrides inherit the bundle convention; set `MB_EMBEDDER_INCLUDE_TOKEN_TYPES=false` for a two-input
  custom model."
  []
  (let [resource-path        (str "metabase-embedder/all-MiniLM-L6-v2-int8-" (bundled-model-arch) ".zip")
        override-token-types (not= "false" (System/getenv "MB_EMBEDDER_INCLUDE_TOKEN_TYPES"))]
    (cond
      (some-> (System/getenv "MB_EMBEDDER_MODEL_PATH") not-empty)
      {:type :path :path (System/getenv "MB_EMBEDDER_MODEL_PATH") :include-token-types? override-token-types}

      (some-> (System/getenv "MB_EMBEDDER_MODEL_URL") not-empty)
      {:type :url :url (System/getenv "MB_EMBEDDER_MODEL_URL") :include-token-types? override-token-types}

      (io/resource resource-path)
      {:type :url :url (str "jar:///" resource-path) :include-token-types? true}

      (= "true" (System/getenv "MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD"))
      {:type :url
       :url "djl://ai.djl.huggingface.onnxruntime/sentence-transformers/all-MiniLM-L6-v2"
       :include-token-types? false}

      :else
      (throw (ex-info (str "No embedder model available: the plugin jar carries no bundled model, "
                           "neither MB_EMBEDDER_MODEL_PATH nor MB_EMBEDDER_MODEL_URL is set, and "
                           "downloads are not enabled (MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true, dev only).")
                      {:resource resource-path})))))

(defn- model-file-name
  "DJL resolves the weights file as `<name>.onnx`, defaulting `<name>` to the model directory/archive name.
  Our bundles (and `MB_EMBEDDER_MODEL_PATH` dirs prepared like them) always call it `model.onnx`;
  `MB_EMBEDDER_MODEL_NAME` overrides for custom models that name theirs differently."
  []
  (or (not-empty (System/getenv "MB_EMBEDDER_MODEL_NAME")) "model"))

(defn- build-model ^ZooModel []
  (let [source   (model-source)
        criteria (-> (Criteria/builder)
                     (.setTypes String floats-class)
                     (.optEngine "OnnxRuntime")
                     (.optTranslatorFactory (TextEmbeddingTranslatorFactory.))
                     (.optModelName (model-file-name))
                     ;; Explicit so behavior doesn't depend on a serving.properties inside the bundle.
                     (.optArgument "pooling" "mean")
                     (.optArgument "normalize" "true")
                     (.optArgument "includeTokenTypes" (str (boolean (:include-token-types? source)))))]
    (log/info "Loading in-process embedder model from" (pr-str source))
    (-> (case (:type source)
          :path (.optModelPath criteria (Paths/get ^String (:path source) (into-array String [])))
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
  "Close and discard the loaded model so the next embed reloads it.
  REPL affordance."
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
