(ns metabase-enterprise.remote-sync.field-path-cost-test
  "HACKRDE-19: after a pull, the ledger-hashing pass re-serializes every imported card, and each field reference in
  a card is turned into a portable path by a recursive `metabase_field` query. Cards in a synced collection
  reference a handful of fields many times over, so those lookups should be answered once per field, not once per
  reference.

  Counts calls to [[metabase.models.db/field-hierarchy-rows]] (one app-DB query each) with a thread-local redef;
  the imports here run synchronously on this thread. Not ^:parallel: it creates and syncs shared content."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.models.db :as models.db]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- synced-tree []
  (into {} (map (juxt :path :content)) (source/serialize-specs (spec/extract-entities-for-export) nil)))

(defn- import-at! [src version]
  (let [task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
        result (impl/import! (source.p/snapshot-at src version) task :force? true)]
    (impl/handle-task-result! result task)
    result))

(defn- field-path-queries-on-forced-reload
  "Creates `n` MBQL cards that all reference the same two venues fields, loads them once, then counts field-path
  queries during a forced pull of the same content."
  [n]
  (search.tu/with-index-disabled
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (let [coll (t2/insert-returning-pk! :model/Collection {:name "Field paths" :is_remote_synced true :location "/"})]
          (dotimes [i n]
            (t2/insert! :model/Card
                        {:name                   (format "Field path card %03d" i)
                         :collection_id          coll
                         :creator_id             (mt/user->id :rasta)
                         :display                :line
                         :visualization_settings {}
                         :dataset_query          (mt/mbql-query venues
                                                   {:aggregation [[:sum $price]]
                                                    :breakout    [$category_id]
                                                    :filter      [:> $price i]})}))
          (let [src (rs.test/versioned-source :trees {"v0" (synced-tree)} :current "v0")]
            (is (= :success (:status (import-at! src "v0"))) "baseline load")
            (let [calls (atom 0)
                  real  (mt/original-fn #'models.db/field-hierarchy-rows)]
              (mt/with-dynamic-fn-redefs [models.db/field-hierarchy-rows (fn [& args] (swap! calls inc) (apply real args))]
                (is (= :success (:status (import-at! src "v0"))) "forced reload"))
              @calls)))))))

(deftest field-path-lookups-do-not-scale-with-cards-test
  (testing "A forced pull's field-path lookups are per distinct field, not per card: 20 cards over the same fields
            cost no more lookups than 10."
    (let [small (field-path-queries-on-forced-reload 10)
          large (field-path-queries-on-forced-reload 20)]
      (testing (format "field-path queries: %d at 10 cards, %d at 20 cards" small large)
        (is (pos? small) "the scenario exercises field-path lookups at all")
        (is (= small large))))))
