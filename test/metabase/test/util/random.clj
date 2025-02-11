(ns metabase.test.util.random
  (:refer-clojure :exclude [rand rand-int rand-nth])
  (:require
   [clojure.test :as t :refer [is]]
   [metabase.config :as config])
  (:import
   [java.util Random]))

(set! *warn-on-reflection* true)

(defonce ^:dynamic *generator* (java.util.Random.))

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
