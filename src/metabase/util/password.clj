(ns metabase.util.password
  (:require [metabase.config :as config]))

(defn- count-occurrences
  "Takes in a Character predicate function which is applied to all characters in the supplied string and uses
   map/reduce to count the number of characters which return `true` for the given predicate function."
  [f ^String s]
  {:pre [(fn? f)
         (string? s)]}
  (reduce + (map #(if (f %) 1 0) s)))

(def ^:private ^:const complexity->min-counts
  {:weak   {:lower 1, :upper 1, :digit 1, :special 0}
   :normal {:lower 1, :upper 1, :digit 1, :special 1}
   :strong {:lower 2, :upper 1, :digit 2, :special 1}})

(def ^:private ^:const char-type->pred-fn
  {:lower   #(Character/isLowerCase ^java.lang.Character %)
   :upper   #(Character/isUpperCase ^java.lang.Character %)
   :digit   #(Character/isDigit ^java.lang.Character %)
   :special #(not (Character/isLetterOrDigit ^java.lang.Character %))})

(defn is-complex?
  "Check if a given password meets complexity standards for the application."
  [^String password]
  {:pre [(string? password)]}
  (when (>= (count password) (config/config-int :mb-password-length))
    (->> (complexity->min-counts (config/config-kw :mb-password-complexity))
         (map (fn [[char-type min-count]]
                (>= (count-occurrences (char-type->pred-fn char-type) password)
                    min-count)))
         (reduce #(and %1 %2)))))
