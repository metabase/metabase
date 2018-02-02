(ns metabase.sync.analyze.fingerprint.datetime
  "Logic for generating a `DateTimeFingerprint` from a sequence of values for a `:type/DateTime` Field."
  (:require [metabase.sync.interface :as i]
            [schema.core :as s]))

(s/defn datetime-fingerprint :- i/DateTimeFingerprint
  "Generate a fingerprint containing information about values that belong to a `DateTime` Field."
  [values :- i/FieldSample]
  (let [[value & values] values]
    (zipmap [:earliest :latest]
            (reduce (fn [[earliest latest] dt]
                      (cond
                        (pos? (compare dt latest))   [earliest dt]
                        (neg? (compare dt earliest)) [dt latest]
                        :else                        [earliest latest]))
                    [value value]
                    values))))
