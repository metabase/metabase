(ns metabase-enterprise.semantic-layer.init
  "Startup wiring for the semantic-layer module.
  Currently only registers an optional development aid: if the `MB_PRINT_SEMANTIC_COMPLEXITY_SCORE` env
  var is truthy, the computed complexity score for this instance is printed once at boot."
  (:require
   [clojure.pprint :as pprint]
   [metabase-enterprise.semantic-layer.complexity :as complexity]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- truthy-env? [var-name]
  (let [v (System/getenv var-name)]
    (and (some? v)
         (re-matches #"(?i)^(1|true|yes|on)$" v))))

(defmethod startup/def-startup-logic! ::PrintSemanticComplexityScore [_]
  (when (truthy-env? "MB_PRINT_SEMANTIC_COMPLEXITY_SCORE")
    (try
      (log/info (str "Semantic complexity score:\n"
                     ;; `pprint` here is just string formatting for the logger.
                     ;; we never write to `*out*` directly, so the "use metabase.util.log" lint doesn't apply.
                     #_{:clj-kondo/ignore [:discouraged-var]}
                     (with-out-str (pprint/pprint (complexity/complexity-scores)))))
      (catch Throwable t
        (log/warn t "Failed to compute semantic complexity score at startup")))))
