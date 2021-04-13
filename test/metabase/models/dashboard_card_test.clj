(ns metabase.models.dashboard-card-test
  (:require [clojure.test :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.models.card-test :as card-test]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :as dashboard-card :refer [DashboardCard]]
            [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn remove-ids-and-timestamps [m]
  (let [f (fn [v]
            (cond
              (map? v) (remove-ids-and-timestamps v)
              (coll? v) (mapv remove-ids-and-timestamps v)
              :else v))]
    (into {} (for [[k v] m]
               (when-not (or (= :id k)
                             (.endsWith (name k) "_id")
                             (= :created_at k)
                             (= :updated_at k))
                 [k (f v)])))))

(deftest retrieve-dashboard-card-test
  (testing "retrieve-dashboard-card basic dashcard (no additional series)"
    (mt/with-temp* [Dashboard     [{dashboard-id :id}]
                    Card          [{card-id :id}]
                    DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id, :parameter_mappings [{:foo "bar"}]}]]
      (is (= {:sizeX                  2
              :sizeY                  2
              :col                    0
              :row                    0
              :parameter_mappings     [{:foo "bar"}]
              :visualization_settings {}
              :series                 []}
             (remove-ids-and-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id)))))))

(deftest retrieve-dashboard-card-with-additional-series-test
  (testing "retrieve-dashboard-card dashcard w/ additional series"
    (mt/with-temp* [Dashboard           [{dashboard-id :id}]
                    Card                [{card-id :id}]
                    Card                [{series-id-1 :id} {:name "Additional Series Card 1"}]
                    Card                [{series-id-2 :id} {:name "Additional Series Card 2"}]
                    DashboardCard       [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                    DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}]
                    DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]]
      (is (= {:sizeX                  2
              :sizeY                  2
              :col                    0
              :row                    0
              :parameter_mappings     []
              :visualization_settings {}
              :series                 [{:name                   "Additional Series Card 1"
                                        :description            nil
                                        :display                :table
                                        :dataset_query          {}
                                        :visualization_settings {}}
                                       {:name                   "Additional Series Card 2"
                                        :description            nil
                                        :display                :table
                                        :dataset_query          {}
                                        :visualization_settings {}}]}
             (remove-ids-and-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id)))))))

(deftest update-dashboard-card-series!-test
  (mt/with-temp* [Dashboard     [{dashboard-id :id} {:name       "Test Dashboard"
                                                     :creator_id (mt/user->id :rasta)}]
                  Card          [{card-id :id}]
                  DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                  Card          [{card-id-1 :id} {:name "card1"}]
                  Card          [{card-id-2 :id} {:name "card2"}]
                  Card          [{card-id3 :id} {:name "card3"}]]
    (let [upd-series (fn [series]
                       (dashboard-card/update-dashboard-card-series! {:id dashcard-id} series)
                       (set (for [card-id (db/select-field :card_id DashboardCardSeries, :dashboardcard_id dashcard-id)]
                              (db/select-one-field :name Card, :id card-id))))]
      (is (= #{}
             (upd-series [])))
      (is (= #{"card1"}
             (upd-series [card-id-1])))
      (is (= #{"card2"}
             (upd-series [card-id-2])))
      (is (= #{"card1" "card2"}
             (upd-series [card-id-2 card-id-1])))
      (is (= #{"card3" "card1"}
             (upd-series [card-id-1 card-id3]))))))

(deftest create-dashboard-card!-test
  (testing "create-dashboard-card! simple example with a single card"
    (mt/with-temp* [Dashboard [{dashboard-id :id}]
                    Card      [{card-id :id} {:name "Test Card"}]]
      (let [dashboard-card (dashboard-card/create-dashboard-card!
                            {:creator_id             (mt/user->id :rasta)
                             :dashboard_id           dashboard-id
                             :card_id                card-id
                             :sizeX                  4
                             :sizeY                  3
                             :row                    1
                             :col                    1
                             :parameter_mappings     [{:foo "bar"}]
                             :visualization_settings {}
                             :series                 [card-id]})]
        (testing "return value from function"
          (is (= {:sizeX                  4
                  :sizeY                  3
                  :col                    1
                  :row                    1
                  :parameter_mappings     [{:foo "bar"}]
                  :visualization_settings {}
                  :series                 [{:name                   "Test Card"
                                            :description            nil
                                            :display                :table
                                            :dataset_query          {}
                                            :visualization_settings {}}]}
                 (remove-ids-and-timestamps dashboard-card))))
        (testing "validate db captured everything"
          (is (= {:sizeX                  4
                  :sizeY                  3
                  :col                    1
                  :row                    1
                  :parameter_mappings     [{:foo "bar"}]
                  :visualization_settings {}
                  :series                 [{:name                   "Test Card"
                                            :description            nil
                                            :display                :table
                                            :dataset_query          {}
                                            :visualization_settings {}}]}
                 (remove-ids-and-timestamps (dashboard-card/retrieve-dashboard-card (:id dashboard-card))))))))))

