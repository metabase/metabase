(ns metabase.util.password
  (:require [cemerick.friend.credentials :as creds]
            [metabase.config :as config]))


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
        length     (config/config-int :mb-password-length)
        lowers     (count-occurrences #(Character/isLowerCase ^Character %) password)
        uppers     (count-occurrences #(Character/isUpperCase ^Character %) password)
        digits     (count-occurrences #(Character/isDigit ^Character %) password)
        specials   (count-occurrences #(not (Character/isLetterOrDigit ^Character %)) password)]
    (if-not (>= (count password) length) false
      (case complexity
        :weak   (and (> lowers 0) (> digits 0) (> uppers 0))                    ; weak   = 1 lower, 1 digit, 1 uppercase
        :normal (and (> lowers 0) (> digits 0) (> uppers 0) (> specials 0))     ; normal = 1 lower, 1 digit, 1 uppercase, 1 special
        :strong (and (> lowers 1) (> digits 0) (> uppers 1) (> specials 0)))))) ; strong = 2 lower, 1 digit, 2 uppercase, 1 special

(defn verify-password
  "Verify if a given unhashed password + salt matches the supplied hashed-password.  Returns true if matched, false otherwise."
  [password salt hashed-password]
  (try
    (creds/bcrypt-verify (str salt password) hashed-password)
    (catch Exception e
      ;; we wrap the friend/bcrypt-verify with this function specifically to avoid unintended exceptions getting out
      false)))
