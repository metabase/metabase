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
           (key-blocks/part-bounds 0.0 100.0 4)))))

(deftest ^:parallel run-starts-test
  (let [bounds (key-blocks/part-bounds 0.0 100.0 4)
        starts (key-blocks/run-starts bounds (Random. 1))]
    (testing "one start for each part but the last, which is read down from the highest key"
      (is (= 3 (count starts))))
    (testing "the first run starts at the lowest key, so the sample has the first rows"
      (is (= 0.0 (first starts))))
    (testing "the other runs start at a point of their own part"
      (is (every? true? (map (fn [i start] (and (<= (nth bounds i) start) (< start (nth bounds (inc i)))))
                             (range 1 3) (rest starts)))))
    (testing "the same seed gives the same starts"
      (is (= starts (key-blocks/run-starts bounds (Random. 1)))))))

(deftest ^:parallel run-density-test
  (testing "a full run covers the key range from its requested start to its last key"
    (is (= 0.5 (key-blocks/run-density {:start 10.0 :end 50.0 :keys [11.0 13.0 15.0 17.0 19.0]} 5 1.0))))
  (testing "measured from the requested start, not from the first row, so that a hole before it counts"
    (is (= (/ 5 31.0) (key-blocks/run-density {:start 10.0 :end 50.0 :keys [36.0 37.0 38.0 39.0 40.0]} 5 1.0))))
  (testing "a run that stopped at the end of its part covers the rest of the part"
    (is (= (/ 2 41.0) (key-blocks/run-density {:start 10.0 :end 50.0 :keys [20.0 30.0]} 5 1.0))))
  (testing "the descending last run covers the range from the highest key down"
    (is (= 0.5 (key-blocks/run-density {:start 100.0 :end 75.0 :descending? true :keys [99.0 97.0 95.0 93.0 91.0]}
                                       5 1.0))))
  (testing "a run with no rows has no density"
    (is (= 0.0 (key-blocks/run-density {:start 10.0 :end 50.0 :keys []} 5 1.0)))))

(deftest ^:parallel weighted-keep-test
  (testing "the densest run keeps all of its rows, the others in proportion to their density"
    (is (= [50 25 1 0]
           (key-blocks/weighted-keep [1.0 0.5 0.001 0.0] [50 50 50 0])))))

(deftest ^:parallel weights-correct-a-gap-test
  (testing "Rows in a part of the key range with few rows count as much as their share of the table"
    ;; 2 dense parts of 50 rows each per 50 keys, 2 sparse parts of 50 rows each per 500 keys: the dense rows are 10
    ;; times as many in the table, so of the kept rows about 10 in 11 must be dense
    (let [runs   [{:start 0.0   :end 1000.0 :keys (mapv double (range 0 50))}
                  {:start 1000.0 :end 2000.0 :keys (mapv double (range 1000 1050))}
                  {:start 2000.0 :end 3000.0 :keys (mapv double (range 2000 2500 10))}
                  {:start 3000.0 :end 4000.0 :keys (mapv double (range 3000 3500 10))}]
          kept   (key-blocks/weighted-keep (mapv #(key-blocks/run-density % 50 1.0) runs) (mapv (comp count :keys) runs))
          dense  (+ (kept 0) (kept 1))
          sparse (+ (kept 2) (kept 3))]
      (is (= [50 50 5 5] kept))
      (is (< 0.85 (/ dense (double (+ dense sparse))) 0.95)))))

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
