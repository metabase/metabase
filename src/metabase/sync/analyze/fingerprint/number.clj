(ns metabase.sync.analyze.fingerprint.number
  "Logic for generating a `NumberFingerprint` from a sequence of values for a `:type/Number` Field."
  (:require [kixi.stats.core :as stats]
            [metabase.sync.interface :as i]
            [schema.core :as s]))

(s/defn ^:always-validate number-fingerprint :- i/NumberFingerprint
  "Generate a fingerprint containing information about values that belong to a `:type/Number` Field."
  [values :- i/FieldSample]
  {:min (apply min values)
   :max (apply max values)
   :avg (transduce (map double) stats/mean values)})
