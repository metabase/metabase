(ns metabase.interestingness.scorers.card-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.interestingness.core :as interestingness]
   [metabase.interestingness.scorers.card :as card]))

(defn- numeric-field [name fp]
  {:name name :fingerprint {:type {:type/Number fp}}})

(defn- text-field [name fp & {:keys [distinct-count]}]
  {:name name
   :fingerprint (cond-> {:type {:type/Text fp}}
                  distinct-count (assoc :global {:distinct-count distinct-count}))})

;;; -------------------------------------------------- measure-flatness --------------------------------------------------

(deftest ^:parallel measure-flatness-test
  (testing "lively measure scores 1.0"
    (let [result (card/measure-flatness
                  {:measures [(numeric-field "revenue" {:sd 200 :avg 1000 :mode-fraction 0.1 :zero-fraction 0.05})]}
                  nil)]
      (is (= 1.0 (:score result)))))

  (testing "mostly-zero measure hard-zeros the card"
    (let [result (card/measure-flatness
                  {:measures [(numeric-field "counter" {:sd 1 :avg 10 :zero-fraction 0.97})]}
                  nil)]
      (is (= 0.0 (:score result)))
      (is (re-find #"97% zeros" (:reason result)))))

  (testing "mode-dominated measure hard-zeros the card"
    (let [result (card/measure-flatness
                  {:measures [(numeric-field "flag" {:sd 0.01 :avg 1.0 :mode-fraction 0.98})]}
                  nil)]
      (is (= 0.0 (:score result)))))

  (testing "zero-SD measure hard-zeros the card"
    (let [result (card/measure-flatness
                  {:measures [(numeric-field "constant" {:sd 0 :avg 5})]}
                  nil)]
      (is (= 0.0 (:score result)))))

  (testing "no measures means neutral score"
    (let [result (card/measure-flatness {:measures []} nil)]
      (is (= 0.5 (:score result)))))

  (testing "worst measure dominates when multiple present"
    (let [result (card/measure-flatness
                  {:measures [(numeric-field "good" {:sd 200 :avg 1000 :zero-fraction 0.05})
                              (numeric-field "bad"  {:sd 1 :avg 10 :zero-fraction 0.97})]}
                  nil)]
      (is (= 0.0 (:score result)))
      (is (re-find #"bad" (:reason result))))))

;;; -------------------------------------------------- dimension-flatness --------------------------------------------------

(deftest ^:parallel dimension-flatness-test
  (testing "healthy dim scores 1.0"
    (let [result (card/dimension-flatness
                  {:dimensions [(text-field "region" {:mode-fraction 0.15} :distinct-count 12)]}
                  nil)]
      (is (= 1.0 (:score result)))))

  (testing "constant dim hard-zeros the card"
    (let [result (card/dimension-flatness
                  {:dimensions [(text-field "const" {:mode-fraction 1.0} :distinct-count 1)]}
                  nil)]
      (is (= 0.0 (:score result)))))

  (testing "dominated dim (>95%) hard-zeros the card"
    (let [result (card/dimension-flatness
                  {:dimensions [(text-field "status" {:mode-fraction 0.97} :distinct-count 5)]}
                  nil)]
      (is (= 0.0 (:score result)))))

  (testing "85-95% dominated dim is soft penalty"
    (let [result (card/dimension-flatness
                  {:dimensions [(text-field "status" {:mode-fraction 0.88} :distinct-count 5)]}
                  nil)]
      (is (= 0.2 (:score result)))))

  (testing "mostly-blank dim hard-zeros the card"
    (let [result (card/dimension-flatness
                  {:dimensions [(text-field "notes" {:blank% 0.9} :distinct-count 100)]}
                  nil)]
      (is (= 0.0 (:score result)))))

  (testing "too many distinct values is soft penalty"
    (let [result (card/dimension-flatness
                  {:dimensions [(text-field "uuid" {} :distinct-count 9999)]}
                  nil)]
      (is (= 0.3 (:score result)))))

  (testing "empty dims is 1.0 (dimensionless card)"
    (is (= 1.0 (:score (card/dimension-flatness {:dimensions []} nil))))))

;;; -------------------------------------------------- outlier-dominated-breakout --------------------------------------------------

(deftest ^:parallel outlier-dominated-breakout-test
  (testing "low-card dim + high-kurtosis measure + SUM → flagged"
    (let [result (card/outlier-dominated-breakout
                  {:dimensions [{:fingerprint {:global {:distinct-count 5}}}]
                   :measures   [(numeric-field "latency" {:excess-kurtosis 15.0 :skewness 1.0})]
                   :aggregation :sum}
                  nil)]
      (is (< (:score result) 1.0))
      (is (re-find #"outlier-dominated" (:reason result)))))

  (testing "high-card dim does NOT trigger"
    (let [result (card/outlier-dominated-breakout
                  {:dimensions [{:fingerprint {:global {:distinct-count 500}}}]
                   :measures   [(numeric-field "latency" {:excess-kurtosis 15.0})]
                   :aggregation :sum}
                  nil)]
      (is (= 1.0 (:score result)))))

  (testing "low-card dim + normal kurtosis does NOT trigger"
    (let [result (card/outlier-dominated-breakout
                  {:dimensions [{:fingerprint {:global {:distinct-count 5}}}]
                   :measures   [(numeric-field "latency" {:excess-kurtosis 0.5})]
                   :aggregation :sum}
                  nil)]
      (is (= 1.0 (:score result)))))

  (testing "MEDIAN aggregation is not flagged even with heavy tails"
    (let [result (card/outlier-dominated-breakout
                  {:dimensions [{:fingerprint {:global {:distinct-count 5}}}]
                   :measures   [(numeric-field "latency" {:excess-kurtosis 15.0})]
                   :aggregation :median}
                  nil)]
      (is (= 1.0 (:score result))))))

;;; -------------------------------------------------- visualization-fit --------------------------------------------------

(deftest ^:parallel visualization-fit-test
  (testing "pie with too many categories is penalized"
    (let [result (card/visualization-fit
                  {:dimensions [(text-field "status" {} :distinct-count 50)]
                   :visualization :pie}
                  nil)]
      (is (<= (:score result) 0.3))))

  (testing "pie with dominated slice is penalized"
    (let [result (card/visualization-fit
                  {:dimensions [(text-field "status" {:mode-fraction 0.95} :distinct-count 5)]
                   :visualization :pie}
                  nil)]
      (is (<= (:score result) 0.3))))

  (testing "reasonable pie scores 1.0"
    (let [result (card/visualization-fit
                  {:dimensions [(text-field "status" {:mode-fraction 0.3} :distinct-count 5)]
                   :visualization :pie}
                  nil)]
      (is (= 1.0 (:score result)))))

  (testing "line chart on all-midnight timestamps flagged"
    (let [result (card/visualization-fit
                  {:dimensions [{:fingerprint {:type {:type/DateTime {:hour-distribution (into [0.97] (repeat 23 0.0013))}}}}]
                   :visualization :line}
                  nil)]
      (is (< (:score result) 1.0))
      (is (re-find #"midnight" (:reason result)))))

  (testing "line chart on all-one-weekday timestamps flagged"
    ;; 99.4% on Monday (index 1), rest near zero
    (let [wd     [0.003 0.994 0.001 0.001 0.001 0.0 0.0]
          result (card/visualization-fit
                  {:dimensions [{:fingerprint {:type {:type/DateTime {:weekday-distribution wd}}}}]
                   :visualization :line}
                  nil)]
      (is (< (:score result) 1.0))
      (is (re-find #"weekly breakdown" (:reason result)))))

  (testing "balanced weekday distribution does NOT trigger the weekday penalty"
    (let [wd     (vec (repeat 7 (/ 1.0 7)))
          result (card/visualization-fit
                  {:dimensions [{:fingerprint {:type {:type/DateTime {:weekday-distribution wd}}}}]
                   :visualization :line}
                  nil)]
      (is (= 1.0 (:score result)))))

  (testing "scatter with too few points penalized"
    (let [result (card/visualization-fit
                  {:dimensions [{:fingerprint {:global {:distinct-count 2}}}]
                   :visualization :scatter}
                  nil)]
      (is (<= (:score result) 0.3)))))

;;; -------------------------------------------------- score-card composition --------------------------------------------------

(deftest ^:parallel score-card-test
  (testing "healthy card scores 1.0"
    (let [result (interestingness/score-card
                  interestingness/trim-card-weights
                  {:dimensions [(text-field "region" {:mode-fraction 0.15} :distinct-count 12)]
                   :measures   [(numeric-field "revenue" {:sd 200 :avg 1000 :mode-fraction 0.05 :zero-fraction 0.0})]})]
      (is (= 1.0 (:score result)))))

  (testing "card with degenerate dim is clamped to at most 0.1"
    (let [result (interestingness/score-card
                  interestingness/trim-card-weights
                  {:dimensions [(text-field "status" {:mode-fraction 0.97} :distinct-count 5)]
                   :measures   [(numeric-field "revenue" {:sd 200 :avg 1000 :zero-fraction 0.05})]})]
      (is (<= (:score result) 0.1))))

  (testing "card with degenerate measure is clamped to at most 0.1"
    (let [result (interestingness/score-card
                  interestingness/trim-card-weights
                  {:dimensions [(text-field "region" {:mode-fraction 0.15} :distinct-count 12)]
                   :measures   [(numeric-field "counter" {:sd 0 :avg 0 :zero-fraction 0.99})]})]
      (is (<= (:score result) 0.1))))

  (testing "scores map includes each scorer's breakdown"
    (let [result (interestingness/score-card
                  interestingness/trim-card-weights
                  {:dimensions [(text-field "region" {:mode-fraction 0.15} :distinct-count 12)]
                   :measures   [(numeric-field "revenue" {:sd 200 :avg 1000})]})]
      (is (= 2 (count (:scores result))))
      (is (every? (fn [[_ v]] (and (contains? v :score) (contains? v :reason)))
                  (:scores result))))))
