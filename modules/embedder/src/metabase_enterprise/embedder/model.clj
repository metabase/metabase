(ns metabase-enterprise.embedder.model
  "DJL + ONNX Runtime plumbing for the in-process embedder.
  Holds a registry of loaded models keyed by model name, so different consumers (semantic search, the
  library entity index, the complexity-score synonym axis) can run different models in one JVM.
  Each loaded model stays resident; the expensive part (~430 MB DJL/ONNX Runtime native init) is per-JVM,
  not per-model — an additional model costs its weights.
  See [[metabase-enterprise.embedder.core]] for the public API and packaging story."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [metabase.util.log :as log])
  (:import
   (ai.djl.huggingface.translator TextEmbeddingTranslatorFactory)
   (ai.djl.inference Predictor)
   (ai.djl.repository.zoo Criteria ZooModel)
   (java.net URI)
   (java.nio.file Paths)
   (java.util ArrayList)))

(set! *warn-on-reflection* true)

(def default-model-name
  "The semantic-search and library-retrieval default, as named by their shared embedding settings."
  "Snowflake/snowflake-arctic-embed-l-v2.0")

(def ^:private default-model-bundle-name
  "Canonical bundle/registry name for [[default-model-name]]."
  "snowflake-arctic-embed-l-v2.0")

(def ^:private minilm-model-zoo-url
  "djl://ai.djl.huggingface.onnxruntime/sentence-transformers/all-MiniLM-L6-v2")

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

(def ^:private model-name-aliases
  "Pinned HF repo paths → the bare names bundles (and the zoo default) are keyed by.
  The bare name is the canonical one: the model registry, the `MB_EMBEDDER_MODEL_SOURCES` lookup and the
  bundle path all key off it, so both spellings name one resident model and one override entry.
  Consumer settings often carry the full repo paths (semantic search defaults to Arctic, while the
  complexity-score synonym axis defaults to MiniLM). Only pinned aliases collapse: HF repo names are
  namespace-scoped, so another org's identically named model needs its own `MB_EMBEDDER_MODEL_SOURCES`
  entry."
  {"sentence-transformers/all-MiniLM-L6-v2" "all-MiniLM-L6-v2"
   default-model-name                        default-model-bundle-name})

(def ^:private model-runtime-options
  "Non-default translator options for pinned models. Arctic's official inference contract uses CLS
  pooling, and its ONNX exports accept only input IDs and an attention mask."
  {default-model-bundle-name {:pooling              "cls"
                              :include-token-types? false}})

(defn- normalize-model-name
  "Collapse a pinned HF repo alias to its bundled bare name; other names pass through unchanged."
  [model-name]
  (get model-name-aliases model-name model-name))

