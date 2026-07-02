(ns metabase-enterprise.embedder.core
  "In-process text embedder: sentence-transformers/all-MiniLM-L6-v2 (384-dim, mean-pooled,
  L2-normalized) running inside the Metabase JVM via DJL + ONNX Runtime.

  This module is deliberately not part of the core uberjar: it ships as a separate plugin jar
  (metabase-embedder-plugin.jar) that the plugin loader adds to the classpath at boot, and
  `metabase-enterprise.semantic-search.embedding` resolves it dynamically when the `in-process`
  provider is selected. Nothing here is loaded — and none of the ~430 MB DJL/ONNX Runtime native
  init is paid — until the first embedding is requested."
  (:require
   [metabase-enterprise.embedder.model :as embedder.model]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def model-descriptor
  "Identity of the bundled model. Single source of truth for callers wiring this embedder into
  provider/model metadata, so their labels can't drift from what the JVM actually loads."
  {:provider         "in-process"
   :model-name       "all-MiniLM-L6-v2"
   :model-dimensions 384})

(defn embed-texts
  "Embed `texts` (a seq of strings) → vector of `float[384]` arrays, in input order.
  The first call loads the model and pays the one-time DJL/ONNX Runtime native init."
  [texts]
  (embedder.model/embed-texts texts))

(defn warm-up!
  "Load the model and run a probe embedding, so the one-time init cost is paid at a chosen moment
  rather than on the first real indexing run. Returns elapsed milliseconds."
  []
  (let [start-ns (System/nanoTime)]
    (embed-texts ["warm-up probe"])
    (let [elapsed-ms (quot (- (System/nanoTime) start-ns) 1000000)]
      (log/info "In-process embedder warm-up took" elapsed-ms "ms")
      elapsed-ms)))
