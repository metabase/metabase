(ns metabase.models.revision.diff
  (:require
   [clojure.core.match :refer [match]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defn- diff-strings* [k v1 v2 identifier]
  (match [k v1 v2]
    [:name _ _]
    (deferred-tru "renamed {0} from \"{1}\" to \"{2}\"" identifier v1 v2)

    [:description nil _]
    (deferred-tru "added a description")

    [:description (_ :guard some?) _]
    (deferred-tru "changed the description")

    [:private true false]
    (deferred-tru "made {0} public" identifier)

    [:private false true]
    (deferred-tru "made {0} private" identifier)

    [:archived false true]
    (deferred-tru "unarchived this")

    [:archived true false]
    (deferred-tru "archived this")

    [:dataset false true]
    (deferred-tru "turned this into a model")

    [:dataset false false]
    (deferred-tru "changed this from a model to a saved question")

    [:display _ _]
    (deferred-tru "changed the display from {0} to {1}" v1 v2)

    [:result_metadata _ _]
    (deferred-tru "edited the metadata")

    [:dataset_query _ _]
    (deferred-tru "modified the query")

    [:visualization_settings _ _]
    (deferred-tru "changed the visualization settings")

    :else nil))

(defn build-sentence
  "Join parts of a sentence together to build a compound one."
  [parts]
  (when (seq parts)
    (cond
      (= (count parts) 1) (str (first parts) \.)
      (= (count parts) 2) (str (first parts) " " (deferred-tru "and")  " " (second parts) \.)
      :else               (str (first parts) ", " (build-sentence (rest parts))))))

(defn diff-strings
  "Create a seq of string describing how `o1` is different from `o2`.
  The directionality of the statement should indicate that `o1` changed into `o2`."
  [model before after]
  (let [ks (keys (or after before))]
    (filter identity
            (map-indexed (fn [i k]
                           (diff-strings* k (k before) (k after)
                                          (if (zero? i) (deferred-tru "this {0}" model) (deferred-tru "it")))) ks))))
