(ns metabase.lib.test-util.random
  ;; TODO: Probably remove the exclude.
  ;; TODO: Move the namespace somewhere else!
  (:refer-clojure :exclude [rand rand-int rand-nth])
  (:require
   [environ.core :refer [env]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:dynamic *generator* nil)

(defn initial-seed-value
  "x"
  []
  (or (env :mb-test-run-seed)
      (doto (.nextLong ^java.util.Random (java.util.Random.))
        (as-> $ (log/errorf "Seed: %d" $)))))

(comment

  (initial-seed-value)

  (alter-var-root #'environ.core/env assoc
                  :mb-test-run-seed 1)
  
  (alter-var-root #'environ.core/env dissoc
                  :mb-test-run-seed)
  )


;; TODO: The question is whether to enable it with uninitialized generator.
(defn rand
  ([]
   (when-not (instance? java.util.Random *generator*)
     (throw (Exception. "Random generator not initialized.")))
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
