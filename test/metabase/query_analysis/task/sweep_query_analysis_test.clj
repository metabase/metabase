(ns metabase.query-analysis.task.sweep-query-analysis-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.query-analysis.core :as query-analysis]
   [metabase.query-analysis.task.sweep-query-analysis :as sweeper]
   [metabase.query-analysis.task.test-setup :as setup]
   [metabase.util.queue :as queue]
   [toucan2.core :as t2]))

(defn- queued-card-ids [task-fn]
  (let [card-ids (atom #{})]
    (task-fn #(swap! card-ids conj (:id %)))
    @card-ids))

(deftest analyze-cards-without-query-fields-test
  (setup/with-test-setup! [c1 c2 c3 c4 archived invalid]
    (testing "There is at least one card with existing analysis"
      (is (pos? (t2/count :model/QueryField :card_id (:id c3)))))
    (let [expected-ids (into #{} (map :id) [c1 c2 c4 invalid])
          not-expected (into #{} (map :id) [c3 archived])
          queued-ids   (queued-card-ids #'sweeper/analyze-cards-without-complete-analysis!)]
      (testing "The expected cards were all sent to the analyzer"
        (is (= expected-ids (set/intersection expected-ids queued-ids))))
      (testing "The card with existing analysis was not sent to the analyzer again"
        (is (empty? (set/intersection not-expected queued-ids)))))))

(deftest analyze-stale-cards-test
  (setup/with-test-setup! [c1 c2 c3 c4 archived invalid]
    (let [expected-ids (into #{} (map :id) [c1 c2 c3 c4 archived invalid])
          queued-ids   (queued-card-ids #'sweeper/analyze-stale-cards!)]
      ;; Hopefully we can improve this inefficiency in the future.
      (testing "All the cards were all sent to the analyzer"
        (is (= expected-ids (set/intersection expected-ids queued-ids)))))))

(deftest delete-orphan-analysis-test
  (setup/with-test-setup! [c1 c2 c3 c4 archived invalid]
    (let [card-id (:id c3)]
      (testing "There is a card with existing analysis"
        (is (pos? (t2/count :model/QueryField :card_id card-id))))
      ;; We archive the card
      (t2/update! :model/Card card-id {:archived true})

      ;; NOTE: If a hook is added to clean this up synchronously, we'll need to come up with a new way to init the test.
      (testing "There is still analysis after the card is archived"
        (is (pos? (t2/count :model/QueryField :card_id card-id))))

      (testing "The task deletes at least one record"
        (is (pos? (#'sweeper/delete-orphan-analysis!))))
      (testing "There is no analysis left after the task is run"
        (is (zero? (t2/count :model/QueryField :card_id card-id))))
      (testing "No cards were harmed in the process"
        (is (= 6 (t2/count :model/Card :id [:in (mapv :id [c1 c2 c3 c4 archived invalid])])))))))

(comment
  (set! *warn-on-reflection* true)
  (queue/clear! @#'query-analysis/worker-queue)
  (.-queued-set @#'query-analysis/worker-queue)
  (.peek (.-async-queue @#'query-analysis/worker-queue))
  (.peek (.-sync-queue @#'query-analysis/worker-queue)))
