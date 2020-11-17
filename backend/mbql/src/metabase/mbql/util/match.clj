(ns metabase.mbql.util.match
  "Internal implementation of the MBQL `match` and `replace` macros. Don't use these directly."
  (:refer-clojure :exclude [replace])
  (:require [clojure.core.match :as match]
            [clojure.walk :as walk]))

;; TODO - I'm not 100% sure we actually need to keep the `&parents` anaphor around, because nobody is actually using
;; it, which makes it dead weight

;; have to do this at runtime because we don't know if a symbol is a class or pred or whatever when we compile the macro
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
  "Generate a single approprate pattern for use with core.match based on the `pattern` input passed into `match` or
  `replace`. "
  [pattern]
  (cond
    (keyword? pattern)
    [[pattern '& '_]]

    (and (set? pattern) (every? keyword? pattern))
    [[`(:or ~@pattern) '& '_]]

    ;; special case for `_`, we'll let you match anything with that
    (= pattern '_)
    [pattern]

    (symbol? pattern)
    `[(~'_ :guard (match-with-pred-or-class ~pattern))]

    :else
    [pattern]))

(defn- recur-form? [form]
  (and (seq? form)
       (= 'recur (first form))))

(defn- rewrite-recurs
  "Replace any `recur` forms with ones that include the implicit `&parents` arg."
  [fn-name result-form]
  (walk/postwalk
   (fn [form]
     (if (recur-form? form)
       ;; we *could* use plain `recur` here, but `core.match` cannot apply code size optimizations if a `recur` form
       ;; is present. Instead, just do a non-tail-call-optimized call to the pattern fn so `core.match` can generate
       ;; efficient code.
       ;;
       ;; (recur [:new-clause ...]) ; -> (match-123456 &parents [:new-clause ...])
       `(~fn-name ~'&parents ~@(rest form))
       form))
   result-form))

(defn- generate-patterns-and-results
  "Generate the `core.match` patterns and results given the input to our macros.

  `wrap-result-forms?` will wrap the results parts of the pairs in a vector, so we do something like `(reduce concat)`
  on all of the results to return a sequence of matches for `match`."
  {:style/indent 1}
  [fn-name patterns-and-results & {:keys [wrap-result-forms?]}]
  (reduce
   concat
   (for [[pattern result] (partition 2 2 ['&match] patterns-and-results)]
     [(generate-pattern pattern) (let [result (rewrite-recurs fn-name result)]
                                   (if (or (not wrap-result-forms?)
                                           (and (seq? result)
                                                (= fn-name (first result))))
                                     result
                                     [result]))])))


;;; --------------------------------------------------- match-impl ---------------------------------------------------

(defn match-in-collection
  "Internal impl for `match`. If `form` is a collection, call `match-fn` to recursively look for matches in it."
  [match-fn clause-parents form]
  {:pre [(fn? match-fn) (vector? clause-parents)]}
  (cond
    (map? form)
    (reduce concat (for [[k v] form]
                     (match-fn (conj clause-parents k) v)))

    (sequential? form)
    (mapcat (partial match-fn (if (keyword? (first form))
                                (conj clause-parents (first form))
                                clause-parents))
            form)))

(defn- skip-else-clause?
  "If the last pattern passed in was `_`, we can skip generating the default `:else` clause, because it will never
  match."
  ;; TODO - why don't we just let people pass their own `:else` clause instead?
  [patterns-and-results]
  (= '_ (second (reverse patterns-and-results))))

(defmacro match
  "Internal impl for `match`. Generate a pattern-matching function using `core.match`, and call it with `form`."
  [form patterns-and-results]
  (let [match-fn-symb (gensym "match-")]
    `(seq
      (filter
       some?
       ((fn ~match-fn-symb [~'&parents ~'&match]
          (match/match [~'&match]
            ~@(generate-patterns-and-results match-fn-symb patterns-and-results, :wrap-result-forms? true)
            ~@(when-not (skip-else-clause? patterns-and-results)
                [:else `(match-in-collection ~match-fn-symb ~'&parents ~'&match)])))
        []
        ~form)))))


;;; -------------------------------------------------- replace impl --------------------------------------------------

(defn replace-in-collection
  "Inernal impl for `replace`. Recursively replace values in a collection using a `replace-fn`."
  [replace-fn clause-parents form]
  (cond
    (map? form)
    (into form (for [[k v] form]
                 [k (replace-fn (conj clause-parents k) v)]))

    (sequential? form)
    (mapv (partial replace-fn (if (keyword? (first form))
                                (conj clause-parents (first form))
                                clause-parents))
          form)
    :else              form))

(defmacro replace
  "Internal implementation for `replace`. Generate a pattern-matching function with `core.match`, and use it to replace
  matching values in `form`."
  [form patterns-and-results]
  (let [replace-fn-symb (gensym "replace-")]
    `((fn ~replace-fn-symb [~'&parents ~'&match]
        (match/match [~'&match]
          ~@(generate-patterns-and-results replace-fn-symb patterns-and-results, :wrap-result-forms? false)
          ~@(when-not (skip-else-clause? patterns-and-results)
              [:else `(replace-in-collection ~replace-fn-symb ~'&parents ~'&match)])))
      []
      ~form)))
