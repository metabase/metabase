(ns metabase-enterprise.action-v2.coerce-test
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.action-v2.coerce :as coerce]
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
            :reversed #(str/ends-with? % "T15:30:45Z[UTC]")
            :output   "15:30:45"}]]

      (doseq [{:keys [strategy input reversed output]} test-cases]
        (testing (format "Testing %s conversions" strategy)
          (let [reversed?        (or reversed #{input})
                {:keys [in out]} (get coerce/coercion-fns strategy)]
            ;; Test input conversion (JSON -> Database format)
            (testing "Input conversion"
              (is (= output (in input))
                  (format "Input conversion failed for %s: expected %s, got %s"
                          strategy output (in input))))

            ;; Test output conversion (Database format -> JSON)
            (testing "Output conversion"
              (is (reversed? (out output))
                  (format "Output conversion failed for %s: expected %s, got %s"
                          strategy
                          (if-not reversed
                            input
                            (str "something like " input))
                          (out output))))

            ;; Test roundtrip conversion
            (testing "Roundtrip conversion"
              (is (reversed? (-> input in out))
                  (format "Roundtrip conversion failed for %s: %s -> %s -> %s"
                          strategy input (in input) (out (in input)))))))))))

(deftest coercion-fns-static-test
  (testing "all coercion pair have to have an in and out function"
    (testing (every? #(and (fn? (:in %)) (fn? (:out %))) coerce/coercion-fns)))

  ;; TODO: fix this test by implementing all strategies
  (let [implemented (set (keys coerce/coercion-fns))
        expected-fns (into #{} (filter (comp #{"Coercion"} namespace)) (descendants :Coercion/*))
        [unknown missing] (data/diff implemented expected-fns)]
    (testing "There are no unnecessary transformations (or stale keywords)"
      (is (nil? unknown)))
    (testing "There are no gaps in our transformations"
      ;; TODO implement these remaining cases
      (is (empty? (set/difference missing @#'coerce/unimplemented-coercion-functions))))))
