(ns metabase.test.util.random
  (:refer-clojure :exclude [rand rand-int rand-nth])
  (:require
   [metabase.config :as config]))

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

(defn initial-seed
  []
  (or (config/config-long :mb-test-run-seed)
      (.nextLong ^java.util.Random *generator*)))

;; initial seed or nothing

;; TODO: Re-factor into `defgen` (alternative to deftest and defspec). (Or genrec)
;; TODO: Limit encoding for `defgen`, seed encoding also (per iter).
;; TODO: Multiple bindings, error handling / logging for all!
(defmacro with-generator
  ([[limit bind-sym generating-expr] & body]
   `(loop [i# 0
           ~'&seed (initial-seed)
           generator# (java.util.Random. ~'&seed)]
      (when (< i# ~limit)
        ;; test
        ;; WIPWIP: All error handling should reside in test for now
        (binding [*generator* generator#]
          ;; Currently generating-expr could return :error to signal running the rest does not make sense.
          (let [~bind-sym ~generating-expr]
            (when-not (= :error ~bind-sym)
              ~@body)))
        ;; recur
        (let [next-seed# (.nextLong generator#)]
          (recur (inc i#) next-seed# (java.util.Random. next-seed#)))))))

(comment
  (with-generator [3 x 1] (+ 1 1))
  (clojure.walk/macroexpand-all '(with-generator [1 x 1] (+ 1 1)))
  )
