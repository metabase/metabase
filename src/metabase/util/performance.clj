(ns metabase.util.performance
  "Functions and utilities for faster processing."
  (:refer-clojure :exclude [reduce mapv]))

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

(defn mapv
  "Like `clojure.core/mapv`, but iterates multiple collections more effectively and uses Java iterators under the hood."
  ([f coll1]
   (persistent! (reduce #(conj! %1 (f %2)) (transient []) coll1)))
  ([f coll1 coll2]
   (persistent! (reduce #(conj! %1 (f %2 %3)) (transient []) coll1 coll2)))
  ([f coll1 coll2 coll3]
   (persistent! (reduce #(conj! %1 (f %2 %3 %4)) (transient [])  coll1 coll2 coll3)))
  ([f coll1 coll2 coll3 coll4]
   (persistent! (reduce #(conj! %1 (f %2 %3 %4 %5)) (transient []) coll1 coll2 coll3 coll4))))
