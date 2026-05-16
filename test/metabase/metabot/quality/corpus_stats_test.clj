(ns metabase.metabot.quality.corpus-stats-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.corpus-stats :as corpus-stats]))

(set! *warn-on-reflection* true)

(defn- close-to?
  "Three-decimal agreement."
  [a b]
  (< (Math/abs (- (double a) (double b))) 5e-4))

;; ---------------------------------------------------------------------------
;; threshold-stats — min-corpus-size guard
;; ---------------------------------------------------------------------------

(deftest threshold-stats-returns-nil-below-min-corpus-test
  (testing "fewer than `min-corpus-size` values → nil (signal stays silent)"
    (is (nil? (corpus-stats/threshold-stats [])))
    (is (nil? (corpus-stats/threshold-stats [1 2 3])))
    (is (nil? (corpus-stats/threshold-stats
               (range (dec constants/min-corpus-size)))))))

(deftest threshold-stats-returns-result-at-min-corpus-test
  (testing "exactly `min-corpus-size` values → non-nil result"
    (let [vals  (vec (range constants/min-corpus-size))
          stats (corpus-stats/threshold-stats vals)]
      (is (some? stats))
      (is (= constants/min-corpus-size (:corpus-size stats)))
      (is (number? (:threshold stats))))))

;; ---------------------------------------------------------------------------
;; threshold-stats — math
;; ---------------------------------------------------------------------------

(defn- repeat-vals
  "Helper: replicate `vals` enough to clear `min-corpus-size` while preserving
  median and MAD. Constructed as the input seq with each element repeated
  enough times that the total count ≥ min-corpus-size."
  [vals]
  (let [k (-> constants/min-corpus-size
              (/ (count vals))
              double
              Math/ceil
              long)]
    (vec (mapcat (fn [v] (repeat k v)) vals))))

(deftest threshold-stats-median-and-mad-math-test
  (testing "threshold = median + (Z / scale) × MAD for a known distribution"
    ;; Input: [1 1 ... 1 2 2 ... 2 3 3 ... 3 ... 9 9 ... 9] (each value repeated equally)
    ;; sorted: same. Median = 5. Absolute deviations from 5: [4 3 2 1 0 1 2 3 4]
    ;; sorted deviations: [0 1 1 2 2 3 3 4 4] → MAD = 2.
    ;; threshold = 5 + (3.5 / 0.6745) × 2 ≈ 5 + 10.378 ≈ 15.378
    (let [base   [1 2 3 4 5 6 7 8 9]
          vals   (repeat-vals base)
          stats  (corpus-stats/threshold-stats vals)
          expected (+ 5.0 (* (/ (double constants/outlier-z-threshold)
                                (double constants/mad-scale))
                             2.0))]
      (is (some? stats))
      (is (close-to? expected (:threshold stats)))
      (is (= (count vals) (:corpus-size stats))))))

(deftest threshold-stats-equals-median-when-mad-zero-test
  (testing "MAD = 0 (all values identical) → threshold reduces to the median"
    (let [vals  (vec (repeat constants/min-corpus-size 42))
          stats (corpus-stats/threshold-stats vals)]
      (is (some? stats))
      (is (= 42.0 (:threshold stats))))))

(deftest threshold-stats-corpus-size-reported-test
  (testing ":corpus-size reflects the input count"
    (let [n     (+ constants/min-corpus-size 50)
          vals  (vec (range n))
          stats (corpus-stats/threshold-stats vals)]
      (is (= n (:corpus-size stats))))))
