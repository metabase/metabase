(ns metabase-enterprise.data-complexity-score.test-util
  "Shared helpers for data-complexity-score tests."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.data-complexity-score.settings :as settings]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private setting-key
  "Map shorthand → full setting symbol for [[with-synonym-source]]."
  {:use-search-index? `settings/data-complexity-scoring-use-search-index-embedder
   :provider          `settings/data-complexity-scoring-synonym-embedding-provider
   :model-name        `settings/data-complexity-scoring-synonym-embedding-model
   :model-dimensions  `settings/data-complexity-scoring-synonym-embedding-model-dimensions})

(def ^:private synonym-source-defaults
  "Match the on-disk `:default` values in `settings.clj`. Keep in sync if those defaults move."
  {:use-search-index? false
   :provider          "ai-service"
   :model-name        "sentence-transformers/all-MiniLM-L6-v2"
   :model-dimensions  384})

(defmacro with-synonym-source
  "Pin every synonym-axis setting during `body` so tests don't depend on ambient state.

  `overrides` is a flat vector of `:key value :key value` pairs. Recognized keys:
    `:use-search-index?` — boolean; routes through the active pgvector index when true
    `:provider`          — provider string for the configured embedder path
    `:model-name`        — model name string
    `:model-dimensions`  — vector dimensions advertised for the model

  Anything left out falls back to the same defaults as a fresh instance.
  A bare `(with-synonym-source [] ...)` pretends nothing else has touched these settings."
  [overrides & body]
  (let [parsed   (apply hash-map overrides)
        unknown  (set/difference (set (keys parsed)) (set (keys setting-key)))
        _        (when (seq unknown)
                   (throw (ex-info (str "Unknown override keys: " unknown
                                        ". Allowed: " (set (keys setting-key)))
                                   {:unknown unknown})))
        merged   (merge synonym-source-defaults parsed)
        bindings (vec (mapcat (fn [[short-key value]]
                                [(get setting-key short-key) value])
                              merged))]
    `(mt/with-temporary-setting-values ~bindings ~@body)))
