(ns metabase.lib.test-util.random
  ;; TODO: Probably remove the exclude.
  ;; TODO: Move the namespace somewhere else!
  (:refer-clojure :exclude [rand rand-int rand-nth])
  (:require
   [environ.core :refer [env]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defonce ^:dynamic *generator* (java.util.Random.))

(defn initial-seed-value
  "wip"
  []
  (or (some-> (env :mb-test-run-seed)
              java.lang.Long/parseLong)
      (doto (.nextLong ^java.util.Random *generator*)
        (as-> $ (log/infof "Run Seed Value: %d" $)))))

(comment

  (initial-seed-value)

  (alter-var-root #'environ.core/env assoc :mb-test-run-seed 1)

  (alter-var-root #'environ.core/env dissoc :mb-test-run-seed))

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

(defmacro with-rand
  "wip"
  ([& body]
   `(binding [*generator* (java.util.Random. (initial-seed-value))]
      ~@body)))
