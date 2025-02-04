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
  "x"
  []
  (or (env :mb-test-run-seed)
      (doto (.nextLong ^java.util.Random *generator*)
        (as-> $ (log/infof "Run Seed Value: %d" $)))))

(comment

  (initial-seed-value)

  (alter-var-root #'environ.core/env assoc
                  :mb-test-run-seed 1)
  
  (alter-var-root #'environ.core/env dissoc
                  :mb-test-run-seed)
  )


(defn rand
  ([]
   (.nextDouble ^java.util.Random *generator*))
  ([n]
   (* n (rand))))

(defn rand-int
  [n]
  (int (rand n)))

(defn rand-nth
  [coll]
  (nth coll (rand-int (count coll))))


(defmacro with-rand
  ([& body]
   `(binding [*generator* (java.util.Random. (initial-seed-value))]
      ~@body)))
