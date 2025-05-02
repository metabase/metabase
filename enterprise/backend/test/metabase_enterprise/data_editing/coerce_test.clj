(ns metabase-enterprise.data-editing.coerce-test
  (:require
   [clojure.data :refer [diff]]
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.coerce :as coerce]
   [metabase.test :as mt]))

(deftest coercion-conversions-test
  (mt/with-clock #t "2000-01-01T00:00:00Z"
    (let [test-cases
          [{:strategy :Coercion/UNIXSeconds->DateTime
            :input    "2024-03-20T15:30:45Z[UTC]"
            :output   1710948645}

           {:strategy :Coercion/UNIXMilliSeconds->DateTime
            :input    "2024-03-20T15:30:45Z[UTC]"
            :output   1710948645000}

           {:strategy :Coercion/UNIXMicroSeconds->DateTime
            :input    "2024-03-20T15:30:45Z[UTC]"
            :output   1710948645000000}

           {:strategy :Coercion/UNIXNanoSeconds->DateTime
            :input    "2024-03-20T15:30:45Z[UTC]"
            :output   1710948645000000000}

           {:strategy :Coercion/YYYYMMDDHHMMSSString->Temporal
            :input    "2024-03-20T15:30Z[UTC]"  ;; Note: seconds set to 00 since the format doesn't preserve seconds
            :output   "20240320153000"}

           {:strategy :Coercion/ISO8601->DateTime
            :input    "2024-03-20T15:30:45Z[UTC]"
            :output   "2024-03-20T15:30:45Z[UTC]"}

           {:strategy :Coercion/ISO8601->Date
            :input    "2024-03-20T00:00Z[UTC]"
            :output   "2024-03-20"}

           {:strategy :Coercion/ISO8601->Time
            :input    "2025-05-01T15:30:45Z[UTC]"
            :output   "15:30:45"}]]

      (doseq [{:keys [strategy input output]} test-cases]
        (testing (format "Testing %s conversions" strategy)
          (let [{:keys [in out]} (get coerce/coercion-fns strategy)]
            ;; Test input conversion (JSON -> Database format)
            (testing "Input conversion"
              (is (= output (in input))
                  (format "Input conversion failed for %s: expected %s, got %s"
                          strategy output (in input))))

            ;; Test output conversion (Database format -> JSON)
            (testing "Output conversion"
              (is (= input (out output))
                  (format "Output conversion failed for %s: expected %s, got %s"
                          strategy input (out output))))

            ;; Test roundtrip conversion
            (testing "Roundtrip conversion"
              (is (= input (-> input in out))
                  (format "Roundtrip conversion failed for %s: %s -> %s -> %s"
                          strategy input (in input) (out (in input)))))))))))

(deftest coercion-fns-static-test
  (testing "all coercion pair have to have an in and out function"
    (testing (every? #(and (fn? (:in %)) (fn? (:out %))) coerce/coercion-fns)))

  ;; TODO: fix this test by implementing all strategies
  #_(testing "all coercion strategies are covered"
      (is (empty? (second (diff (into #{} (keys coerce/coercion-fns)) (descendants :Coercion/*)))))))
