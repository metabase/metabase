(ns metabase.test.util.random
  (:refer-clojure :exclude [rand rand-int rand-nth])
  (:import
   [java.util Random]))

(set! *warn-on-reflection* true)

(defonce
  ^{:dynamic true
    :doc "Generator that could be rebound. Bind when you need to control the seed for exmaple."}
  *generator*
  (Random.))

(defn rand
  "Reimplementation of [[clojure.core/rand]] using [[*generator*]]."
  ([]
   (.nextDouble ^Random *generator*))
  ([n]
   (* n (rand))))

(defn rand-int
  "Reimplementation of [[clojure.core/rand-int]] using [[*generator*]]."
  [n]
  (int (rand n)))

(defn rand-nth
  "Reimplementation of [[clojure.core/rand-nth]] using [[*generator*]]."
  [coll]
  (nth coll (rand-int (count coll))))
