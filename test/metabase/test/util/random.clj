(ns metabase.test.util.random
  (:refer-clojure :exclude [rand rand-int rand-nth])
  (:import
   [java.util Random]))

(set! *warn-on-reflection* true)

;; TODO: this should be "macroed" for use in with-gentest
(defonce ^:dynamic *seed* (.nextLong (Random.)))

(defonce ^:dynamic *generator* (Random. *seed*))

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
