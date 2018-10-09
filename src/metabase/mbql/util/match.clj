(ns metabase.mbql.util.match
  "Internal implementation of the MBQL `match` and `replace` macros. Don't use these directly."
  (:refer-clojure :exclude [replace])
  (:require [clojure.core.match :as match]
            [clojure.walk :as walk]))

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
    [[pattern '& '_]]

    (and (set? pattern) (every? keyword? pattern))
    [[`(:or ~@pattern) '& '_]]

    ;; if pattern is a symbol, assume it's either a predicate function or a class
    (symbol? pattern)
    `[(~'_ :guard (match-with-pred-or-class ~pattern))]

    :else
    [pattern]))

(defn- recur-form? [form]
  (and (seq? form)
       (= 'recur (first form))))

(defn- rewrite-recurs [result-form]
  (walk/postwalk
   (fn [form]
     (if (recur-form? form)
       `(~'recur ~'&parents ~@(rest form))
       form))
   result-form))

(defn- generate-patterns-and-results
  {:style/indent 1}
  [patterns-and-results & {:keys [wrap-result-forms?]}]
  (reduce
   concat
   (for [[pattern result] (partition 2 2 ['&match] patterns-and-results)]
     [(generate-pattern pattern) (let [result (rewrite-recurs result)]
                                   (if (or (not wrap-result-forms?)
                                           (recur-form? result))
                                     result
                                     [result]))])))


;;; --------------------------------------------------- match-impl ---------------------------------------------------

(defn match-in-collection
  "Internal impl for `match`. If `form` is a collection, call `match-fn` to recursively look for matches in it."
  [match-fn parents form]
  (cond
    (map? form)
    (reduce concat (for [[k v] form]
                     (match-fn (conj parents k) v)))

    (sequential? form)
    (mapcat (partial match-fn (if (keyword? (first form))
                                (conj parents (first form))
                                parents))
            form)))

(defmacro match
  "Internal impl for `match`. Generate a pattern-matching function using `core.match`, and call it with `form`."
  [form patterns-and-results]
  `(seq
    (filter
     some?
     ((fn match# [~'&parents ~'&match]
        (match/match [~'&match]
          ~@(generate-patterns-and-results patterns-and-results, :wrap-result-forms? true)
          :else (match-in-collection match# ~'&parents ~'&match)))
      []
      ~form))))


;;; -------------------------------------------------- replace impl --------------------------------------------------

(defn replace-in-collection
  "Inernal impl for `replace`. Recursively replace values in a collection using a `replace-fn`."
  [replace-fn parents form]
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

(defmacro replace
  "Internal implementation for `replace`. Generate a pattern-matching function with `core.match`, and use it to replace
  matching values in `form`."
  [form patterns-and-results]
  `((fn replace# [~'&parents ~'&match]
      (match/match [~'&match]
        ~@(generate-patterns-and-results patterns-and-results, :wrap-result-forms? false)
        :else (replace-in-collection replace# ~'&parents ~'&match)))
    []
    ~form))
