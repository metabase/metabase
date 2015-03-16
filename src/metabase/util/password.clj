(ns metabase.util.password
  (:require [metabase.config :as config]))


(defn- count-occurrences
  "Takes in a Character predicate function which is applied to all characters in the supplied string and uses
   map/reduce to count the number of characters which return `true` for the given predicate function."
  [f s]
  {:pre [(fn? f)
         (string? s)]}
  (reduce + (map #(if (true? (f %)) 1 0) s)))


(defn is-complex?
  "Check if a given password meets complexity standards for the application."
  [password]
  {:pre [(string? password)]}
  (let [complexity (config/config-kw :mb-password-complexity)
        length (config/config-int :mb-password-length)
        lowers (count-occurrences #(Character/isLowerCase %) password)
        uppers (count-occurrences #(Character/isUpperCase %) password)
        digits (count-occurrences #(Character/isDigit %) password)
        specials (count-occurrences #(not (Character/isLetterOrDigit %)) password)]
    (if-not (>= (count password) length)
      false
      (case complexity
        ;; weak = 1 lower, 1 digit, 1 uppercase
        :weak (and (> lowers 0) (> digits 0) (> uppers 0))
        ;; normal = 1 lower, 1 digit, 1 uppercase, 1 special
        :normal (and (> lowers 0) (> digits 0) (> uppers 0) (> specials 0))
        ;; strong = 2 lower, 1 digit, 2 uppercase, 1 special
        :strong (and (> lowers 1) (> digits 0) (> uppers 1) (> specials 0))))))
