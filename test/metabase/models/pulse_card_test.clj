(ns metabase.models.pulse-card-test
  (:require [clojure.test :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.pulse-card :as pulse-card :refer [PulseCard]]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.test :as mt]
            [toucan.util.test :as tt]))

(deftest test-next-position-for
  (testing "No existing cards"
    (tt/with-temp Pulse [{pulse-id :id}]
      (is (zero? (pulse-card/next-position-for pulse-id)))))
  (testing "With cards"
    (tt/with-temp* [Pulse [{pulse-id :id}]
                    Card  [{card-id :id}]
                    Dashboard [{dashboard-id :id}]
                    DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id}]
                    PulseCard [_ {:pulse_id          pulse-id
                                  :card_id           card-id
                                  :dashboard_card_id dashcard-id
                                  :position 2}]]
      (is (= 3 (pulse-card/next-position-for pulse-id))))))

(deftest identity-hash-test
  (testing "Pulse card hashes are composed of the pulse's hash and the card's hash"
    (mt/with-temp* [Collection  [coll1      {:name "field-db" :location "/"}]
                    Collection  [coll2      {:name "other collection" :location "/"}]
                    Card        [card       {:name "the card" :collection_id (:id coll1)}]
                    Pulse       [pulse      {:name "my pulse" :collection_id (:id coll2)}]
                    PulseCard   [pulse-card {:card_id (:id card) :pulse_id (:id pulse)}]]
      (is (= "cd532201"
             (serdes.hash/raw-hash [(serdes.hash/identity-hash pulse) (serdes.hash/identity-hash card)])
             (serdes.hash/identity-hash pulse-card))))))
