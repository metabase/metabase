(ns metabase.util.performance
  "Functions and utilities for faster processing. This namespace is compatible with both Clojure and ClojureScript.
  However, some functions are either not only available in CLJS, or offer passthrough non-improved functions."
  (:refer-clojure :exclude [reduce mapv run! some every? concat select-keys update-keys empty? not-empty #?(:cljs clj->js)])
  #?@(:clj ()
      :cljs [(:require
              [cljs.core :as core]
              [goog.object :as gobject])])
  #?@(:clj [(:import (clojure.lang Counted ITransientCollection LazilyPersistentVector RT)
                     (java.util ArrayList HashMap Iterator List))]
      :default ()))

#?(:clj (set! *warn-on-reflection* true))

;; Transient helpers

(defn- editable? [coll]
  #?(:clj (instance? clojure.lang.IEditableCollection coll)
     :cljs (satisfies? IEditableCollection coll)))

(defn- transient? [coll]
  #?(:clj (instance? clojure.lang.ITransientAssociative coll)
     :cljs (satisfies? ITransientAssociative coll)))

(defn- assoc+ [coll key value]
  (cond
    (transient? coll) (assoc! coll key value)
    (editable? coll)  (assoc! (transient coll) key value)
    :else             (assoc  coll key value)))

(defn- dissoc+ [coll key]
  (cond
    (transient? coll) (dissoc! coll key)
    (editable? coll)  (dissoc! (transient coll) key)
    :else             (dissoc  coll key)))

(defn- maybe-persistent! [coll]
  (cond-> coll
    (transient? coll) persistent!))

(defn- add-original-meta [coll og-form]
  (when-not (nil? coll)
    (with-meta coll (meta og-form))))

;; Collection functions

(defn empty?
  "Returns true if coll has no items. Tries to avoid using `seq` for better performance."
  [coll]
  #?(:clj
     (cond (instance? List coll) (.isEmpty ^List coll)
           (instance? Counted coll) (= (.count ^Counted coll) 0)
           :else (not (seq coll)))
     :cljs (not (seq coll))))

(defn not-empty
  "If coll is empty, returns nil, else coll. Tries to avoid using `seq` for better performance."
  [coll]
  #?(:clj
     (when-not (empty? coll) coll)
     :cljs (clojure.core/not-empty coll)))

#?(:clj
   (defn reduce
     "Like `clojure.core/reduce`, but uses iterators under the hood to walk the collections and can iterate several
  collections at once. The function `f` accepts the number of arguments that is the number of iterated collections +
  1 (accumulator)."
     ([f init coll1]
      (if (nil? coll1)
        init
        (let [it1 (RT/iter coll1)]
          (loop [res init]
            (if (.hasNext it1)
              (let [res (f res (.next it1))]
                (if (reduced? res)
                  @res
                  (recur res)))
              res)))))
     ([f init coll1 coll2]
      (if (or (nil? coll1) (nil? coll2))
        init
        (let [it1 (RT/iter coll1)
              it2 (RT/iter coll2)]
          (loop [res init]
            (if (and (.hasNext it1) (.hasNext it2))
              (let [res (f res (.next it1) (.next it2))]
                (if (reduced? res)
                  @res
                  (recur res)))
              res)))))
     ([f init coll1 coll2 coll3]
      (if (or (nil? coll1) (nil? coll2) (nil? coll3))
        init
        (let [it1 (RT/iter coll1)
              it2 (RT/iter coll2)
              it3 (RT/iter coll3)]
          (loop [res init]
            (if (and (.hasNext it1) (.hasNext it2) (.hasNext it3))
              (let [res (f res (.next it1) (.next it2) (.next it3))]
                (if (reduced? res)
                  @res
                  (recur res)))
              res)))))
     ([f init coll1 coll2 coll3 coll4]
      (if (or (nil? coll1) (nil? coll2) (nil? coll3) (nil? coll4))
        init
        (let [it1 (RT/iter coll1)
              it2 (RT/iter coll2)
              it3 (RT/iter coll3)
              it4 (RT/iter coll4)]
          (loop [res init]
            (if (and (.hasNext it1) (.hasNext it2) (.hasNext it3) (.hasNext it4))
              (let [res (f res (.next it1) (.next it2) (.next it3) (.next it4))]
                (if (reduced? res)
                  @res
                  (recur res)))
              res))))))

   :cljs
   (defn reduce
     "Passthrough fallback to `clojure.core/reduce`."
     [f init coll]
     (clojure.core/reduce f init coll)))

