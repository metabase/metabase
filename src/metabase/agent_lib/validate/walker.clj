(ns metabase.agent-lib.validate.walker
  "Pure traversal helpers for structured program validation."
  (:require
   [metabase.agent-lib.common.coercions :refer [normalize-map-key]]
   [metabase.agent-lib.common.errors :refer [invalid-program!]]
   [metabase.agent-lib.common.literals :refer [scalar-literal?]]
   [metabase.agent-lib.schema :as schema]))

(def max-operations
  "Maximum number of top-level operations allowed in a structured program."
  32)

(def max-depth
  "Maximum nesting depth allowed in a structured program."
  24)

(def max-node-count
  "Maximum total node count allowed in a structured program."
  600)

(def max-program-nesting
  "Maximum recursive program-source nesting depth (prevents circular references)."
  8)

(def max-string-length
  "Maximum length of any string value in a structured program."
  1024)

(set! *warn-on-reflection* true)

(defn find-tuple-path
  "Find the first path to a vector node matching `pred`.

  The local `walk` helper stays nested because this namespace is the recursive
  traversal boundary for validation."
  [pred value]
  (letfn [(walk [path node]
            (cond
              (and (vector? node) (pred node))
              path

              (vector? node)
              (some identity
                    (map-indexed (fn [idx child]
                                   (walk (conj path idx) child))
                                 node))

              (map? node)
              (if (schema/program-literal? node)
                (walk (conj path :program) (:program node))
                (some identity
                      (map (fn [[k v]]
                             (walk (conj path (normalize-map-key k)) v))
                           node)))

              (sequential? node)
              (some identity
                    (map-indexed (fn [idx child]
                                   (walk (conj path idx) child))
                                 node))

              :else
              nil))]
    (walk [] value)))

(defn walk-node
  "Walk a structured node in preorder, threading pure traversal state through `visit`."
  [path value depth state visit]
  (when (> depth max-depth)
    (invalid-program! path "program exceeds maximum nesting depth"))
  (let [state (update state :node-count (fnil inc 0))]
    (when (> (:node-count state) max-node-count)
      (invalid-program! path "program exceeds maximum node count"))
    (when (and (string? value) (> (count value) max-string-length))
      (invalid-program! path "string value exceeds maximum length"
                        {:length (count value) :max max-string-length}))
    (let [state (visit path value depth state)]
      (cond
        (scalar-literal? value)
        state

        (map? value)
        (if (schema/program-literal? value)
          state
          (reduce (fn [state [k v]]
                    (walk-node (conj path (normalize-map-key k)) v (inc depth) state visit))
                  state
                  value))

        (sequential? value)
        (reduce (fn [state [idx element]]
                  (walk-node (conj path idx) element (inc depth) state visit))
                state
                (map-indexed vector value))

        :else
        (invalid-program! path
                          (str "unsupported literal type " (pr-str (type value)))
                          {:value value})))))
