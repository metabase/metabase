(ns metabase.test.util.random
  (:refer-clojure :exclude [rand rand-int rand-nth])
  (:import
   [java.util Random]))

(set! *warn-on-reflection* true)

(defonce ^:dynamic *generator* (Random.))

(defn rand
  "wip"
  ([]
   (.nextDouble ^Random *generator*))
  ([n]
   (* n (rand))))

(defn rand-int
  "wip"
  [n]
  (int (rand n)))

(defn rand-nth
  "wip"
  [coll]
  (nth coll (rand-int (count coll))))
