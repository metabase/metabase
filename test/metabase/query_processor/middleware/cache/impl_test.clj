(ns metabase.query-processor.middleware.cache.impl-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase.query-processor.middleware.cache.impl :as impl]
            [potemkin.types :as p.types])
  (:import java.io.ByteArrayInputStream))

;; `defrecord+` because if this gets redefined it confuses the test runner
(p.types/defrecord+ ^:private Z [n])

(def ^:private objects [{:metadata? true} -200.0 3 "HELLO!" {:x 100, :y #t "2020-02-02", :z #{:a :b :c}} (Z. 100)])

(defn- deserialize
  "Deserialize objects serialized with `serialize-async` using reducing function `rf`."
  ([^bytes bytea]
   (deserialize bytea (fn [metadata]
                        (fn
                          ([] [metadata])
                          ([acc] acc)
                          ([acc row] (conj acc row))))))

  ([^bytes bytea rff]
   (with-open [bis (ByteArrayInputStream. bytea)]
     (impl/with-reducible-deserialized-results [[metadata rows] bis]
       (when rows
         (let [rf (rff metadata)]
           (reduce rf (rf) rows)))))))

(deftest e2e-test
  (let [{:keys [in-chan out-chan]} (impl/serialize-async)]
    (doseq [obj objects]
      (a/put! in-chan obj))
    (a/close! in-chan)
    (let [[val] (a/alts!! [out-chan (a/timeout 1000)])]
      (is (= objects
             (if (instance? Throwable val)
               (throw val)
               (deserialize val)))))))

(deftest max-bytes-test
  (let [{:keys [in-chan out-chan]} (impl/serialize-async {:max-bytes 50})]
    (doseq [obj objects]
      (a/put! in-chan obj))
    (a/close! in-chan)
    (let [[val] (a/alts!! [out-chan (a/timeout 1000)])]
      (is (thrown-with-msg?
           Exception
           #"Results are too large to cache\."
           (if (instance? Throwable val)
             (throw val)
             val)))
      nil)))
