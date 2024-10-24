(ns metabase.lib.test-util.generators.coroutines
  "This is an implementation of **generators**, in the Javascript or Python sense: imperative coroutines that
  `yield` values on demand.

  This implementation is taken directly from the
  [guide](https://github.com/leonoel/cloroutine/blob/master/doc/01-generators.md) on the repo."
  (:require
   [cloroutine.core :refer [cr]]))

(def ^:private ^:dynamic *tail* nil)

(defn gen-seq
  "Implementation detaul of the [[generator]] macro."
  [gen]
  (lazy-seq (binding [*tail* (gen-seq gen)]
              (gen))))

#_(defn- no-op [])

(defn yield [x]
  (cons x *tail*))

(defmacro generator [& body]
  `(gen-seq (cr {yield (fn [])} ~@body nil)))

(comment
  ;; An example of how these work.
  (defn- my-range
    ([limit]
     (my-range 0 limit))
    ([start limit]
     (my-range start limit 1))
    ([start limit step]
     (generator
       (loop [x start]
         (when (< x limit)
           (yield x)
           (recur (+ x step)))))))

  (my-range 6)         ;;=> (0 1 2 3 4 5)
  (my-range 4 11)      ;;=> (4 5 6 7 8 9 10)
  (my-range 2 60 11))  ;;=> (2 13 24 35 46 57)
