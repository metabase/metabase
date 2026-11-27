(ns metabase.util.match.impl
  "Internal implementation of the MBQL `match` and `replace` macros. Don't use these directly."
  (:refer-clojure :exclude [get-in empty?])
  (:require
   [metabase.util.performance :as perf :refer [get-in empty?]]))

(defn update-in-unless-empty
  "Like `update-in`, but only updates if the existing value is non-empty."
  [m ks f]
  (if (empty? (get-in m ks))
    m
    (update-in m ks f)))

(defn sequential!
  "Return nil if `obj` is not a sequential collection (vector, list, seq), otherwise return `obj` unchanged."
  [obj]
  (when (sequential? obj) obj))

(defn drop-rest
  "Return the elements of a sequential `coll` after the first `n`, for the `& rest` part of a vector pattern. Vectors
  give a (cheap) subvector, other sequential collections give the remaining seq, which is a list for lists."
  [n coll]
  (if (vector? coll)
    (perf/dropv n coll)
    (nthrest coll n)))

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
  (let [match-kv (fn [_ k v]
                   ;; Like `clojure.walk`, visit each key before its value. Keys don't add themselves to
                   ;; `clause-parents`.
                   (if-some [match (match-fn k clause-parents)]
                     (reduced match)
                     (when-some [match (match-fn v (maybe-add-to-parents clause-parents k))]
                       (reduced match))))]
    (cond
      ;; Records may implement their own reduce (e.g. toucan2's IdentityQuery reduces over its rows), so go through
      ;; their entries with `seq`, like `metabase.util.performance/walk` does.
      (record? form)
      (reduce (fn [acc e] (match-kv acc (key e) (val e))) nil (seq form))

      (map? form)
      (reduce-kv match-kv nil form)

      (sequential? form)
      (let [fst     (first form)
            parents (maybe-add-to-parents clause-parents (when (keyword? fst) fst))]
        (reduce (fn [_ v]
                  (when-some [match (match-fn v parents)]
                    (reduced match)))
                nil form))

      ;; Sets don't contribute to `clause-parents`.
      (set? form)
      (reduce (fn [_ v]
                (when-some [match (match-fn v clause-parents)]
                  (reduced match)))
              nil form))))

(defn replace-in-collection
  "Internal impl for `replace` when it uses `&parents`. Recursively replace values in a collection using a
  `replace-fn`, which is called as `(replace-fn x parents)`. Walks the collection with
  [[metabase.util.performance/walk]]; this function only keeps track of `&parents`:

  - a map value adds its key;
  - an element of a sequential collection adds the collection's head keyword, if it has one;
  - map keys and set elements don't add anything."
  [replace-fn form clause-parents]
  (let [elem-parents (if (sequential? form)
                       (maybe-add-to-parents clause-parents (let [fst (first form)] (when (keyword? fst) fst)))
                       clause-parents)]
    (perf/walk #(replace-fn % elem-parents)
               (fn [k v] (replace-fn v (maybe-add-to-parents clause-parents k)))
               identity
               form)))
