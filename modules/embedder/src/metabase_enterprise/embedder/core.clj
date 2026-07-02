(ns metabase-enterprise.embedder.core
  "In-process text embedder running inside the Metabase JVM via DJL + ONNX Runtime.
  Serves multiple models keyed by name, so consumers with their own embedding settings (semantic search,
  the library entity index, the complexity-score synonym axis) can each pick a model; the bundled default
  is sentence-transformers/all-MiniLM-L6-v2 (384-dim, mean-pooled, L2-normalized).

  This module is deliberately not part of the core uberjar: it ships as a separate plugin jar
  (metabase-embedder-plugin.jar) that the plugin loader adds to the classpath at boot, and
  `metabase-enterprise.semantic-search.embedding` resolves it dynamically when the `in-process` provider
  is selected.
  Nothing here is loaded — and none of the ~430 MB DJL/ONNX Runtime native init is paid — until the first
  embedding is requested."
  (:require
   [metabase-enterprise.embedder.model :as embedder.model]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def default-model-descriptor
  "Identity of the bundled default model.
  Single source of truth for callers wiring this embedder into provider/model metadata, so their labels
  can't drift from what the JVM actually loads."
  {:provider         "in-process"
   :model-name       embedder.model/default-model-name
   :model-dimensions 384})

(defn embed-texts
  "Embed `texts` (a seq of strings) with `model-name` → vector of float-array embeddings, in input order.
  The first call for a given model loads it (paying the one-time DJL/ONNX Runtime native init on the very
  first load) and keeps it resident."
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
