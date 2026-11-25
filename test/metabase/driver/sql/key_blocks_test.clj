(ns metabase.driver.sql.key-blocks-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql.key-blocks :as key-blocks])
  (:import
   (java.time LocalDate LocalDateTime)
   (java.util Random)))

(set! *warn-on-reflection* true)

(deftest ^:parallel part-bounds-test
  (testing "equal parts from the lowest to the highest key"
    (is (= [0.0 25.0 50.0 75.0 100.0]
           (#'key-blocks/part-bounds 0.0 100.0 4)))))

(deftest ^:parallel run-starts-test
  (let [bounds (#'key-blocks/part-bounds 0.0 100.0 4)
        starts (#'key-blocks/run-starts bounds (Random. 1))]
    (testing "one start for each part but the last, which is read down from the highest key"
      (is (= 3 (count starts))))
    (testing "the first run starts at the lowest key, so the sample has the first rows"
      (is (= 0.0 (first starts))))
    (testing "the other runs start at a point of their own part"
      (is (every? true? (map (fn [i start] (and (<= (nth bounds i) start) (< start (nth bounds (inc i)))))
                             (range 1 3) (rest starts)))))
    (testing "the same seed gives the same starts"
      (is (= starts (#'key-blocks/run-starts bounds (Random. 1)))))))

(deftest ^:parallel run-density-test
  (testing "a full run covers the key range from its requested start to its last key"
    (is (= 0.5 (#'key-blocks/run-density {:start 10.0 :end 50.0 :keys [11.0 13.0 15.0 17.0 19.0]} 5 1.0))))
  (testing "measured from the requested start, not from the first row, so that a hole before it counts"
    (is (= (/ 5 31.0) (#'key-blocks/run-density {:start 10.0 :end 50.0 :keys [36.0 37.0 38.0 39.0 40.0]} 5 1.0))))
  (testing "a run that stopped at the end of its part covers the rest of the part"
    (is (= (/ 2 41.0) (#'key-blocks/run-density {:start 10.0 :end 50.0 :keys [20.0 30.0]} 5 1.0))))
  (testing "the descending last run covers the range from the highest key down"
    (is (= 0.5 (#'key-blocks/run-density {:start 100.0 :end 75.0 :descending? true :keys [99.0 97.0 95.0 93.0 91.0]}
                                         5 1.0))))
  (testing "a run with no rows has no density"
    (is (= 0.0 (#'key-blocks/run-density {:start 10.0 :end 50.0 :keys []} 5 1.0)))))

(defn- run [start end ks]
  {:start start :end end :keys (mapv double ks)})

(deftest ^:parallel arm-limits-test
  (testing "runs of the same density read the same number of rows, about the sample size in all"
    (is (= {:limits [50 50 50 50] :clipped 0.0}
           (#'key-blocks/arm-limits (mapv #(run (* 1000.0 %) (* 1000.0 (inc %)) (range (* 1000 %) (+ 50 (* 1000 %))))
                                          (range 4))
                                    50 1.0 200))))
  (testing "rows in a part of the key range with few rows read as much as their share of the table"
    ;; 2 dense runs of 50 rows in 50 keys, 2 sparse runs of 50 rows in 500 keys: the dense rows are 10 times as many
    (let [limits (#'key-blocks/arm-limits [(run 0.0 1000.0 (range 0 50))
                                           (run 1000.0 2000.0 (range 1000 1050))
                                           (run 2000.0 3000.0 (range 2000 2500 10))
                                           (run 3000.0 4000.0 (range 3000 3500 10))]
                                          50 1.0 200)]
      (is (= {:limits [91 91 9 9] :clipped 0.0} limits))))
  (testing "a run that stopped at the end of its part reads at most the rows the part has"
    (is (= 3 (first (:limits (#'key-blocks/arm-limits [(run 0.0 3.0 [0 1 2]) (run 3.0 1000.0 (range 3 53))] 50 1.0 100))))))
  (testing "a run reads at most 4 times the first read, and the rows that the cap cuts are counted"
    (is (=? {:limits  (fn [limits] (= 200 (first limits)))
             :clipped #(> % 2000)}
            (#'key-blocks/arm-limits (into [(run 0.0 1000.0 (range 0 50))]
                                           (map #(run (* 1000.0 %) (* 1000.0 (inc %))
                                                      (range (* 1000 %) (+ 500 (* 1000 %)) 10))
                                                (range 1 10)))
                                     50 1.0 10000)))))

(deftest ^:parallel run-plan-test
  (testing "the first run starts at the true lowest key, the others at a key of the same type"
    (let [{:keys [params]} (#'key-blocks/run-plan 1 1000 4 1)]
      (is (= 1 (first params)))
      (is (every? int? params))))
  (testing "no runs for a key of whole numbers with fewer than 2 values for each run"
    (is (nil? (#'key-blocks/run-plan 1 7 4 1))))
  (testing "no runs for a key with no range"
    (is (nil? (#'key-blocks/run-plan 5 5 4 1)))
    (is (nil? (#'key-blocks/run-plan "a" "b" 4 1)))))

(deftest ^:parallel key-values-test
  (testing "a start point becomes a key of the type of the lowest key, rounded up to a whole step"
    (is (= 11 (#'key-blocks/number-> 1 10.2)))
    (is (= (LocalDate/of 2026 1 2) (#'key-blocks/number-> (LocalDate/of 2026 1 1)
                                                          (+ 0.5 (#'key-blocks/->number (LocalDate/of 2026 1 1)))))))
  (testing "dates and times round-trip through their numbers"
    (let [t (LocalDateTime/of 2026 1 1 12 30)]
      (is (= t (#'key-blocks/number-> t (#'key-blocks/->number t))))))
  (testing "a key of another type has no number, so the sample declines"
    (is (nil? (#'key-blocks/->number "abc")))))
