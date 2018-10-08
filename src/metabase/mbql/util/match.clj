(ns metabase.mbql.util.match
  "Internal implementation of the MBQL `match` and `replace` macros. Don't use these directly."
  (:refer-clojure :exclude [replace])
  (:require [clojure.core.match :as match]
            [clojure.tools.logging :as log]))

(defn match-with-pred-or-class
  "Return a function to use for pattern matching via `core.match`'s `:guard` functionality based on the value of a
  `pred-or-class` passed in as a pattern to `match` or `replace`."
  [pred-or-class]
  (cond
    (class? pred-or-class)
    (partial instance? pred-or-class)

    (fn? pred-or-class)
    pred-or-class

    :else
    ;; this is dev-specific so we don't need to localize it
    (throw (IllegalArgumentException. "Invalid pattern: don't know how to handle symbol."))))

(defn- generate-pattern
  "Generate an approprate pattern for use with core.match based on the `pattern` input passed into `match` or `replace`.
  This pattern will always include an alias to the entire match as `&match`."
  [pattern]
  (cond
    (keyword? pattern)
    `[([~pattern ~'& ~'_] :seq) :as ~'&match]

    (and (set? pattern) (every? keyword? pattern))
    `[([(:or ~@pattern) ~'& ~'_] :seq) :as ~'&match]

    (vector? pattern)
    `[(~pattern :seq) :as ~'&match]

    ;; if pattern is a symbol, assume it's either a predicate function or a class
    (symbol? pattern)
    `[(~'&match :guard (match-with-pred-or-class ~pattern))]

    :else
    [pattern]))

;;; --------------------------------------------------- match-impl ---------------------------------------------------

(defn match-in-collection
  "Internal impl for `match`. If `form` is a collection, call `match-fn` to recursively look for matches in it."
  [parents match-fn form]
  (cond
    (map? form)
    (reduce concat (for [[k v] form]
                     (match-fn (conj parents k) v)))

    (sequential? form)
    (mapcat (partial match-fn (if (keyword? (first form))
                                (conj parents (first form))
                                parents))
            form)))

(defmacro match*
  "Internal impl for `match`. Generate a pattern-matching function using `core.match`, and call it with `form`."
  [pattern form result]
  `((fn match-fn# [~'&parents form#]
      (match/match [form#]
        ~pattern [~(if result
                     result
                     '&match)]
        :else (match-in-collection ~'&parents match-fn# form#)))
    []
    ~form))

(defmacro match-including-subclauses*
  "Internal impl for `match-including-subclauses`. Same as `match*`, but the pattern matching function recurses on its
  results as well."
  [pattern form result]
  (let [match-fn-symb (gensym "match-fn")]
    `((fn ~match-fn-symb [~'&parents form#]
        (match/match [form#]
          ~pattern (let [result# ~(if result result '&match)]
                     (cons result# (match-in-collection ~'&parents ~match-fn-symb result#)))
          :else (match-in-collection ~'&parents ~match-fn-symb form#)))
      []
      ~form)))

(defmacro match-with
  "Internal impl for `match`. Handle patterns wrapped in maps appropriately, then use `match-macro` to do the rest."
  [match-macro pattern form result]
  (if (map? pattern)
    (let [form-symb (gensym "form")]
      `(let [~form-symb ~form]
         (concat ~@(for [[k v] pattern]
                     `(match-with ~match-macro ~(get pattern k) (get ~form-symb ~k) ~result)))))
    `(seq (filter some? (~match-macro ~(generate-pattern pattern) ~form ~result)))))

(defmacro match
  "Internal impl for `match`."
  [pattern form result]
  `(match-with match* ~pattern ~form ~result))

(defmacro match-including-subclauses
  "Internal impl for `metabase.mbql.util/match-including-subclauses`."
  [pattern form result]
  `(match-with match-including-subclauses* ~pattern ~form ~result))


;;; -------------------------------------------------- replace impl --------------------------------------------------

(defn replace-in-collection
  "Inernal impl for `replace`. Recursively replace values in a collection using a `replace-fn`."
  [parents replace-fn form]
  (cond
    (map? form)
    (into (empty form) (for [[k v] form]
                         [k (replace-fn (conj parents k) v)]))

    (sequential? form)
    (mapv (partial replace-fn (if (keyword? (first form))
                                (conj parents (first form))
                                parents))
          form)
    :else              form))

(defmacro replace*
  "Internal implementation for `replace`. Generate a pattern-matching function with `core.match`, and use it to replace
  matching values in `form`."
  [form pattern result]
  `((fn replace-fn# [~'&parents form#]
      (match/match [form#]
        ~(generate-pattern pattern) ~result
        :else (replace-in-collection ~'&parents replace-fn# form#)))
    []
    ~form))

(defmacro replace
  "Internal impl for `metabase.mbql.util/replace`. Handle patterns wrapped in maps appropriately, then call `replace*`
  to do the rest."
  [form pattern result]
  (if (map? pattern)
    `(-> ~form
         ~@(for [[k v] pattern]
             `(update ~k #(replace % ~v ~result))))
    `(replace* ~form ~pattern ~result)))
