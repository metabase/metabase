(ns metabase.sync.analyze.fingerprint.text
  "Logic for generating a `TextFingerprint` from a sequence of values for a `:type/Text` Field."
  (:require [cheshire.core :as json]
            [metabase.sync.interface :as i]
            [metabase.util :as u]
            [schema.core :as s]))

(s/defn ^:private ^:always-validate average-length :- (s/constrained Double #(>= % 0))
  "Return the average length of VALUES."
  [values :- i/ValuesSample]
  (let [total-length (reduce + (for [value values]
                                 (count (str value))))]
    (/ (double total-length)
       (double (count values)))))

(s/defn ^:private ^:always-validate percent-satisfying-predicate :- i/Percent
  "Return the percentage of VALUES that satisfy PRED."
  [pred :- (s/pred fn?), values :- i/ValuesSample]
  (let [total-count    (count values)
        pred           #(boolean (u/ignore-exceptions (pred %)))
        matching-count (count (get (group-by pred values) true []))]
    (/ (double matching-count)
       (double total-count))))

(defn- valid-serialized-json?
  "True if X is a serialized JSON dictionary or array."
  [x]
  (boolean
   (when-let [parsed-json (json/parse-string x)]
     (or (map? parsed-json)
         (sequential? parsed-json)))))

(s/defn ^:always-validate text-fingerprint :- i/TextFingerprint
  "Generate a fingerprint containing information about values that belong to a `:type/Text` Field."
  [values :- i/ValuesSample]
  {:percent-json   (percent-satisfying-predicate valid-serialized-json? values)
   :percent-url    (percent-satisfying-predicate u/is-url? values)
   :percent-email  (percent-satisfying-predicate u/is-email? values)
   :average-length (average-length values)})