(defn- model-source-overrides
  "Per-model source overrides from the `MB_EMBEDDER_MODEL_SOURCES` env var: an EDN map of model name →
  `{:path \"/dir\"}` or `{:url \"...\"}`, with optional `:model-file-name` (weights file minus `.onnx`,
  default `model`), `:include-token-types?` and `:pooling` translator overrides.
  Keys are normalized like consumer-supplied names, so an entry keyed with either spelling of a pinned
  alias covers consumers configured with the other; keying both spellings is a config error rather than a
  silent last-one-wins."
  []
  (when-let [raw (not-empty (getenv "MB_EMBEDDER_MODEL_SOURCES"))]
    (let [parsed (try
                   (edn/read-string raw)
                   (catch Exception e
                     (throw (ex-info "MB_EMBEDDER_MODEL_SOURCES is not valid EDN" {:value raw} e))))]
      (when-not (map? parsed)
        (throw (ex-info "MB_EMBEDDER_MODEL_SOURCES must be an EDN map of model name → source entry"
                        {:value raw})))
      (reduce (fn [acc [k v]]
                (let [k' (normalize-model-name k)]
                  (when (contains? acc k')
                    (throw (ex-info (format (str "MB_EMBEDDER_MODEL_SOURCES has entries for two names of "
                                                 "the same model (%s); configure it once.")
                                            (pr-str k'))
                                    {:value raw :model-name k'})))
                  (assoc acc k' v)))
              {}
              parsed))))

(defn- model-source
  "Where to load `model-name` from, in priority order:

  1. An `MB_EMBEDDER_MODEL_SOURCES` entry for the name — a local directory (`:path`) or any DJL-supported
     model URL (`:url`: `file:`, `https:`, `s3:`, `djl://` zoo, `jar:///` classpath).
     Consumers select a model by name via their embedding settings (e.g. `MB_EE_EMBEDDING_MODEL` +
     `MB_EE_EMBEDDING_MODEL_DIMENSIONS`), so the name/dimensions they declare must describe the model the
     entry loads.
  2. A per-arch INT8 bundle packed into this jar's resources at build time (the production default).
     A pinned HF repo alias (see [[model-name-aliases]]) resolves to its bare bundled name, so the consumer
     defaults find the Arctic and MiniLM bundles; other qualified names never collapse.
  3. For the MiniLM bundle name (or its pinned alias) only: the DJL model-zoo URL, downloading into
     `~/.djl.ai/` — dev-only, and only with `MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true` so production can
     never silently reach the network. Arctic is intentionally build-pinned rather than downloaded at
     runtime.

  Each source carries the translator options required by that pinned model: Arctic uses CLS pooling and
  two graph inputs, while MiniLM uses mean pooling and three. An override inherits the pinned model's
  options and can replace them when its custom source differs."
  [requested-name]
  ;; Normalize before anything else: the override lookup, the bundle path and the zoo-download gate must all
  ;; agree on one canonical name, or an alias would pick up some of them and miss the others.
  (let [model-name      (normalize-model-name requested-name)
        resource-path   (str "metabase-embedder/" model-name "-" (bundled-model-arch) ".zip")
        ;; `find`, not `get`: a present-but-nil entry must be treated as malformed, not as absent.
        [_ override
         :as entry]     (find (model-source-overrides) model-name)
        ;; Only the recognized keys, so a stray key in the entry (e.g. :type) can't clobber the internal
        ;; source-map discriminator and surface as a cryptic downstream error.
        model-options   (merge {:include-token-types? true}
                               (get model-runtime-options model-name))
        override-source (fn [type-key]
                          (merge model-options
                                 {:origin :override}
                                 (select-keys override [:model-file-name :include-token-types? :pooling])
                                 {:type type-key, type-key (str (get override type-key))}))]
    ;; A malformed entry must fail loudly here: falling through to the bundled/zoo branches would either
    ;; claim no entry exists or silently load a different model than the one the entry meant to select.
    (when (and entry (not (or (:path override) (:url override))))
      (throw (ex-info (format "MB_EMBEDDER_MODEL_SOURCES entry for %s must have a :path or :url key."
                              (pr-str model-name))
                      {:model-name model-name :requested-name requested-name :entry override})))
    (cond
      (:path override)
      (override-source :path)

      (:url override)
      (override-source :url)

      (bundled-model-resource resource-path)
      (merge model-options
             {:type   :url
              :url    (str "jar:///" resource-path)
              :origin :built-in})

      (and (= model-name "all-MiniLM-L6-v2")
           (= "true" (getenv "MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD")))
      {:type :url
       :url minilm-model-zoo-url
       :include-token-types? false
       :origin :built-in}

      :else
      (throw (ex-info (format (str "No source for embedder model %s: this build carries no matching "
                                   "bundle, MB_EMBEDDER_MODEL_SOURCES has no entry for it, and downloads "
                                   "are not enabled (MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true, dev only, "
                                   "default model only).")
                              (pr-str model-name))
                      {:model-name model-name :requested-name requested-name :resource resource-path})))))

(defn- sanitized-url
  "Reduce a model-source URL to a form safe to log, or `\"<redacted>\"` when no part of it can be kept.
  `include-path?` retains the path component; pass true only for URLs [[model-source]] builds itself."
  [url include-path?]
  ;; Userinfo, query and fragment always go: that's where an `s3://key:secret@…` or a presigned
  ;; `?token=…` lives. The path is the one component whose safety depends on who wrote the URL — in our
  ;; own `jar:///…` and `djl://…` it is the model's identity and holds no secret, while an operator's
  ;; override URL can just as easily carry its token in a path segment.
  (try
    (let [^URI uri (URI. ^String url)
          scheme   (.getScheme uri)
          host     (.getHost uri)
          path     (when include-path? (.getPath uri))]
      (cond
        host   (str scheme "://" host
                    (when (not= -1 (.getPort uri)) (str ":" (.getPort uri)))
                    path)
        path   (str scheme "://" path)
        scheme (str scheme ":<redacted>")
        :else   "<redacted>"))
    (catch Exception _
      "<redacted>")))

(defn- source-log-summary
  "Loggable summary of a [[model-source]] map: says which model loaded and whether an override took
  effect, without logging anything that can carry a credential."
  [{:keys [type url path origin]}]
  ;; A local path is kept but a URL's path is not, because they differ in kind rather than in who
  ;; configured them: a path names a directory on the operator's own host — a location, not a transport
  ;; credential — while a URL is a transport, so any of its components can hold a secret.
  ;; Anything but a recognized :built-in reads as an override, so a new source type redacts by default.
  (let [origin (if (= origin :built-in) :built-in :override)]
    (cond-> {:type type, :origin origin}
      (= type :path) (assoc :path path)
      (= type :url)  (assoc :url (sanitized-url url (= origin :built-in))))))

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
                     (.optArgument "pooling" (or (:pooling source) "mean"))
                     (.optArgument "normalize" "true")
                     (.optArgument "includeTokenTypes" (str (boolean (:include-token-types? source)))))]
    (log/info "Loading in-process embedder model" model-name "from" (pr-str (source-log-summary source)))
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

(defn- model ^ZooModel [requested-name]
  ;; Keyed by the normalized name, so two consumers naming the same model differently (bare vs. pinned HF
  ;; repo path) share the one resident copy instead of each loading their own ZooModel + ONNX session.
  (let [model-name (normalize-model-name requested-name)]
    (or (get @models* model-name)
        (locking models*
          (or (get @models* model-name)
              (let [loaded (build-model model-name)]
                (swap! models* assoc model-name loaded)
                loaded))))))

(defn reset-models!
  "Close and discard all loaded models so the next embed reloads them.
  REPL affordance."
  []
  (locking models*
    ;; instance? check: tests stash stub sentinels in the registry, which have nothing to close.
    (doseq [[_ m] @models*
            :when (instance? ZooModel m)]
      (.close ^ZooModel m))
    (reset! models* {})))

(defn embed-texts
  "Embed `texts` (a seq of strings) with `model-name` → vector of float-array embeddings, in input order.
  The first call for a given model loads it and keeps it resident."
  [model-name texts]
  ;; TODO `texts` arrives unchunked — `.batchPredict` pads the whole batch to its longest sequence, so a
  ;; large caller batch is one correspondingly large tensor. Callers currently size the batch (see the TODO
  ;; on the `in-process` `get-embeddings-batch` method); a cap here would be the belt-and-braces version.
  ;; Predictor is not thread-safe in DJL; creating one per call is cheap relative to the forward pass.
  (with-open [predictor ^Predictor (.newPredictor (model model-name))]
    (vec (.batchPredict predictor (ArrayList. ^java.util.Collection texts)))))
