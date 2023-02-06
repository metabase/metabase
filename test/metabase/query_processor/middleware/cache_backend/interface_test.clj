(ns metabase.query-processor.middleware.cache-backend.interface-test
  (:require
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.query-processor.middleware.cache-backend.serialization :as cache.serdes]
   [metabase.test :as mt]
   [potemkin.types :as p.types])
  (:import
   (java.io ByteArrayInputStream)))

;; `defrecord+` because if this gets redefined it confuses the test runner
(p.types/defrecord+ ^:private Z [n])

;; ordered-map is used to test freezing/thawing OrderedMaps used in some DB drivers, which
;; must be handled by extending freeze/thaw. See GitHub issue #25915.

(def ^:private objects [{:metadata? true} -200.0 3 "HELLO!" (ordered-map/ordered-map :x 100, :y #t "2020-02-02", :z #{:a :b :c}) (Z. 100)])

(defn deserialize
  "Deserialize objects serialized with `serialize-async` using reducing function `rf`."
  ([serializer ^bytes bytea]
   (deserialize serializer bytea
                (fn [metadata]
                  (fn
                    ([] [metadata])
                    ([acc] acc)
                    ([acc row] (conj acc row))))))

  ([serializer ^bytes bytea rff]
   (with-open [bis (ByteArrayInputStream. bytea)]
     (i/with-reducible-deserialized-results serializer [[metadata rows] bis]
       (when rows
         (let [rf (rff metadata)]
           (reduce rf (rf) rows)))))))

(deftest e2e-test
  (doseq [serializer [cache.serdes/nippy-bounded-serializer
                      cache.serdes/unbounded-edn-serializer]]
    (i/do-with-serialization
     serializer
     (fn [in result]
       (doseq [obj objects]
         (is (= nil
                (in obj))))
       (let [val (result)]
         (is (instance? (Class/forName "[B") val))
         (is (= (if (= serializer cache.serdes/unbounded-edn-serializer)
                  (mt/derecordize objects)
                  objects)
                (if (instance? Throwable val)
                  (throw val)
                  (deserialize serializer val)))))))))

(deftest max-bytes-test
  (i/do-with-serialization
   cache.serdes/nippy-bounded-serializer
   (fn [in result]
     (doseq [obj objects]
       (is (= nil
              (in obj))))
     (is (thrown-with-msg?
          Exception
          #"Results are too large to cache\."
          (result))))
   {:max-bytes 50}))