;; Special case for mapv. If the iterated collection has size <=32, it is more efficient to use object array as
;; accumulator instead of transients, and then build a vector from it.

#?(:clj
   (deftype SmallTransientImpl [^objects arr, ^:unsynchronized-mutable ^long cnt, f]
     ITransientCollection
     (conj [this x]
       (RT/aset arr (unchecked-int cnt) x)
       (set! cnt (unchecked-inc cnt))
       this)

     (persistent [_]
       (LazilyPersistentVector/createOwning arr)))

   :cljs
   (deftype SmallTransientImpl [^:mutable arr, ^:mutable cnt, f]))

(defn- small-transient [n f]
  ;; Storing `f` in the transient itself is a hack to reduce lambda generation.
  (SmallTransientImpl. (object-array n) 0 f))

(defn- apply-and-small-conj!
  ([^SmallTransientImpl st a]
   #?(:clj (.conj st ((.-f st) a))
      :cljs (let [cnt (.-cnt st)]
              (do (aset (.-arr st) cnt ((.-f st) a))
                  (set! (.-cnt st) (inc cnt))
                  st))))
  #?@(:clj [([^SmallTransientImpl st a b]
             (let [f (.-f st)]
               (.conj st (f a b))))
            ([^SmallTransientImpl st a b c]
             (let [f (.-f st)]
               (.conj st (f a b c))))
            ([^SmallTransientImpl st a b c d]
             (let [f (.-f st)]
               (.conj st (f a b c d))))]))

(defn- small-persistent! [^SmallTransientImpl st]
  #?(:clj (.persistent st)
     :cljs (let [cnt (.-cnt st)
                 arr (.-arr st)]
             (PersistentVector. nil cnt 5 (.-EMPTY-NODE PersistentVector) arr nil))))

#?(:clj
   (defn- smallest-count
     (^long [c1 c2] (min (count c1) (count c2)))
     (^long [c1 c2 c3] (min (count c1) (count c2) (count c3)))
     (^long [c1 c2 c3 c4] (min (count c1) (count c2) (count c3) (count c4)))))

