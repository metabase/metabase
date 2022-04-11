(ns metabase.util.regex
  "Regex-related utility functions"
  (:require [clojure.string :as str]))

(defn non-capturing-group
  "Wrap regex `pattern` in a non-capturing group."
  [pattern]
  (re-pattern (format "(?:%s)" pattern)))

(defn re-or
  "Combine regex `patterns` into a single pattern by joining with or (i.e., a logical disjunction)."
  [& patterns]
  (non-capturing-group (str/join "|" (map non-capturing-group patterns))))

(defn re-optional
  "Make regex `pattern` optional."
  [pattern]
  (str (non-capturing-group pattern) "?"))

(defmulti ^:private rx-dispatch
  {:arglists '([listt])}
  first)

(declare rx*)

(defmethod rx-dispatch :default
  [x]
  x)

(defmethod rx-dispatch 'opt
  [[_ expr]]
  `(re-optional (rx* ~expr)))

(defmethod rx-dispatch 'or
  [[_ & args]]
  `(re-or ~@(for [arg args]
              `(rx* ~arg))))

(defmethod rx-dispatch 'and
  [[_ & args]]
  `(str ~@(for [arg args]
            `(rx* ~arg))))

(defmacro rx*
  "Impl of `rx` macro."
  [x]
  (if (seqable? x)
    (rx-dispatch x)
    x))

(defmacro rx
  "Cam's quick-and-dirty port of the Emacs Lisp `rx` macro (`C-h f rx`) but not currently as fully-featured. Convenient
  macro for building mega-huge regular expressions from a sexpr representation.

    (rx (and (or \"Cam\" \"can\") (opt #\"\\s+\") #\"\\d+\"))
    ;; -> #\"(?:(?:Cam)|(?:can))\\s+?\\d+\"

  Feel free to add support for more stuff as needed.
  ([x]
   `(re-pattern (str (rx* ~x))))"

  ([x]
   `(re-pattern (rx* ~x)))

  ([x & more]
   `(rx (~'and ~x ~@more))))
