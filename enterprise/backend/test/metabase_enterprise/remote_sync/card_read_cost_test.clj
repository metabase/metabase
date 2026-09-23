(ns metabase-enterprise.remote-sync.card-read-cost-test
  "HACKRDE-40: every Card row read runs the Card after-select, which normalizes `dataset_query`; on a large pull that
  is about half the CPU. Counts those normalizations per loaded card on a forced reload of unchanged content.

  Not ^:parallel: it reuses [[pull-cost-test]]'s content, which measures with the JVM-wide JDBC counter."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.pull-cost-test :as pull-cost-test]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.queries.models.card :as card]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- card-normalizations-on-forced-reload
  "Number of Card after-select normalizations during a forced pull of `n` unchanged MBQL cards. Counted with a
  thread-local redef; the import runs synchronously on this thread."
  [n]
  (search.tu/with-index-disabled
    (#'pull-cost-test/do-with-content!
     {:cards n}
     (fn [tree]
       (let [src (rs.test/versioned-source :trees {"v0" tree} :current "v0")]
         (is (= :success (:status (#'pull-cost-test/import-at! src "v0" :force? true))) "baseline load")
         (let [calls (atom 0)
               real  (mt/original-fn #'card/upgrade-card-schema-to-latest)]
           (mt/with-dynamic-fn-redefs [card/upgrade-card-schema-to-latest (fn [c] (swap! calls inc) (real c))]
             (is (= :success (:status (#'pull-cost-test/import-at! src "v0" :force? true))) "forced pull"))
           @calls))))))

(deftest forced-reload-reads-each-unchanged-card-once-test
  (testing "A forced pull of unchanged cards normalizes each card's query once (the local-row lookup it compares
            against), not again to re-read a row the load did not change"
    (let [small    (card-normalizations-on-forced-reload 10)
          large    (card-normalizations-on-forced-reload 20)
          per-card (double (/ (- large small) 10))]
      (is (<= per-card 1.0)
          (format "Card normalizations per card: %s (10 cards: %d, 20 cards: %d)" per-card small large)))))

(defn- card-normalizations-on-incremental-delete
  "Number of Card after-select normalizations during an incremental pull that deletes `k` of 20 MBQL cards."
  [k]
  (search.tu/with-index-disabled
    (#'pull-cost-test/do-with-content!
     {:cards 20}
     (fn [tree]
       (let [card-paths (take k (sort (filter #(re-find #"(?i)cost_card" %) (keys tree))))
             _          (is (= k (count card-paths)) "found the card files to delete")
             src        (rs.test/versioned-source :trees {"v0" tree "v1" (apply dissoc tree card-paths)} :current "v0")]
         (is (= :success (:status (#'pull-cost-test/import-at! src "v0" :force? true))) "baseline load")
         (let [calls (atom 0)
               real  (mt/original-fn #'card/upgrade-card-schema-to-latest)]
           (mt/with-dynamic-fn-redefs [card/upgrade-card-schema-to-latest (fn [c] (swap! calls inc) (real c))]
             (is (= :success (:status (#'pull-cost-test/import-at! src "v1"))) "incremental pull"))
           @calls))))))

(deftest incremental-delete-does-not-read-deleted-cards-test
  (testing "An incremental pull that deletes cards looks up their entity_ids without reading (and normalizing)
            each deleted card's full row. One read per deleted card remains: `t2/delete!` selects the rows to run
            the Card before-delete hook."
    (let [small       (card-normalizations-on-incremental-delete 2)
          large       (card-normalizations-on-incremental-delete 6)
          per-deleted (double (/ (- large small) 4))]
      (is (<= per-deleted 1.0)
          (format "Card normalizations per deleted card: %s (2 deleted: %d, 6 deleted: %d)" per-deleted small large)))))
