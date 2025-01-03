(ns metabase.util.performance
  "Functions and utilities for faster processing."
  (:refer-clojure :exclude [reduce mapv some concat])
  (:import (clojure.lang LazilyPersistentVector RT)))

(set! *warn-on-reflection* true)

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

;; Special case for mapv. If the iterated collection has size <=32, it is more efficient to use object array as
;; accumulator instead of transients, and then build a vector from it.

(definterface ISmallTransient
  (conj [x])
  (persistent []))

(deftype SmallTransientImpl [^objects arr, ^:unsynchronized-mutable ^long cnt]
  ISmallTransient
  (conj [this x]
    (RT/aset arr (unchecked-int cnt) x)
    (set! cnt (unchecked-inc cnt))
    this)

  (persistent [_]
    (LazilyPersistentVector/createOwning arr)))

(defn- small-transient [n]
  (SmallTransientImpl. (object-array n) 0))

(defn- small-conj!
  {:inline (fn [st x] `(.conj ~(with-meta st {:tag `ISmallTransient}) ~x))}
  [^ISmallTransient st x]
  (.conj st x))

(defn- small-persistent! [^ISmallTransient st]
  (.persistent st))

(defn- smallest-count
  (^long [c1 c2] (min (count c1) (count c2)))
  (^long [c1 c2 c3] (min (count c1) (count c2) (count c3)))
  (^long [c1 c2 c3 c4] (min (count c1) (count c2) (count c3) (count c4))))

(defn mapv
  "Like `clojure.core/mapv`, but iterates multiple collections more efficiently and uses Java iterators under the hood."
  ([f coll1]
   (let [n (count coll1)]
     (cond (= n 0) []
           (<= n 32) (small-persistent! (reduce #(small-conj! %1 (f %2)) (small-transient n) coll1))
           :else (persistent! (reduce #(conj! %1 (f %2)) (transient []) coll1)))))
  ([f coll1 coll2]
   (let [n (smallest-count coll1 coll2)]
     (cond (= n 0) []
           (<= n 32) (small-persistent! (reduce #(small-conj! %1 (f %2 %3)) (small-transient n) coll1 coll2))
           :else (persistent! (reduce #(conj! %1 (f %2 %3)) (transient []) coll1 coll2)))))
  ([f coll1 coll2 coll3]
   (let [n (smallest-count coll1 coll2 coll3)]
     (cond (= n 0) []
           (<= n 32) (small-persistent! (reduce #(small-conj! %1 (f %2 %3 %4)) (small-transient n) coll1 coll2 coll3))
           :else (persistent! (reduce #(conj! %1 (f %2 %3 %4)) (transient []) coll1 coll2 coll3)))))
  ([f coll1 coll2 coll3 coll4]
   (let [n (smallest-count coll1 coll2 coll3 coll4)]
     (cond (= n 0) []
           (<= n 32) (small-persistent! (reduce #(small-conj! %1 (f %2 %3 %4 %5)) (small-transient n) coll1 coll2 coll3 coll4))
           :else (persistent! (reduce #(conj! %1 (f %2 %3 %4 %5)) (transient []) coll1 coll2 coll3 coll4))))))

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
