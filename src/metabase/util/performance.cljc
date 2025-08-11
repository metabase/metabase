(ns metabase.util.performance
  "Functions and utilities for faster processing. This namespace is compatible with both Clojure and ClojureScript.
  However, some functions are either not only available in CLJS, or offer passthrough non-improved functions."
  (:refer-clojure :exclude [reduce mapv run! some every? concat select-keys #?(:cljs clj->js)])
  (:require
   #?@(:clj [[potemkin :as p]
             [metabase.util.performance.jvm]]
       :cljs [[cljs.core :as core]
              [goog.object :as gobject]]))
  #?@(:clj [(:import (clojure.lang ITransientCollection LazilyPersistentVector RT)
                     java.util.Iterator)]
      :default ()))

#?(:clj (set! *warn-on-reflection* true))

#?(:clj
   (defn reduce
     "Like `clojure.core/reduce`, but uses iterators under the hood to walk the collections and can iterate several
  collections at once. The function `f` accepts the number of arguments that is the number of iterated collections +
  1 (accumulator)."
     ([f init coll1]
      (if (nil? coll1)
        init
        (let [it1 (.iterator ^Iterable coll1)]
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
        (let [it1 (.iterator ^Iterable coll1)
              it2 (.iterator ^Iterable coll2)]
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
        (let [it1 (.iterator ^Iterable coll1)
              it2 (.iterator ^Iterable coll2)
              it3 (.iterator ^Iterable coll3)]
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
        (let [it1 (.iterator ^Iterable coll1)
              it2 (.iterator ^Iterable coll2)
              it3 (.iterator ^Iterable coll3)
              it4 (.iterator ^Iterable coll4)]
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
  "Like `clojure.core/mapv`, but iterates multiple collections more efficiently and uses Java iterators under the
  hood (the CLJ version). CLJS version is only optimized for a single collection arity."
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
  "Like `clojure.core/run!`, but iterates collections more efficiently and uses Java iterators under the hood."
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
  "Like `clojure.core/some` but uses our custom `reduce` which in turn uses iterators."
  [f coll]
  (unreduced (reduce #(when-let [match (f %2)] (reduced match)) nil coll)))

(defn every?
  "Like `clojure.core/every?` but uses our custom `reduce` which in turn uses iterators."
  [f coll]
  (unreduced (reduce #(if (f %2) true (reduced false)) true coll)))

(defn concat
  "Like `clojure.core/concat` but accumulates the result into a vector."
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
  "Like `clojure.walk/select-keys`, but much more efficient."
  [m keyseq]
  (let [absent #?(:clj (Object.) :cljs #js{})]
    (persistent! (reduce (fn [acc k]
                           (let [v (get m k absent)]
                             (if (identical? v absent)
                               acc
                               (assoc! acc k v))))
                         (transient {}) keyseq))))

#?(:clj (p/import-vars [metabase.util.performance.jvm keywordize-keys postwalk prewalk walk]))

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
