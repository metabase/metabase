(ns metabase-enterprise.embedder.core
  "In-process text embedder running inside the Metabase JVM via DJL + ONNX Runtime.
  Serves multiple models keyed by name, so consumers with their own embedding settings can each pick one.
  Outputs are L2-normalized.

  This module is deliberately not part of the core uberjar: it ships as a separate plugin jar
  (metabase-embedder-plugin.jar) that the plugin loader adds to the classpath at boot, and
  `metabase-enterprise.semantic-search.embedding` resolves it dynamically when the `in-process` provider
  is selected. Nothing here is loaded — and none of the DJL/ONNX Runtime native initialization cost is
  paid — until the first embedding is requested.
  See `modules/embedder/README.md` for the bundled models and configuration."
  (:require
   [metabase-enterprise.embedder.model :as embedder.model]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def default-model-descriptor
  "Identity of the bundled default model; wire provider/model metadata from here rather than restating it.
  `:model-dimensions` is maintained by hand; the integration test checks it against the loaded model's
  actual output width."
  {:provider         "in-process"
   :model-name       embedder.model/default-model-name
   :model-dimensions 1024})

(defn embed-texts
  "Embed `texts` (a seq of strings) with `model-name` → vector of float-array embeddings, in input order.
  The first call for a given model loads it and keeps it resident; the very first load also pays the
  one-time DJL/ONNX Runtime native init."
  [model-name texts]
  (embedder.model/embed-texts model-name texts))

(defn warm-up!
  "Load a model and run a probe embedding, so load costs are paid at a chosen moment rather than on the
  first real indexing run.
  Returns elapsed milliseconds."
  ([]
   (warm-up! (:model-name default-model-descriptor)))
  ([model-name]
   (let [start-ns (System/nanoTime)]
     (embed-texts model-name ["warm-up probe"])
     (let [elapsed-ms (quot (- (System/nanoTime) start-ns) 1000000)]
       (log/info "In-process embedder warm-up for" model-name "took" elapsed-ms "ms")
       elapsed-ms))))
