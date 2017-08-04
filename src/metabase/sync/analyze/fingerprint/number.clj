(ns metabase.sync.analyze.fingerprint.number
  "Logic for generating a `NumberFingerprint` from a sequence of values for a `:type/Number` Field."
  (:require [metabase.sync.interface :as i]
            [schema.core :as s]))

(s/defn ^:private ^:always-validate average :- s/Num
  "Return the average of VALUES."
  [values :- i/ValuesSample]
  (/ (double (reduce + values))
     (double (count values))))

(s/defn ^:always-validate number-fingerprint :- i/NumberFingerprint
  "Generate a fingerprint containing information about values that belong to a `:type/Number` Field."
  [values :- i/ValuesSample]
  {:min (apply min values)
   :max (apply max values)
   :avg (average values)})
