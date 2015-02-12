(ns metabase.util
  "Common utility functions useful throughout the codebase."
  (:require [medley.core :refer :all]))

(defn select-non-nil-keys
  "Like `select-keys` but filters out key-value pairs whose value is nil."
  [m & keys]
  (->> (select-keys m keys)
       (filter-vals identity)))

(defmacro fn->
  "Returns a function that threads arguments to it through FORMS via `->`."
  [& forms]
  `(fn [x#]
     (-> x#
         ~@forms)))

(defmacro fn->>
  "Returns a function that threads arguments to it through FORMS via `->>`."
  [& forms]
  `(fn [x#]
     (->> x#
          ~@forms)))

(defn regex?
  "Is ARG a regular expression?"
  [arg]
  (= (type arg)
     java.util.regex.Pattern))

(defn regex=
  "Returns `true` if the literal string representations of REGEXES are exactly equal.

    (= #\"[0-9]+\" #\"[0-9]+\")           -> false
    (regex= #\"[0-9]+\" #\"[0-9]+\")      -> true
    (regex= #\"[0-9]+\" #\"[0-9][0-9]*\") -> false (although it's theoretically true)"
  [& regexes]
  (->> regexes
       (map #(.toString ^java.util.regex.Pattern %))
       (apply =)))

(defn self-mapping
  "Given a function F that takes a single arg, return a function that will call `(f arg)` when
  passed a non-sequential ARG, or `(map f arg)` when passed a sequential ARG.

    (def f (self-mapping (fn [x] (+ 1 x))))
    (f 2)       -> 3
    (f [1 2 3]) -> (2 3 4)"
  [f & args]
  (fn [arg]
    (if (sequential? arg) (map f arg)
        (f arg))))

;; looking for `apply-kwargs`?
;; turns out `medley.core/mapply` does the same thingx
