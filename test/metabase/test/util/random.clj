(ns metabase.test.util.random
  (:refer-clojure :exclude [rand rand-int rand-nth])
  (:require
   [clojure.test :as t :refer [is]]
   [metabase.config :as config])
  (:import
   [java.util Random]))

(set! *warn-on-reflection* true)

;; TODO: this should be "macroed" for use in with-gentest
(defonce ^:dynamic *seed* (.nextLong (java.util.Random.)))

(defonce ^:dynamic *generator* (java.util.Random. *seed*))

(defn rand
  "wip"
  ([]
   (.nextDouble ^java.util.Random *generator*))
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
