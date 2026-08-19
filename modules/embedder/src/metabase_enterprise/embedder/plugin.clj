(ns metabase-enterprise.embedder.plugin
  "Manifest entry point for the in-process embedding provider."
  (:require
   [metabase-enterprise.embedder.catalog :as catalog]
   [metabase.classloader.core :as classloader]
   [metabase.embeddings.provider :as embeddings.provider]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def provider-name
  "Embedding provider ID registered by this plugin."
  "in-process")

(def max-batch-size
  "Maximum number of texts passed to one padded local inference batch."
  32)

;; This artifact contains the complete model and tokenizer, so DJL never needs network access. Set both DJL 0.36
;; controls before loading any DJL class: offline mode prevents dependency/model downloads, and tracking opt-out
;; prevents its default EC2 metadata probe and telemetry request.
(System/setProperty "ai.djl.offline" "true")
(System/setProperty "OPT_OUT_TRACKING" "true")

(defn- readiness
  [{:keys [model-name vector-dimensions]}]
  (let [model-name (or model-name catalog/default-model-name)
        runtime    (catalog/runtime-readiness)
        spec       (catalog/model-spec model-name)]
    (cond
      (not (:ready? runtime))
      runtime

      (nil? spec)
      {:ready? false :reason :model-not-bundled}

      (and vector-dimensions (not= vector-dimensions (:vector-dimensions spec)))
      {:ready? false :reason :vector-dimensions-mismatch}

      (not (catalog/bundle-present? model-name))
      {:ready? false :reason :model-bundle-missing}

      :else
      {:ready? true})))

(defn- model-fn
  [fn-name]
  ;; The manifest loads only this registration namespace. Keep DJL classes and native initialization out of startup;
  ;; resolve the implementation through the shared plugin classloader on first inference or explicit preparation.
  ;; `require` skips its classloader setup when the namespace is already loaded, so install it unconditionally for
  ;; callers running on thread pools that predate plugin initialization.
  (classloader/the-classloader)
  (classloader/require 'metabase-enterprise.embedder.model)
  (or (ns-resolve 'metabase-enterprise.embedder.model fn-name)
      (throw (ex-info (format "Embedder plugin model implementation does not define %s." fn-name)
                      {:provider provider-name :fn fn-name}))))

(defn- embed-texts
  [resolved-model texts _opts]
  (if (empty? texts)
    []
    (let [embed-batch (model-fn 'embed-batch)]
      (into []
            (mapcat #(embed-batch (:model-name resolved-model) %))
            (partition-all max-batch-size texts)))))

(defn- prepare!
  [resolved-model]
  (let [start-ns (System/nanoTime)]
    (embed-texts resolved-model ["warm-up probe"] {})
    (let [elapsed-ms (quot (- (System/nanoTime) start-ns) 1000000)]
      (log/info "In-process embedder warm-up took" elapsed-ms "ms")
      elapsed-ms)))

(embeddings.provider/register-provider!
 provider-name
 {:embedding-spi-version 1
  :readiness             readiness
  :resolve-model         catalog/resolved-model
  :embed-texts           embed-texts
  :prepare!              prepare!})
