(ns metabase.util.regex
  "Regex-related utility functions"
  (:require
   [clojure.string :as str]
   [clojure.core.memoize :as memoize]))

(defn non-capturing-group
  "Wrap regex `pattern` in a non-capturing group."
  [pattern]
  (re-pattern (format "(?:%s)" pattern)))

(defn re-or
  "Combine regex `patterns` into a single pattern by joining with or (i.e., a logical disjunction)."
  [patterns]
  (non-capturing-group (str/join "|" (map non-capturing-group patterns))))

(defn re-optional
  "Make regex `pattern` optional."
  [pattern]
  (str (non-capturing-group pattern) "?"))

(defn re-negate
  "Make regex `pattern` negated."
  [pattern]
  (str "(?!" (non-capturing-group pattern) "$).*"))

(defmulti ^:private rx-dispatch
  {:arglists '([listt])}
  first)

(declare rx*)

(defmethod rx-dispatch :default [x] x)

(defmethod rx-dispatch :?
  [[_ & args]]
  (re-optional (rx* (into [:and] args))))

(defmethod rx-dispatch :or
  [[_ & args]]
  (re-or (map rx* args)))

(defmethod rx-dispatch :and
  [[_ & args]]
  (apply str (map rx* args)))

(defmethod rx-dispatch :not
  [[_ arg]]
  (re-negate arg))

(defn rx*
  [x]
  (if (seqable? x) (rx-dispatch x) x))

(def rx
  (memoize
   (fn ^{:doc
         "A quick-and-dirty port of the Emacs Lisp `rx` macro (`C-h f rx`) implemented as a function but not currently as fully-featured.
          Convenient for building mega-huge regular expressions from a hiccup-like representation.
          Feel free to add support for more stuff as needed."}
     rx


     ;; (rx [:and [:or "Cam" "can"] [:? #"\s+"] #"\d+"])
     ;; -> #\"(?:(?:Cam)|(?:can))(?:\s+)?\d+\"

     ([x] (re-pattern (rx* x)))

     ([x & more] (rx (into [:and x] more))))))
