(ns metabase.util.match.impl
  "Internal implementation of the MBQL `match` and `replace` macros. Don't use these directly."
  (:refer-clojure :exclude [mapv get-in empty?])
  (:require
   [metabase.util.performance :refer [mapv get-in empty?]]))

(defn update-in-unless-empty
  "Like `update-in`, but only updates if the existing value is non-empty."
  [m ks f]
  (if (empty? (get-in m ks))
    m
    (update-in m ks f)))

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

(defn match-one-in-collection
  "Internal impl for `match-one`. If `form` is a collection, call `match-fn` to recursively look for matches in it.
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

(defn replace-in-collection
  "Internal impl for `replace`. Recursively replace values in a collection using a `replace-fn`."
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
