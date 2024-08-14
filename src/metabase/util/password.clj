(ns metabase.util.password
  "Utility functions for checking passwords against hashes and for making sure passwords match complexity requirements."
  (:require
   [clojure.java.io :as io]
   [metabase.config :as config]
   [metabase.util :as u])
  (:import
   (org.mindrot.jbcrypt BCrypt)))

(set! *warn-on-reflection* true)

(defn- count-occurrences
  "Return a map of the counts of each class of character for `password`.

    (count-occurrences \"GoodPw!!\")
      -> {:total 8, :lower 4, :upper 2, :letter 6, :digit 0, :special 2}"
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
  (let [occurences (count-occurrences password)]
    (boolean (loop [[[char-type min-count] & more] (seq char-type->min)]
               (if-not char-type true
                 (when (>= (occurences char-type) min-count)
                   (recur more)))))))

(defn active-password-complexity
  "The currently configured description of the password complexity rules being enforced"
  []
  (merge (complexity->char-type->min (config/config-kw :mb-password-complexity))
         ;; Setting MB_PASSWORD_LENGTH overrides the default :total for a given password complexity class
         (when-let [min-len (config/config-int :mb-password-length)]
           {:total min-len})))

(defn- is-complex?
  "Check if a given password meets complexity standards for the application."
  [password]
  (password-has-char-counts? (active-password-complexity) password))

(def ^java.net.URL common-passwords-url
  "A set of ~12k common passwords to reject, that otherwise meet Metabase's default complexity requirements.
  Sourced from Dropbox's zxcvbn repo: https://github.com/dropbox/zxcvbn/blob/master/data/passwords.txt"
  (io/resource "common_passwords.txt"))

(defn- is-uncommon?
  "Check if a given password is not present in the common passwords set. Case-insensitive search since
  the list only contains lower-case passwords."
  [password]
  (with-open [is (.openStream common-passwords-url)
              reader (java.io.BufferedReader. (java.io.InputStreamReader. is))]
    (not-any?
      (partial = (u/lower-case-en password))
      (iterator-seq (.. reader lines iterator)))))

(defn is-valid?
  "Check that a password both meets complexity standards, and is not present in the common passwords list.
  Common password list is ignored if minimum password complexity is set to :weak"
  [password]
  (and (is-complex? password)
       (or (= (config/config-kw :mb-password-complexity) :weak)
           (is-uncommon? password))))

(def ^:private default-bcrypt-work-factor
  "Default work factor used for hashing passwords with BCrypt. Intentionally minimal for tests to reduce testing time."
  (if config/is-test?
    ;; 4 is the minimum supported value by jbcrypt library.
    4
    10))

;; copied from cemerick.friend.credentials EPL v1.0 license
(defn hash-bcrypt
  "Hashes a given plaintext password using bcrypt and an optional
   :work-factor (defaults to 10 as of this writing).  Should be used to hash
   passwords included in stored user credentials that are to be later verified
   using `bcrypt-credential-fn`."
  [password & {:keys [work-factor]}]
  (BCrypt/hashpw password (if work-factor
                            (BCrypt/gensalt work-factor)
                            (BCrypt/gensalt default-bcrypt-work-factor))))

(defn bcrypt-verify
  "Returns true if the plaintext [password] corresponds to [hash],
the result of previously hashing that password."
  [password hash]
  (BCrypt/checkpw password hash))

(defn verify-password
  "Verify if a given unhashed password + salt matches the supplied hashed-password. Returns `true` if matched, `false`
  otherwise."
  ^Boolean [password salt hashed-password]
  ;; we wrap the friend/bcrypt-verify with this function specifically to avoid unintended exceptions getting out
  (boolean (u/ignore-exceptions
             (bcrypt-verify (str salt password) hashed-password))))
