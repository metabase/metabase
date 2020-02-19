(ns metabase.query-processor.middleware.cache.impl-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase.query-processor.middleware.cache.impl :as impl]
            [potemkin.types :as p.types]))

;; `defrecord+` because if this gets redefined it confuses the test runner
(p.types/defrecord+ ^:private Z [n])

(def ^:private objects [-100.0 -200.0 3 "HELLO!" {:x 100, :y #t "2020-02-02", :z #{:a :b :c}} (Z. 100)])

(deftest e2e-test
  (let [{:keys [in-chan out-chan]} (impl/serialize-async)]
    (doseq [obj objects]
      (a/put! in-chan obj))
    (a/close! in-chan)
    (let [[val] (a/alts!! [out-chan (a/timeout 1000)])]
      (is (= objects
             (if (instance? Throwable val)
               (throw val)
               (impl/deserialize val)))))))

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
