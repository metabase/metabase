(ns metabase.query-processor.middleware.cache.impl-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.middleware.cache.impl :as impl]
            [potemkin.types :as p.types])
  (:import java.io.ByteArrayInputStream))

;; `defrecord+` because if this gets redefined it confuses the test runner
(p.types/defrecord+ ^:private Z [n])

(def ^:private objects [{:metadata? true} -200.0 3 "HELLO!" {:x 100, :y #t "2020-02-02", :z #{:a :b :c}} (Z. 100)])

(defn deserialize
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
  (impl/do-with-serialization
   (fn [in result]
     (doseq [obj objects]
       (is (= nil
              (in obj))))
     (let [val (result)]
       (is (instance? (Class/forName "[B") val))
       (is (= objects
              (if (instance? Throwable val)
                (throw val)
                (deserialize val))))))))

(deftest max-bytes-test
  (impl/do-with-serialization
   (fn [in result]
     (doseq [obj objects]
       (is (= nil
              (in obj))))
     (is (thrown-with-msg?
          Exception
          #"Results are too large to cache\."
          (result))))
   {:max-bytes 50}))
