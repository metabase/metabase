(ns metabase.transforms.models.timeout-util-test
  (:require
   [clojure.test :refer :all]
   [metabase.transforms.models.timeout-util :as timeout-util])
  (:import
   (java.time Duration OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(deftest ^:parallel unit->duration-test
  (testing "produces an exact Duration for each supported unit"
    (is (= (Duration/ofSeconds 30) (timeout-util/unit->duration 30 :second)))
    (is (= (Duration/ofMinutes 5)  (timeout-util/unit->duration 5  :minute)))
    (is (= (Duration/ofHours 2)    (timeout-util/unit->duration 2  :hour))))
  (testing "unknown unit throws"
    (is (thrown? IllegalArgumentException (timeout-util/unit->duration 1 :day)))))

(deftest ^:parallel detection-latency-ms-test
  (let [^OffsetDateTime reference-ts (OffsetDateTime/of 2026 1 1 0 0 0 0 ZoneOffset/UTC)
        timeout-dur                  (Duration/ofMinutes 10)
        deadline                     (.plus (.toInstant reference-ts) timeout-dur)]
    (testing "zero at the deadline"
      (is (zero? (timeout-util/detection-latency-ms reference-ts timeout-dur deadline))))
    (testing "clamped to zero before the deadline"
      (is (zero? (timeout-util/detection-latency-ms reference-ts timeout-dur (.minusMillis deadline 5000)))))
    (testing "milliseconds past the deadline"
      (is (= 7500
             (timeout-util/detection-latency-ms reference-ts timeout-dur (.plusMillis deadline 7500)))))))
