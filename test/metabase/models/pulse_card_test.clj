(ns metabase.models.pulse-card-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.card :refer [Card]]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card :refer [DashboardCard]]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-card :as pulse-card :refer [PulseCard]]
   [metabase.models.serialization :as serdes]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

(deftest test-next-position-for
  (testing "No existing cards"
    (t2.with-temp/with-temp [Pulse {pulse-id :id}]
      (is (zero? (pulse-card/next-position-for pulse-id)))))
  (testing "With cards"
    (t2.with-temp/with-temp [Pulse         {pulse-id :id}     {}
                             Card          {card-id :id}      {}
                             Dashboard     {dashboard-id :id} {}
                             DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id}
                             PulseCard     _                  {:pulse_id          pulse-id
                                                               :card_id           card-id
                                                               :dashboard_card_id dashcard-id
                                                               :position          2}]
      (is (= 3 (pulse-card/next-position-for pulse-id))))))

(deftest identity-hash-test
  (testing "Pulse card hashes are composed of the pulse's hash and the card's hash"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (t2.with-temp/with-temp [Collection coll1      {:name "field-db" :location "/" :created_at now}
                               Collection coll2      {:name "other collection" :location "/" :created_at now}
                               Card       card       {:name "the card" :collection_id (:id coll1) :created_at now}
                               Pulse      pulse      {:name "my pulse" :collection_id (:id coll2) :created_at now}
                               PulseCard  pulse-card {:card_id (:id card) :pulse_id (:id pulse) :position 4}]
        (is (= "9ad1b5a4"
               (serdes/raw-hash [(serdes/identity-hash pulse) (serdes/identity-hash card) 4])
               (serdes/identity-hash pulse-card)))))))
