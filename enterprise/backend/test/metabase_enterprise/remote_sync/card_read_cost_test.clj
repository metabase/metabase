(ns metabase-enterprise.remote-sync.card-read-cost-test
  "Every Card row read runs the Card after-select, which normalizes `dataset_query`; on a large pull that is about half
  the CPU. Counts those normalizations per loaded card on a forced reload of unchanged content.

  Not ^:parallel: it creates and syncs shared content."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- card-normalizations-on-forced-reload!
  "Number of Card after-select normalizations during a forced pull of `n` unchanged MBQL cards. Counted with a
  thread-local redef; the import runs synchronously on this thread."
  [n]
  (let [calls (atom 0)
        real  (mt/original-fn #'card/upgrade-card-schema-to-latest)]
    (cost/forced-reload-of-unchanged!
     {:cards n}
     (fn [import!]
       ;; The 1-arity is the after-select of each read. It calls the var with 2 arguments, so the spy needs that
       ;; arity too, and counts only the 1-arity.
       (mt/with-dynamic-fn-redefs [card/upgrade-card-schema-to-latest (fn
                                                                        ([c] (swap! calls inc) (real c))
                                                                        ([c b] (real c b)))]
         (is (= :success (:status (import!))) "forced pull"))))
    @calls))

(deftest forced-reload-does-not-reread-unchanged-cards-test
  (testing "A forced pull of unchanged cards does not read again a card row that the load did not change"
    (let [small    (card-normalizations-on-forced-reload! 10)
          large    (card-normalizations-on-forced-reload! 20)
          per-card (double (/ (- large small) 10))]
      ;; 1 read for the load, and 1 more when the ledger rebuild serializes each card again to hash it. A later change
      ;; keeps the prior hash of an unchanged file and removes that second read; it then tightens this bound to 1.0.
      (is (<= per-card 2.0)
          (format "Card normalizations per card: %s (10 cards: %d, 20 cards: %d)" per-card small large)))))
