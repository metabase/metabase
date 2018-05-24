(ns metabase.util.password
  (:require [cemerick.friend.credentials :as creds]
            [metabase
             [config :as config]
             [util :as u]]))


(defn- count-occurrences
  "Return a map of the counts of each class of character for `password`.

    (count-occurrences \"GoodPw!!\")
      -> {:total  8, :lower 4, :upper 2, :letter 6, :digit 0, :special 2}"
  [password]
  (loop [[^Character c & more] password, counts {:total 0, :lower 0, :upper 0, :letter 0, :digit 0, :special 0}]
    (if-not c
      counts
      (recur more (let [counts (update counts :total inc)]
                    (cond
                      (Character/isLowerCase c) (-> (update counts :letter inc) (update :lower inc))
                      (Character/isUpperCase c) (-> (update counts :letter inc) (update :upper inc))
                      (Character/isDigit     c) (update counts :digit   inc)
                      :else                     (update counts :special inc)))))))

(def ^:private ^:const complexity->char-type->min
  "Minimum counts of each class of character a password should have for a given password complexity level."
  {:weak   {:total   6} ; total here effectively means the same thing as a minimum password length
   :normal {:total   6
            :digit   1}
   :strong {:total   8
            :lower   2
            :upper   2
            :digit   1
            :special 1}})

(defn- password-has-char-counts?
  "Check that PASSWORD satisfies the minimum count requirements for each character class.

    (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} \"abc\")
      -> false
    (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} \"passworD1!\")
      -> true"
  [char-type->min password]
  {:pre [(map? char-type->min)
         (string? password)]}
  (let [occurances (count-occurrences password)]
    (boolean (loop [[[char-type min-count] & more] (seq char-type->min)]
               (if-not char-type true
                 (when (>= (occurances char-type) min-count)
                   (recur more)))))))

(def active-password-complexity
  "The currently configured description of the password complexity rules being enforced"
  (merge (complexity->char-type->min (config/config-kw :mb-password-complexity))
         ;; Setting MB_PASSWORD_LENGTH overrides the default :total for a given password complexity class
         (when-let [min-len (config/config-int :mb-password-length)]
           {:total min-len})))

(def ^{:arglists '([password])} is-complex?
  "Check if a given password meets complexity standards for the application."
  (partial password-has-char-counts? active-password-complexity))


(defn verify-password
  "Verify if a given unhashed password + salt matches the supplied hashed-password. Returns `true` if matched, `false`
  otherwise."
  ^Boolean [password salt hashed-password]
  ;; we wrap the friend/bcrypt-verify with this function specifically to avoid unintended exceptions getting out
  (boolean (u/ignore-exceptions
             (creds/bcrypt-verify (str salt password) hashed-password))))
