(ns metabase-enterprise.remote-sync.field-path-cost-test
  "After a pull, the ledger-hashing pass serializes every imported card again, and a recursive `metabase_field` query
  turns each field reference of a card into a portable path. The cards of a synced collection refer to a few fields
  many times, so the pass must look up each field once, not once for each reference.

  Counts calls to [[metabase.models.db/field-hierarchy-rows]] (one app-DB query each) with a thread-local redef; the
  imports here run synchronously on this thread. Not ^:parallel: it creates and syncs shared content."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.models.db :as models.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- field-path-queries-on-forced-reload!
  "Creates `n` MBQL cards that all refer to the same two venues fields, loads them once, then counts the field-path
  queries of a forced pull of the same content."
  [n]
  (let [calls (atom 0)]
    (cost/forced-reload-of-unchanged!
     {:cards n}
     (fn [import!]
       (mt/with-dynamic-fn-redefs [models.db/field-hierarchy-rows
                                   (cost/counting calls (mt/original-fn #'models.db/field-hierarchy-rows))]
         (is (= :success (:status (import!))) "forced reload"))))
    @calls))

(deftest field-path-lookups-do-not-scale-with-cards-test
  (testing "A forced pull looks up field paths once for each distinct field, not once for each card: 20 cards over the
            same fields cost no more lookups than 10."
    (let [small (field-path-queries-on-forced-reload! 10)
          large (field-path-queries-on-forced-reload! 20)]
      (testing (format "field-path queries: %d at 10 cards, %d at 20 cards" small large)
        (is (pos? small) "the scenario looks up field paths at all")
        (is (= small large))))))