(deftest update-dashboard-card!-test
  (testing (str "update-dashboard-card! basic update. We are testing multiple things here: 1. ability to update all "
                "the normal attributes for size/position 2. ability to update series and ensure proper ordering 3. "
                "ensure the card_id cannot be changed 4. ensure the dashboard_id cannot be changed")
    (mt/with-temp* [Dashboard     [{dashboard-id :id}]
                    Card          [{card-id :id}]
                    DashboardCard [{dashcard-id :id} {:dashboard_id       dashboard-id
                                                      :card_id            card-id
                                                      :parameter_mappings [{:foo "bar"}]}]
                    Card          [{card-id-1 :id}   {:name "Test Card 1"}]
                    Card          [{card-id-2 :id}   {:name "Test Card 2"}]]
      (testing "unmodified dashcard"
        (is (= {:sizeX                  2
                :sizeY                  2
                :col                    0
                :row                    0
                :parameter_mappings     [{:foo "bar"}]
                :visualization_settings {}
                :series                 []}
               (remove-ids-and-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id)))))
      (testing "return value from the update call"
        (is (= {:sizeX                  4
                :sizeY                  3
                :col                    1
                :row                    1
                :parameter_mappings     [{:foo "barbar"}]
                :visualization_settings {}
                :series                 [{:name                   "Test Card 2"
                                          :description            nil
                                          :display                :table
                                          :dataset_query          {}
                                          :visualization_settings {}}
                                         {:name                   "Test Card 1"
                                          :description            nil
                                          :display                :table
                                          :dataset_query          {}
                                          :visualization_settings {}}]}
               (remove-ids-and-timestamps
                (dashboard-card/update-dashboard-card!
                 {:id                     dashcard-id
                  :actor_id               (mt/user->id :rasta)
                  :dashboard_id           nil
                  :card_id                nil
                  :sizeX                  4
                  :sizeY                  3
                  :row                    1
                  :col                    1
                  :parameter_mappings     [{:foo "barbar"}]
                  :visualization_settings {}
                  :series                 [card-id-2 card-id-1]})))))
      (testing "validate db captured everything"
        (is (= {:sizeX                  4
                :sizeY                  3
                :col                    1
                :row                    1
                :parameter_mappings     [{:foo "barbar"}]
                :visualization_settings {}
                :series                 [{:name                   "Test Card 2"
                                          :description            nil
                                          :display                :table
                                          :dataset_query          {}
                                          :visualization_settings {}}
                                         {:name                   "Test Card 1"
                                          :description            nil
                                          :display                :table
                                          :dataset_query          {}
                                          :visualization_settings {}}]}
               (remove-ids-and-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id))))))))

(deftest normalize-parameter-mappings-test
  (testing "DashboardCard parameter mappings should get normalized when coming out of the DB"
    (mt/with-temp* [Dashboard     [dashboard {:parameters [{:name "Venue ID"
                                                            :slug "venue_id"
                                                            :id   "22486e00"
                                                            :type "id"}]}]
                    Card          [card]
                    DashboardCard [dashcard {:dashboard_id       (u/the-id dashboard)
                                             :card_id            (u/the-id card)
                                             :parameter_mappings [{:parameter_id "22486e00"
                                                                   :card_id      (u/the-id card)
                                                                   :target       [:dimension [:field-id (mt/id :venues :id)]]}]}]]
      (is (= [{:parameter_id "22486e00"
               :card_id      (u/the-id card)
               :target       [:dimension [:field (mt/id :venues :id) nil]]}]
             (db/select-one-field :parameter_mappings DashboardCard :id (u/the-id dashcard)))))))

(deftest normalize-visualization-settings-test
  (testing "DashboardCard visualization settings should get normalized to use modern MBQL syntax"
    (mt/with-temp* [Card      [card]
                    Dashboard [dashboard]]
      (card-test/test-visualization-settings-normalization
       (fn [original expected]
         (mt/with-temp DashboardCard [dashcard {:dashboard_id           (u/the-id dashboard)
                                                :card_id                (u/the-id card)
                                                :visualization_settings original}]
           (is (= expected
                  (db/select-one-field :visualization_settings DashboardCard :id (u/the-id dashcard))))))))))
