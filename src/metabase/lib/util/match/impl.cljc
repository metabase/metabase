(ns metabase.lib.util.match.impl
  "Internal implementation of the MBQL `match` and `replace` macros. Don't use these directly."
  (:refer-clojure :exclude [mapv get-in])
  (:require
   [metabase.util.performance :refer [mapv get-in]]))

;; have to do this at runtime because we don't know if a symbol is a class or pred or whatever when we compile the macro
(defn match-with-pred-or-class
  "Return a function to use for pattern matching via `core.match`'s `:guard` functionality based on the value of a
  `pred-or-class` passed in as a pattern to `match` or `replace`.

  (Class-based matching currently only works in Clojure. For ClojureScript, only predicate function matching works.)"
  [pred-or-class]
  (cond
    ;; If this function is ever used from JS, we need to figure out how to do this
    #?@(:clj [(class? pred-or-class)
              (partial instance? pred-or-class)])

    (fn? pred-or-class)
    pred-or-class

    :else
    ;; this is dev-specific so we don't need to localize it
    (throw (ex-info "Invalid pattern: don't know how to handle symbol." {:symbol pred-or-class}))))

(defn match-in-collection
  "Internal impl for `match`. If `form` is a collection, call `match-fn` to recursively look for matches in it."
  [match-fn clause-parents form]
  {:pre [(fn? match-fn) (vector? clause-parents)]}
  (cond
    (map? form)
    (reduce-kv (fn [acc k v]
                 (if-let [match (match-fn (conj clause-parents k) v)]
                   ;; Deliberately not using into to avoid converting to transient and back.
                   (reduce conj acc match)
                   acc))
               [] form)

    (sequential? form)
    (let [fst (first form)
          k (if (keyword? fst)
              (conj clause-parents fst)
              clause-parents)]
      (reduce (fn [acc v]
                (if-let [match (match-fn k v)]
                  (reduce conj acc match)
                  acc))
              [] form))))

(defn replace-in-collection
  "Internal impl for `replace`. Recursively replace values in a collection using a `replace-fn`."
  [replace-fn clause-parents form]
  (cond
    (map? form)
    (reduce-kv (fn [form k v]
                 (assoc form k (replace-fn (conj clause-parents k) v)))
               form form)

    (sequential? form)
    (mapv (partial replace-fn (if (keyword? (first form))
                                (conj clause-parents (first form))
                                clause-parents))
          form)
    :else              form))

(defn update-in-unless-empty
  "Like `update-in`, but only updates in the existing value is non-empty."
  [m ks f & args]
  (if-not (seq (get-in m ks))
    m
    (apply update-in m ks f args)))

(defn vector!
  "Return nil if `obj` is not a vector, otherwise return `obj`."
  [obj]
  (when (vector? obj) obj))

(defn map!
  "Return nil if `obj` is not a map, otherwise return `obj`."
  [obj]
  (when (map? obj) obj))

(defn count=
  "Return true if collection `coll` has precisely `cnt` elements in it."
  [coll cnt]
  (= (count coll) cnt))

(defn count>=
  "Return true if collection `coll` has `cnt` elements or more."
  [coll cnt]
  (>= (count coll) cnt))

(defn wrap-nil
  "If `value` is nil, return `::wrapped-nil`, otherwise return `value`."
  [value]
  (if (nil? value) ::wrapped-nil value))

(defn unwrap-nil
  "If `value` is `::wrapped-nil`, return nil, otherwise return `value`."
  [value]
  (when-not (= value ::wrapped-nil) value))

(defn- maybe-add-to-parents [clause-parents k]
  (if (and clause-parents k)
    (conj clause-parents k)
    clause-parents))

(defn match-lite-in-collection
  "Internal impl for `match-lite`. If `form` is a collection, call `match-fn` to recursively look for matches in it.
  `clause-parents` is a sequence of keywords naming the parent top-level keys and clauses of the match."
  [match-fn form clause-parents]
  {:pre [(fn? match-fn)]}
  (cond
    (map? form)
    (reduce-kv (fn [_ k v]
                 (when-some [match (match-fn v (maybe-add-to-parents clause-parents k))]
                   (reduced match)))
               nil form)

    (sequential? form)
    (reduce (fn [_ v]
              (let [fst (first form)]
                (when-some [match (match-fn v (maybe-add-to-parents clause-parents (when (keyword? fst) fst)))]
                  (reduced match))))
            nil form)))

(defn replace-lite-in-collection
  "Internal impl for `replace-lite`. Recursively replace values in a collection using a `replace-fn`."
  [replace-fn form clause-parents]
  (cond
    (map? form)
    (reduce-kv (fn [form k v]
                 (let [repl (replace-fn v (maybe-add-to-parents clause-parents k))]
                   (cond-> form
                     (not (identical? v form)) (assoc k repl))))
               form form)

    (sequential? form)
    (mapv #(let [fst (first form)]
             (replace-fn % (maybe-add-to-parents clause-parents (when (keyword? fst) fst))))
          form)

    :else form))
