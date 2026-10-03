(ns metabase-enterprise.remote-sync.field-path-cost-test
  "After a pull, the ledger-hashing pass re-serializes every imported card, and each field reference in
  a card is turned into a portable path by a recursive `metabase_field` query. Cards in a synced collection
  reference a handful of fields many times over, so those lookups should be answered once per field, not once per
  reference.

  Counts calls to [[metabase.models.db/field-hierarchy-rows]] (one app-DB query each) with a thread-local redef;
  the imports here run synchronously on this thread. Not ^:parallel: it creates and syncs shared content."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.models.db :as models.db]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- field-path-queries-on-forced-reload!
  "Creates `n` MBQL cards that all reference the same two venues fields, loads them once, then counts field-path
  queries during a forced pull of the same content."
  [n]
  (search.tu/with-index-disabled
    (cost/do-with-content!
     {:cards n}
     (fn [tree]
       (let [src (rs.test/versioned-source :trees {"v0" tree} :current "v0")]
         (is (= :success (:status (cost/import-at! src "v0" :force? true))) "baseline load")
         (let [calls (atom 0)
               real  (mt/original-fn #'models.db/field-hierarchy-rows)]
           (mt/with-dynamic-fn-redefs [models.db/field-hierarchy-rows (fn [& args] (swap! calls inc) (apply real args))]
             (is (= :success (:status (cost/import-at! src "v0" :force? true))) "forced reload"))
           @calls))))))

(deftest field-path-lookups-do-not-scale-with-cards-test
  (testing "A forced pull's field-path lookups are per distinct field, not per card: 20 cards over the same fields
            cost no more lookups than 10."
    (let [small (field-path-queries-on-forced-reload! 10)
          large (field-path-queries-on-forced-reload! 20)]
      (testing (format "field-path queries: %d at 10 cards, %d at 20 cards" small large)
        (is (pos? small) "the scenario exercises field-path lookups at all")
        (is (= small large))))))
