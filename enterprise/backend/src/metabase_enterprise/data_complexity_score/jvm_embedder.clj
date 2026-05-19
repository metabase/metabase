(ns metabase-enterprise.data-complexity-score.jvm-embedder
  "In-process synonym embedder backed by DJL + ONNX Runtime, running
  sentence-transformers/all-MiniLM-L6-v2 (384-dim, mean-pooled, L2-normalized).

  Drop-in replacement for [[complexity-embedders/provider-embedder]] for the
  data-complexity-score CLI proof of concept — same `entities -> {normalized-name -> ^floats}`
  contract, no HTTP service required.

  First invocation downloads the model from HuggingFace into `~/.djl.ai/` (~90 MB). The
  follow-up to ship this in production is to populate that cache at build time and load via
  `.optModelPath` from a classpath resource so the uberjar carries the weights."
  (:require
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders])
  (:import
   (ai.djl.huggingface.translator TextEmbeddingTranslatorFactory)
   (ai.djl.inference Predictor)
   (ai.djl.repository.zoo Criteria ZooModel)
   (java.util ArrayList)))

(set! *warn-on-reflection* true)

(def ^:private model-url
  "djl://ai.djl.huggingface.onnxruntime/sentence-transformers/all-MiniLM-L6-v2")

(def model-descriptor
  "Single source of truth for the in-process embedder's identity. The CLI reads this so its
  `:embedding-model-meta` field can't drift from whatever model the JVM is actually loading."
  {:provider         "in-process"
   :model-name       "all-MiniLM-L6-v2"
   :model-dimensions 384})

(def ^:private ^Class floats-class
  ;; `float[].class` isn't directly expressible in Clojure; resolve once.
  (Class/forName "[F"))

(defn- build-model ^ZooModel []
  (let [criteria (-> (Criteria/builder)
                     (.setTypes String floats-class)
                     (.optModelUrls model-url)
                     (.optEngine "OnnxRuntime")
                     (.optTranslatorFactory (TextEmbeddingTranslatorFactory.))
                     (.build))]
    (.loadModel criteria)))

;; `defonce` + `delay` permanently caches an exception thrown by `build-model` (e.g. a
;; transient HuggingFace 5xx or a network blip on first use). Once that happens, every later
;; `@model` in the same JVM re-throws the same error — recovery requires a JVM restart. CLI
;; runs are unaffected since the process exits, but a REPL/long-running JVM session is stuck.
;; The model download is also the airgap follow-up referenced in the ns docstring; both are
;; on the PoC follow-up list.
(defonce ^:private model
  (delay (build-model)))

(defn- embed-texts
  "Embed `texts` (a seq of strings) → vector of `float[384]` arrays, in input order."
  [texts]
  (with-open [predictor ^Predictor (.newPredictor ^ZooModel @model)]
    (vec (.batchPredict predictor (ArrayList. ^java.util.Collection texts)))))

(defn jvm-embedder
  "Build an in-JVM embedder for the synonym axis. Output map is keyed by normalized name with
  `^floats` values.

  [[embedders/normalize-name]] splits camelCase/snake_case/dotted/dashed names into
  English-word tokens, so the same string is both the dedup key and the embedding input."
  []
  (embedders/fn-embedder embed-texts))
