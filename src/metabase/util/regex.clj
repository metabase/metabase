(ns metabase.util.regex
  "Regex-related utility functions"
  (:require
   [clojure.string :as str]))

(defn non-capturing-group
  "Wrap regex `pattern` in a non-capturing group."
  [pattern]
  (re-pattern (str "(?:" pattern ")")))

(defn- atomic-group [pattern]
  (str "(?>" pattern ")"))

(defn- capturing-group [pattern]
  (str "(" pattern ")"))

(defn re-or
  "Combine regex `patterns` into a single pattern by joining with or (i.e., a logical disjunction)."
  [patterns]
  (non-capturing-group (str/join "|" (map non-capturing-group patterns))))

(defn re-optional
  "Make regex `pattern` optional."
  [pattern]
  (str (non-capturing-group pattern) "?"))

(defn re-optional-non-greedy
  "Make regex `pattern` optional."
  [pattern]
  (str (non-capturing-group pattern) "??"))

(defn- re-optional-possessive [pattern]
  (str (non-capturing-group pattern) "?+"))

(defn re-negate
  "Make regex `pattern` negated."
  [pattern]
  (str "(?!" pattern ")"))

(defn- zero-or-more
  [pattern]
  (str pattern "*"))

(defn- zero-or-more-non-greedy
  [pattern]
  (str pattern "*?"))

(defn- one-or-more
  [pattern]
  (str pattern "+"))

(defn- one-or-more-possessive
  [pattern]
  (str pattern "++"))

(defn- one-or-more-non-greedy
  [pattern]
  (str pattern "+?"))

(defn- re-range [arg min-occurrences max-occurrences]
  (format "%s{%d,%d}" arg (or min-occurrences "") (or max-occurrences "")))

(defmulti ^:private rx-dispatch
  {:arglists '([listt])}
  first)

(declare rx*)

(defmethod rx-dispatch :default [x] x)

(defmethod rx-dispatch :?
  [[_ & args]]
  (re-optional (rx* (cons :and args))))

(defmethod rx-dispatch :optional
  [[_ & args]]
  (re-optional (rx* (cons :and args))))

(defmethod rx-dispatch :optional-non-greedy
  [[_ & args]]
  (re-optional-non-greedy (rx* (cons :and args))))

(defmethod rx-dispatch :optional-possessive
  [[_ & args]]
  (re-optional-possessive (rx* (cons :and args))))

(defmethod rx-dispatch :or
  [[_ & args]]
  (re-or (map rx* args)))

(defmethod rx-dispatch :and
  [[_ & args]]
  (apply str (map rx* args)))

(defmethod rx-dispatch :not
  [[_ & args]]
  (re-negate (rx* (cons :and args))))

(defmethod rx-dispatch :non-capturing-group
  [[_ & args]]
  (non-capturing-group (rx* (cons :and args))))

(defmethod rx-dispatch :atomic-group
  [[_ & args]]
  (atomic-group (rx* (cons :and args))))

(defmethod rx-dispatch :capturing-group
  [[_ & args]]
  (capturing-group (rx* (cons :and args))))

(defmethod rx-dispatch :zero-or-more
  [[_ & args]]
  (zero-or-more (rx* (cons :and args))))

(defmethod rx-dispatch :zero-or-more-non-greedy
  [[_ & args]]
  (zero-or-more-non-greedy (rx* (cons :and args))))

(defmethod rx-dispatch :one-or-more
  [[_ & args]]
  (one-or-more (rx* (cons :and args))))

(defmethod rx-dispatch :one-or-more-possessive
  [[_ & args]]
  (one-or-more-possessive (rx* (cons :and args))))

(defmethod rx-dispatch :one-or-more-non-greedy
  [[_ & args]]
  (one-or-more-non-greedy (rx* (cons :and args))))

(defmethod rx-dispatch :range
  [[_ arg min-occurrences max-occurrences]]
  (re-range arg min-occurrences max-occurrences))

(defn- rx*
  [x]
  (if (seqable? x) (rx-dispatch x) x))

;;; TODO -- instead of memoizing this, why not just do this as a macro and do it at macroexpansion time? Weird.
(def ^{:doc
       "A quick-and-dirty port of the Emacs Lisp `rx` macro (`C-h f rx`) implemented as a function but not currently as fully-featured.
       Convenient for building mega-huge regular expressions from a hiccup-like representation.
       Feel free to add support for more stuff as needed.

       This is memoized because arguments to rx are less optimal than they should be, in favor of better clarity -- hence skipping recompilation makes sense."
       :arglists '([x] [x & more])} rx
  (memoize (fn  rx
             ;; (rx [:and [:or "Cam" "can"] [:? #"\s+"] #"\d+"])
             ;; -> #\"(?:(?:Cam)|(?:can))(?:\s+)?\d+\"

             ([x] (re-pattern (rx* x)))

             ([x & more] (rx (into [:and x] more))))))
