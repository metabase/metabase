(ns metabase.models.revision.diff
  (:require [clojure.core.match :refer [match]]
            [clojure.string :as s]))

(defn- diff-string* [t k v1 v2]
  (match [t k v1 v2]
    [_ :name _ _]
    (format "renamed it from \"%s\" to \"%s\"" v1 v2)

    [_ :private true false]
    "made it public"

    [_ :private false true]
    "made it private"

    [_ :updated_at _ _]
    nil

    [_ :dataset_query _ _]
    "modified the query"

    [_ :visualization_settings _ _]
    "changed the visualization settings"

    [_ _ _ _]
    (format "changed %s from \"%s\" to \"%s\"" (name k) v1 v2)))

(defn build-sentence
  "Join parts of a sentence together to build a compound one."
  [parts]
  (when (seq parts)
    (cond
      (= (count parts) 1) (str (first parts) \.)
      (= (count parts) 2) (format "%s and %s." (first parts) (second parts))
      :else               (format "%s, %s" (first parts) (build-sentence (rest parts))))))

(defn diff-string
  "Create a string describing how `o1` is different from `o2`.
   The directionality of the statement should indicate that `o1` changed into `o2`."
  [t before after]
  (when before
    (let [ks (keys before)]
      (some-> (filter identity (for [k ks]
                                 (diff-string* t k (k before) (k after))))
              build-sentence
              (s/replace-first #" it " (format " this %s " t))))))
