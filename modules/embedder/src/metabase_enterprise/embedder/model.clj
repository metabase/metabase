(ns metabase-enterprise.embedder.model
  "DJL + ONNX Runtime plumbing for the in-process embedder.
  Holds a registry of loaded models keyed by model name, so different consumers (semantic search, the
  library entity index, the complexity-score synonym axis) can run different models in one JVM.
  Each loaded model stays resident; the expensive part (~430 MB DJL/ONNX Runtime native init) is per-JVM,
  not per-model — an additional model costs only its weights (~25 MB for a MiniLM-class INT8 export).
  See [[metabase-enterprise.embedder.core]] for the public API and packaging story."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [metabase.util.log :as log])
  (:import
   (ai.djl.huggingface.translator TextEmbeddingTranslatorFactory)
   (ai.djl.inference Predictor)
   (ai.djl.repository.zoo Criteria ZooModel)
   (java.nio.file Paths)
   (java.util ArrayList)))

(set! *warn-on-reflection* true)

(def default-model-name
  "Name of the model bundled into the plugin jar, and the fallback for zoo downloads."
  "all-MiniLM-L6-v2")

(def ^:private ^Class floats-class
  ;; `float[].class` isn't directly expressible in Clojure; resolve once.
  (Class/forName "[F"))

(defn- getenv
  "Thin wrapper over `System/getenv` so tests can redef the config surface."
  [k]
  (System/getenv k))

(defn- bundled-model-arch
  "The INT8 ONNX exports are ISA-flavored; pick the bundle matching the host CPU."
  []
  (case (System/getProperty "os.arch")
    ("aarch64" "arm64") "arm64"
    "avx2"))

(defn- bundled-model-resource
  "Classpath URL of the per-arch model bundle, nil when this build carries no bundle for the model."
  [resource-path]
  (io/resource resource-path))

(defn- model-source-overrides
  "Per-model source overrides from the `MB_EMBEDDER_MODEL_SOURCES` env var: an EDN map of model name →
  `{:path \"/dir\"}` or `{:url \"...\"}`, with optional `:model-file-name` (weights file minus `.onnx`,
  default `model`) and `:include-token-types?` (default true)."
  []
  (when-let [raw (not-empty (getenv "MB_EMBEDDER_MODEL_SOURCES"))]
    (try
      (edn/read-string raw)
      (catch Exception e
        (throw (ex-info "MB_EMBEDDER_MODEL_SOURCES is not valid EDN" {:value raw} e))))))

(defn- model-source
  "Where to load `model-name` from, in priority order:

  1. An `MB_EMBEDDER_MODEL_SOURCES` entry for the name — a local directory (`:path`) or any DJL-supported
     model URL (`:url`: `file:`, `https:`, `s3:`, `djl://` zoo, `jar:///` classpath).
     Consumers select a model by name via their embedding settings (e.g. `MB_EE_EMBEDDING_MODEL` +
     `MB_EE_EMBEDDING_MODEL_DIMENSIONS`), so the name/dimensions they declare must describe the model the
     entry loads.
  2. A per-arch INT8 bundle packed into this jar's resources at build time (the production default).
  3. For [[default-model-name]] only: the DJL model-zoo URL, downloading into `~/.djl.ai/` — dev-only,
     and only with `MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true` so production can never silently reach the
     network.

  Each source carries `:include-token-types?`: the HF INT8 exports we bundle (and dirs prepared like them)
  have a third `token_type_ids` graph input the translator must feed, while the DJL zoo export takes two.
  Override entries default to the bundle convention; set `:include-token-types? false` for a two-input
  custom model."
  [model-name]
  (let [resource-path (str "metabase-embedder/" model-name "-" (bundled-model-arch) ".zip")
        override      (get (model-source-overrides) model-name)]
    (cond
      (:path override)
      (merge {:type :path :include-token-types? true} (assoc override :path (str (:path override))))

      (:url override)
      (merge {:type :url :include-token-types? true} (assoc override :url (str (:url override))))

      (bundled-model-resource resource-path)
      {:type :url :url (str "jar:///" resource-path) :include-token-types? true}

      (and (= model-name default-model-name)
           (= "true" (getenv "MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD")))
      {:type :url
       :url "djl://ai.djl.huggingface.onnxruntime/sentence-transformers/all-MiniLM-L6-v2"
       :include-token-types? false}

      :else
      (throw (ex-info (format (str "No source for embedder model %s: this build carries no matching "
                                   "bundle, MB_EMBEDDER_MODEL_SOURCES has no entry for it, and downloads "
                                   "are not enabled (MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true, dev only, "
                                   "default model only).")
                              (pr-str model-name))
                      {:model-name model-name :resource resource-path})))))

(defn- build-model ^ZooModel [model-name]
  (let [source   (model-source model-name)
        criteria (-> (Criteria/builder)
                     (.setTypes String floats-class)
                     (.optEngine "OnnxRuntime")
                     (.optTranslatorFactory (TextEmbeddingTranslatorFactory.))
                     ;; DJL resolves the weights file as `<name>.onnx`, defaulting `<name>` to the model
                     ;; directory/archive name; our bundles always call it `model.onnx`.
                     (.optModelName (str (or (:model-file-name source) "model")))
                     ;; Explicit so behavior doesn't depend on a serving.properties inside the bundle.
                     (.optArgument "pooling" "mean")
                     (.optArgument "normalize" "true")
                     (.optArgument "includeTokenTypes" (str (boolean (:include-token-types? source)))))]
    (log/info "Loading in-process embedder model" model-name "from" (pr-str source))
    (-> (case (:type source)
          :path (.optModelPath criteria (Paths/get ^String (:path source) (into-array String [])))
          :url  (.optModelUrls criteria ^String (:url source)))
        (.build)
        (.loadModel))))

;; A map in an atom rather than per-model `delay`s: a delay would permanently cache an exception from
;; `build-model` (e.g. a transient IO failure on first use) and every later deref would re-throw it until
;; a JVM restart. Only successful loads are cached; `locking` serializes the herd of indexer threads
;; racing to pay the one-time DJL/ONNX Runtime native init.
(defonce ^:private models* (atom {}))

(defn- model ^ZooModel [model-name]
  (or (get @models* model-name)
      (locking models*
        (or (get @models* model-name)
            (let [loaded (build-model model-name)]
              (swap! models* assoc model-name loaded)
              loaded)))))

(defn reset-models!
  "Close and discard all loaded models so the next embed reloads them.
  REPL affordance."
  []
  (locking models*
    (doseq [[_ m] @models*
            :when (instance? ZooModel m)]
      (.close ^ZooModel m))
    (reset! models* {})))

(defn embed-texts
  "Embed `texts` (a seq of strings) with `model-name` → vector of float-array embeddings, in input order.
  The first call for a given model loads it and keeps it resident."
  [model-name texts]
  ;; Predictor is not thread-safe in DJL; creating one per call is cheap relative to the forward pass.
  (with-open [predictor ^Predictor (.newPredictor (model model-name))]
    (vec (.batchPredict predictor (ArrayList. ^java.util.Collection texts)))))
