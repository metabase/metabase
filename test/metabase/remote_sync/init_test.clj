(ns metabase.remote-sync.init-test
  "Tests for remote sync initialization and hydration methods."
  (:require
   [clojure.test :refer :all]
   [metabase.remote-sync.init]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest is-remote-synced-hydration-test
  (testing ":is_remote_synced hydration adds boolean field indicating if item is in remote-synced collection"
    (mt/with-temp [:model/Collection remote-sync-coll {:name "Remote Sync Collection"
                                                       :is_remote_synced true
                                                       :location "/"}
                   :model/Collection normal-coll {:name "Normal Collection"
                                                  :location "/"}
                   :model/Card card-in-remote {:name "Card in Remote"
                                               :collection_id (:id remote-sync-coll)}
                   :model/Card card-in-normal {:name "Card in Normal"
                                               :collection_id (:id normal-coll)}
                   :model/Card card-no-coll {:name "Card without Collection"}]
      (let [hydrated-cards (t2/hydrate [card-in-remote card-in-normal card-no-coll] :is_remote_synced)]
        (testing "card in remote-synced collection has is_remote_synced = true"
          (is (true? (:is_remote_synced (first hydrated-cards)))))

        (testing "card in normal collection has is_remote_synced = false"
          (is (false? (:is_remote_synced (second hydrated-cards)))))

        (testing "card without collection has is_remote_synced = false"
          (is (false? (:is_remote_synced (nth hydrated-cards 2)))))))))

(deftest is-remote-synced-hydration-dashboard-test
  (testing ":is_remote_synced hydration works for dashboards"
    (mt/with-temp [:model/Collection remote-sync-coll {:name "Remote Sync Collection"
                                                       :is_remote_synced true
                                                       :location "/"}
                   :model/Collection normal-coll {:name "Normal Collection"
                                                  :location "/"}
                   :model/Dashboard dash-in-remote {:name "Dashboard in Remote"
                                                    :collection_id (:id remote-sync-coll)}
                   :model/Dashboard dash-in-normal {:name "Dashboard in Normal"
                                                    :collection_id (:id normal-coll)}]
      (let [hydrated-dashboards (t2/hydrate [dash-in-remote dash-in-normal] :is_remote_synced)]
        (testing "dashboard in remote-synced collection has is_remote_synced = true"
          (is (true? (:is_remote_synced (first hydrated-dashboards)))))

        (testing "dashboard in normal collection has is_remote_synced = false"
          (is (false? (:is_remote_synced (second hydrated-dashboards)))))))))

(deftest is-remote-synced-hydration-batched-test
  (testing ":is_remote_synced hydration is efficient with batch hydration"
    (mt/with-temp [:model/Collection remote-sync-coll {:name "Remote Sync Collection"
                                                       :is_remote_synced true
                                                       :location "/"}
                   :model/Collection normal-coll {:name "Normal Collection"
                                                  :location "/"}
                   :model/Card card1 {:name "Card 1" :collection_id (:id remote-sync-coll)}
                   :model/Card card2 {:name "Card 2" :collection_id (:id remote-sync-coll)}
                   :model/Card card3 {:name "Card 3" :collection_id (:id normal-coll)}
                   :model/Card card4 {:name "Card 4" :collection_id (:id normal-coll)}
                   :model/Card card5 {:name "Card 5"}]
      (let [hydrated-cards (t2/hydrate [card1 card2 card3 card4 card5] :is_remote_synced)]
        (testing "multiple cards in remote-synced collection are correctly hydrated"
          (is (true? (:is_remote_synced (first hydrated-cards))))
          (is (true? (:is_remote_synced (second hydrated-cards)))))

        (testing "multiple cards in normal collection are correctly hydrated"
          (is (false? (:is_remote_synced (nth hydrated-cards 2))))
          (is (false? (:is_remote_synced (nth hydrated-cards 3)))))

        (testing "card without collection is correctly hydrated"
          (is (false? (:is_remote_synced (nth hydrated-cards 4)))))))))

(deftest is-remote-synced-hydration-default-value-test
  (testing ":is_remote_synced hydration defaults to false when collection info is missing"
    (mt/with-temp [:model/Card card-no-coll {:name "Card without Collection"}]
      (let [hydrated-cards (t2/hydrate [card-no-coll] :is_remote_synced)]
        (testing "card without collection has is_remote_synced = false by default"
          (is (false? (:is_remote_synced (first hydrated-cards)))))))))