(defn mapv
  "Drop-in replacement for `clojure.core/mapv`.
  Iterates multiple collections more efficiently and uses Java iterators under the hood (the CLJ version). CLJS
  version is only optimized for a single collection arity."
  ([f coll1]
   (let [n (count coll1)]
     (cond (= n 0) []
           (<= n 32) (small-persistent! (reduce apply-and-small-conj! (small-transient n f) coll1))
           :else (persistent! (reduce #(conj! %1 (f %2)) (transient []) coll1)))))
  ([f coll1 coll2]
   #?(:clj
      (let [n (smallest-count coll1 coll2)]
        (cond (= n 0) []
              (<= n 32) (small-persistent! (reduce apply-and-small-conj! (small-transient n f) coll1 coll2))
              :else (persistent! (reduce #(conj! %1 (f %2 %3)) (transient []) coll1 coll2))))
      :cljs
      (core/mapv f coll1 coll2)))
  ([f coll1 coll2 coll3]
   #?(:clj
      (let [n (smallest-count coll1 coll2 coll3)]
        (cond (= n 0) []
              (<= n 32) (small-persistent! (reduce apply-and-small-conj! (small-transient n f) coll1 coll2 coll3))
              :else (persistent! (reduce #(conj! %1 (f %2 %3 %4)) (transient []) coll1 coll2 coll3))))
      :cljs
      (core/mapv f coll1 coll2 coll3)))
  ([f coll1 coll2 coll3 coll4]
   #?(:clj
      (let [n (smallest-count coll1 coll2 coll3 coll4)]
        (cond (= n 0) []
              (<= n 32) (small-persistent! (reduce apply-and-small-conj! (small-transient n f) coll1 coll2 coll3 coll4))
              :else (persistent! (reduce #(conj! %1 (f %2 %3 %4 %5)) (transient []) coll1 coll2 coll3 coll4))))
      :cljs
      (core/mapv f coll1 coll2 coll3 coll4))))

(defn run!
  "Drop-in replacement for `clojure.core/run!`.
  Iterates collections more efficiently and uses Java iterators under the hood."
  ([f coll1]
   (reduce (fn [_ x] (f x)) nil coll1)))

(defn juxt*
  "Like `clojure.core/juxt`, but accepts a list of functions instead of varargs. Uses more efficient mapping."
  [fns]
  (let [fns (vec fns)]
    (fn
      ([] (mapv #(%) fns))
      ([x] (mapv #(% x) fns))
      ([x y] (mapv #(% x y) fns))
      ([x y z] (mapv #(% x y z) fns))
      ([x y z & args] (mapv #(apply % x y z args) fns)))))

(defn some
  "Drop-in replacement for `clojure.core/some`.
  Uses our custom `reduce` which in turn uses iterators."
  [f coll]
  (unreduced (reduce #(when-let [match (f %2)] (reduced match)) nil coll)))

(defn every?
  "Drop-in replacement for `clojure.core/every?`.
  Uses our custom `reduce` which in turn uses iterators."
  [f coll]
  (unreduced (reduce #(if (f %2) true (reduced false)) true coll)))

(defn concat
  "Like `clojure.core/concat` but accumulates the result into a vector. NOT a drop-in replacement."
  ([a b]
   (into (vec a) b))
  ([a b c]
   (as-> (transient (vec a)) res
     (reduce conj! res b)
     (reduce conj! res c)
     (persistent! res)))
  ([a b c d]
   (as-> (transient (vec a)) res
     (reduce conj! res b)
     (reduce conj! res c)
     (reduce conj! res d)
     (persistent! res)))
  ([a b c d e]
   (as-> (transient (vec a)) res
     (reduce conj! res b)
     (reduce conj! res c)
     (reduce conj! res d)
     (reduce conj! res e)
     (persistent! res)))
  ([a b c d e f]
   (as-> (transient (vec a)) res
     (reduce conj! res b)
     (reduce conj! res c)
     (reduce conj! res d)
     (reduce conj! res e)
     (reduce conj! res f)
     (persistent! res)))
  ([a b c d e f & more]
   (as-> (transient (vec a)) res
     (reduce conj! res b)
     (reduce conj! res c)
     (reduce conj! res d)
     (reduce conj! res e)
     (reduce conj! res f)
     (reduce (fn [res l] (reduce conj! res l)) res more)
     (persistent! res))))

#?(:clj
   (defn transpose
     "Like `(apply mapv vector coll-of-colls)`, but more efficient."
     [coll-of-colls]
     (let [its (mapv #(.iterator ^Iterable %) coll-of-colls)]
       (mapv (fn [_] (mapv #(.next ^Iterator %) its))
             (first coll-of-colls)))))

(defn select-keys
  "Drop-in replacement for `clojure.walk/select-keys`, but much more efficient."
  [m keyseq]
  (let [absent #?(:clj (Object.) :cljs #js{})]
    (persistent! (reduce (fn [acc k]
                           (let [v (get m k absent)]
                             (if (identical? v absent)
                               acc
                               (assoc! acc k v))))
                         (transient {}) keyseq))))

(defn update-keys
  "Drop-in replacement for `clojure.core/update-keys`.
  Doesn't recreate the collection if no keys are changed after applying `f`."
  [m f]
  (cond (nil? m) {}
        ;; Fallback for non-editable collections where transients aren't supported.
        (not (editable? m))
        #_{:clj-kondo/ignore [:discouraged-var]}
        (clojure.core/update-keys m f)
        :else (-> (reduce-kv (fn [acc k v]
                               (let [k' (f k)]
                                 ;; Skip update if key is unchanged (=), but check for identity as it is faster.
                                 (if (or (identical? k k') (= k k'))
                                   acc
                                   (-> acc
                                       (dissoc+ k)
                                       (assoc+ k' v)))))
                             m m)
                  maybe-persistent!
                  (add-original-meta m))))

;; clojure.walk reimplementation. Partially adapted from https://github.com/tonsky/clojure-plus.

(defn walk
  "Drop-in replacement for `clojure.walk/walk`. Optimized for efficiency and has the following behavior differences:
  - Doesn't walk over map entries. When descending into a map, walks keys and values separately.
  - Uses transients and reduce where possible and tries to return the same input `form` if no changes were made."
  [inner outer form]
  (cond
    (map? form)
    (let [new-keys (volatile! (transient #{}))]
      (-> (reduce-kv (fn [m k v]
                       (let [k' (inner k)
                             v' (inner v)]
                         (if (identical? k' k)
                           (if (identical? v' v)
                             m
                             (assoc+ m k' v'))
                           (do (vswap! new-keys conj! k')
                               (if (contains? @new-keys k)
                                 (assoc+ m k' v')
                                 (-> m (dissoc+ k) (assoc+ k' v')))))))
                     form form)
          maybe-persistent!
          (add-original-meta form)
          outer))

    (vector? form)
    (-> (reduce-kv (fn [v idx el]
                     (let [el' (inner el)]
                       (if (identical? el' el)
                         v
                         (assoc+ v idx el'))))
                   form form)
        maybe-persistent!
        (add-original-meta form)
        outer)

    ;; Don't care much about optimizing seq and generic coll cases. When efficiency is required, use vectors.
    (seq? form) (outer (add-original-meta (seq (mapv inner form)) form)) ;;
    (coll? form) (outer (add-original-meta (into (empty form) (map inner) form) form))
    :else (outer form)))

(defn prewalk
  "Drop-in replacement for `clojure.walk/prewalk`.
  Uses a more efficient `metabase.util.performance/walk` underneath."
  [f form]
  (walk (fn prewalker [form] (walk prewalker identity (f form))) identity (f form)))

(defn postwalk
  "Drop-in replacement for `clojure.walk/postwalk`.
  Uses a more efficient `metabase.util.performance/walk` underneath."
  [f form]
  (walk (fn postwalker [form] (walk postwalker f form)) f form))

(defn keywordize-keys
  "Drop-in replacement for `clojure.walk/keywordize-keys`.
  Uses `metabase.util.performance/walk` underneath and preserves original metadata on the transformed maps."
  [m]
  (postwalk
   (fn [form]
     (if (map? form)
       (-> (reduce-kv (fn [m k v]
                        (if (string? k)
                          (-> m (dissoc+ k) (assoc+ (keyword k) v))
                          m))
                      form form)
           maybe-persistent!
           (add-original-meta form))
       form))
   m))

;;;; Faster clj->js implementation

#?(:cljs
   (defn clj->js
     "Optimized implementation of `cljs.core/clj->js`. The main distinction is using `reduce` to iterate through
     collections and thus reduce allocation pressure."
     [x]
     (letfn [(keyfn [k] (cond
                          (satisfies? IEncodeJS k) (-clj->js k)
                          (string? k) k
                          (number? k) k
                          (keyword? k) (name k)
                          (symbol? k) (str k)
                          :else (pr-str k)))
             (thisfn [x] (cond
                           (nil? x) nil
                           (satisfies? IEncodeJS x) (-clj->js x)
                           (keyword? x) (name x)
                           (symbol? x) (str x)
                           (map? x) (let [m (js-obj)]
                                      (reduce-kv (fn [_ k v]
                                                   (gobject/set m (keyfn k) (thisfn v))
                                                   nil)
                                                 nil x)
                                      m)
                           (coll? x) (let [arr (array)]
                                       (reduce (fn [_ y]
                                                 (.push arr (thisfn y)))
                                               nil x)
                                       arr)
                           :else x))]
       (thisfn x))))

;;;; Cross-platform mutable list and map wrapper functions.

(defn make-list
  "Create an empty mutable list. Returns ArrayList in Clojure, js array in ClojureScript."
  []
  #?(:clj (ArrayList.)
     :cljs #js []))

(defn list-add!
  "Add a value to the end of a mutable list. Returns the list for chaining."
  [lst value]
  #?(:clj (do (.add ^ArrayList lst value) lst)
     :cljs (do (.push lst value) lst)))

(defn list-set!
  "Replace the current value in the mutable list by the given index with the new value."
  [lst index new-value]
  #?(:clj (do (.set ^ArrayList lst index new-value) lst)
     :cljs (do (aset lst index new-value) lst)))

(defn list-nth
  "Get value at index from mutable list."
  [lst index]
  #?(:clj (.get ^ArrayList lst index)
     :cljs (aget lst index)))

(defn make-map
  "Create an empty mutable map. Returns HashMap in Clojure, plain js object in ClojureScript."
  []
  #?(:clj (HashMap.)
     :cljs (js/Map.)))

(defn map-get
  "Get value by key from mutable map."
  [m key]
  #?(:clj (.get ^HashMap m key)
     :cljs (.get m key)))

(defn map-put!
  "Put a key-value pair into a mutable map. Returns the map for chaining."
  [m key value]
  #?(:clj (do (.put ^HashMap m key value) m)
     :cljs (do (.set m key value) m)))
