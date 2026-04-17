(ns metabase.xrays.automagic-dashboards.combination-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.interestingness.core :as interestingness.core]
   [metabase.xrays.automagic-dashboards.combination :as combination]))

(defn- numeric-field [name fp]
  {:name name :fingerprint {:type {:type/Number fp}}})

(defn- text-field [name fp & {:keys [distinct-count]}]
  {:name name
   :fingerprint (cond-> {:type {:type/Text fp}}
                  distinct-count (assoc :global {:distinct-count distinct-count}))})

(defn- trim [card]
  (interestingness.core/score-card interestingness.core/trim-card-weights card))

(deftest ^:parallel trim-threshold-test
  (testing "healthy card passes trim"
    (let [result (trim {:dimensions [(text-field "region" {:mode-fraction 0.15} :distinct-count 12)]
                        :measures   [(numeric-field "revenue" {:sd 200 :avg 1000 :zero-fraction 0.05})]})]
      (is (= 1.0 (:score result)))
      (is (true? (#'combination/pass-trim? "HealthyCard" result)))))

  (testing "card with degenerate dim is trimmed"
    (let [result (trim {:dimensions [(text-field "status" {:mode-fraction 0.97} :distinct-count 5)]
                        :measures   [(numeric-field "revenue" {:sd 200 :avg 1000 :zero-fraction 0.05})]})]
      (is (<= (:score result) 0.1))
      (is (false? (#'combination/pass-trim? "DominatedDimCard" result)))))

  (testing "card with degenerate measure is trimmed"
    (let [result (trim {:dimensions [(text-field "region" {:mode-fraction 0.15} :distinct-count 12)]
                        :measures   [(numeric-field "counter" {:sd 0 :avg 0 :zero-fraction 0.99})]})]
      (is (<= (:score result) 0.1))
      (is (false? (#'combination/pass-trim? "FlatMeasureCard" result)))))

  (testing "card with constant dim (distinct-count ≤ 1) is trimmed"
    (let [result (trim {:dimensions [(text-field "flag" {} :distinct-count 1)]
                        :measures   [(numeric-field "revenue" {:sd 200 :avg 1000 :zero-fraction 0.05})]})]
      (is (<= (:score result) 0.1))
      (is (false? (#'combination/pass-trim? "ConstantDimCard" result)))))

  (testing "card with mostly-blank text dim is trimmed"
    (let [result (trim {:dimensions [(text-field "notes" {:blank% 0.9} :distinct-count 100)]
                        :measures   [(numeric-field "revenue" {:sd 200 :avg 1000 :zero-fraction 0.05})]})]
      (is (<= (:score result) 0.1))
      (is (false? (#'combination/pass-trim? "BlankDimCard" result)))))

  (testing "dimensionless card (rowcount) passes trim"
    ;; No measures, no dims — shouldn't be trimmed by this filter
    (let [result (trim {:dimensions [] :measures []})]
      (is (> (:score result) 0.15))
      (is (true? (#'combination/pass-trim? "Rowcount" result))))))
