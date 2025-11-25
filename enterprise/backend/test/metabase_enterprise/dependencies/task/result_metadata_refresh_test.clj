(ns metabase-enterprise.dependencies.task.result-metadata-refresh-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.jobs :as jobs]
   [environ.core :as env]
   [metabase-enterprise.dependencies.task.result-metadata-refresh :as dependencies.refresh]
   [metabase-enterprise.dependencies.task.test-util :as dependencies.task.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- drain-refresh-queue!
  []
  (mt/with-premium-features #{:dependencies}
    (while (pos? (#'dependencies.refresh/refresh-result-metadata!)))))

(defn- refresh-single-batch!
  []
  (mt/with-premium-features #{:dependencies}
    (#'dependencies.refresh/refresh-result-metadata!)))

(defn- current-state []
  (let [state-var  #'dependencies.refresh/state
        state-atom @state-var]
    @state-atom))

(deftest ^:sequential drain-result-metadata-refresh-queue-test
  (testing "Test that the refresh job correctly updates the result_metadata of cards after upstream changes"
    (drain-refresh-queue!)
    (with-redefs [env/env (assoc env/env :mb-card-metadata-refresh-batch-size "2")]
      (let [mp       (mt/metadata-provider)
            upstream (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                         (lib/expression "Tax Rate" (lib// (lib.metadata/field mp (mt/id :orders :tax))
                                                           (lib.metadata/field mp (mt/id :orders :subtotal)))))]
        (mt/with-premium-features #{}
          (mt/with-temp [:model/User user           {:email "me@wherever.com"}
                         :model/Card {card1-id :id} {:dataset_query upstream}
                         :model/Card {card2-id :id} {:dataset_query
                                                     (let [mp (mt/metadata-provider)]
                                                       (lib/query mp (lib.metadata/card mp card1-id)))}]
            (dependencies.task.tu/backfill-all-existing-entities!)
            (mt/with-current-user (:id user)
              (testing "both upstream and downstream start with the original expression name"
                (is (=? {:name "Tax Rate"}
                        (-> (t2/select-one :model/Card :id card1-id)
                            :result_metadata
                            last)))
                (is (=? {:name "Tax Rate"}
                        (-> (t2/select-one :model/Card :id card2-id)
                            :result_metadata
                            last))))
              (testing "changing upstream card triggers the refresh"
                (let [refreshes     (atom [])
                      refresh-card! @#'dependencies.refresh/refresh-card!]
                  (with-redefs [dependencies.refresh/refresh-card!
                                (fn [card-id upstream-changed-at]
                                  (swap! refreshes conj card-id)
                                  (refresh-card! card-id upstream-changed-at))]
                    (let [card    (t2/select-one :model/Card :id card1-id)
                          expr    (first (lib/expressions (:dataset_query card)))
                          renamed (-> (:dataset_query card)
                                      (lib/replace-clause expr (lib/with-expression-name expr "Tax Fraction")))]
                      (card/update-card! {:card-before-update card
                                          :card-updates       {:dataset_query renamed}
                                          :actor              user}))
                    (Thread/sleep 50)
                    (is (=? [] @refreshes)
                        "no refreshes before the check")
                    (is (=? {:refresh-needed {:card {card2-id int?}}
                             :running?       false}
                            (current-state))
                        "And the update is queued")
                    (refresh-single-batch!)
                    (is (=? [card2-id] @refreshes)
                        "downstream card gets refreshed")
                    (is (=? {:refresh-needed (symbol "nil #_\"key is not present.\"")
                             :running?       false}
                            (current-state))
                        "and nothing is queued after")))))))))))

(deftest ^:sequential refresh-scheduling-test
  (testing "Test that the refresh job is correctly scheduled on demand"
    (dependencies.task.tu/backfill-all-existing-entities!)
    (drain-refresh-queue!)
    (mt/with-temp-scheduler!
      (with-redefs [env/env (assoc env/env
                                   :mb-card-metadata-refresh-batch-size  "1"
                                   :mb-card-metadata-refresh-delay-ms    "0"
                                   :mb-card-metadata-refresh-variance-ms "0")]
        (let [mp       (mt/metadata-provider)
              upstream (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/expression "Tax Rate" (lib// (lib.metadata/field mp (mt/id :orders :tax))
                                                             (lib.metadata/field mp (mt/id :orders :subtotal)))))
              batches  (atom [])
              refresh! @#'dependencies.refresh/refresh-result-metadata!]
          (mt/test-helpers-set-global-values!
            (mt/with-premium-features #{}
              (mt/with-temp [:model/User user           {:email "me@wherever.com"}
                             :model/Card {card1-id :id} {:dataset_query upstream}
                             :model/Card _              {:dataset_query
                                                         (let [mp (mt/metadata-provider)]
                                                           (lib/query mp (lib.metadata/card mp card1-id)))}]
                (dependencies.task.tu/backfill-all-existing-entities!)
                (task/delete-all-triggers-of-job! (jobs/key @#'dependencies.refresh/job-key))
                (with-redefs [dependencies.refresh/refresh-result-metadata!
                              (fn []
                                (let [n (refresh!)]
                                  (swap! batches conj n)
                                  n))]
                  (mt/with-current-user (:id user)
                    (is (= {:running? false}
                           (current-state))
                        "nothing queued at first")
                    (is (= [] @batches)
                        "and no batches have run")
                    (mt/with-premium-features #{:dependencies}
                      ;; Initialize the task, which should schedule the first run
                      (task/init! ::dependencies.refresh/RefreshResultMetadata)
                      (dependencies.task.tu/wait-for-condition #(= [0] @batches) 10000) ; Wait for first empty run.
                      (is (= [0] @batches)
                          "exactly one batch ran and did 0 work")
                      ;; Wait two seconds to ensure it wasn't rescheduled.
                      (Thread/sleep 2000)
                      (is (= [0] @batches)
                          "still one batch a bit later - the job isn't scheduled")

                      ;; Update the upstream card
                      (let [card    (t2/select-one :model/Card :id card1-id)
                            expr    (first (lib/expressions (:dataset_query card)))
                            renamed (-> (:dataset_query card)
                                        (lib/replace-clause expr (lib/with-expression-name expr "Tax Fraction")))]
                        (card/update-card! {:card-before-update card
                                            :card-updates       {:dataset_query renamed}
                                            :actor              user}))
                      (dependencies.task.tu/wait-for-condition #(= [0 1] @batches) 10000) ; Wait for second run.
                      (is (= [0 1] @batches)
                          "job was scheduled and run on demand")
                      (is (=? {:refresh-needed (symbol "nil #_\"key is not present.\"")
                               :running?       false}
                              (current-state))
                          "queue is empty again")

                      ;; Wait again, still not running on a schedule.
                      (Thread/sleep 2000)
                      (is (= [0 1] @batches)
                          "job was not rescheduled since queue was empty"))))))))))))
