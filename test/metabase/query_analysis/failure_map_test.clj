(ns metabase.query-analysis.failure-map-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-analysis.failure-map :as failure-map]))

(def id-generator (atom 0))

(defn- random-card []
  {:id (swap! id-generator inc) :dataset_query (rand)})

(def ^:private max-retries @#'failure-map/max-retries)

(def ^:private max-size @#'failure-map/max-size)

(deftest failure-map-non-retryable-test
  (failure-map/reset-map!)
  (let [card-1 (random-card)
        card-2 (random-card)]
    (testing "Initially, it is not marked as non-retryable"
      (is (false? (failure-map/non-retryable? card-1))))
    (when (> max-retries 1)
      (testing "It may fail a few times"
        (dotimes [_ (dec max-retries)]
          (failure-map/track-failure! card-1)
          (is (false? (failure-map/non-retryable? card-1))))))
    (testing "Once it has been retried a certain number of times, it is no longer retryable"
      (failure-map/track-failure! card-1)
      (is (true? (failure-map/non-retryable? card-1))))
    (testing "Other cards are not affected"
      (is (false? (failure-map/non-retryable? card-2))))

    ;; Technically speaking, this would have to happen before we exhausted our retries :-)
    (testing "If the card is analyzed, it is removed from the map"
      (failure-map/track-success! card-1)
      (is (false? (failure-map/non-retryable? card-1))))))

(deftest failure-map-bounded-test
  (failure-map/reset-map!)
  (let [random-cards (repeatedly max-size random-card)]
    (testing "We can record a large number of failures"
      (dotimes [_ max-retries]
        (run! failure-map/track-failure! random-cards)))
    (testing "And they are remembered"
      (is (every? failure-map/non-retryable? random-cards)))
    (testing "But the number that we recall is bounded\n"
      (let [extra-card (random-card)]
        (dotimes [_ max-retries]
          (failure-map/track-failure! extra-card))
        (is (false? (failure-map/non-retryable? extra-card)))
        (testing "... with replacement"
          (failure-map/track-success! (first random-cards))
          (dotimes [_ max-retries]
            (failure-map/track-failure! extra-card))
          (is (true? (failure-map/non-retryable? extra-card))))
        ;; clean-up
        (failure-map/track-success! extra-card)
        (run! failure-map/track-success! random-cards)))))
