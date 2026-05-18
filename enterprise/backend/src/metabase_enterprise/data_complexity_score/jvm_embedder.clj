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

(defonce ^:private model
  (delay (build-model)))

(defn- embed-texts
  "Embed `texts` (a seq of strings) → vector of `float[384]` arrays, in input order."
  [texts]
  (with-open [predictor ^Predictor (.newPredictor ^ZooModel @model)]
    (vec (.batchPredict predictor (ArrayList. ^java.util.Collection (vec texts))))))

(defn jvm-embedder
  "Build an in-JVM embedder for the synonym axis. Output map is keyed by normalized name with
  `^floats` values.

  [[embedders/normalize-name]] splits camelCase/snake_case/dotted/dashed names into
  English-word tokens, so the same string is both the dedup key and the embedding input."
  []
  (embedders/fn-embedder embed-texts))
