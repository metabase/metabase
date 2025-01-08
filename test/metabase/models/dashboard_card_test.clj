(ns metabase.models.dashboard-card-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.card-test :as card-test]
   [metabase.models.dashboard :as dashboard]
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

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

(deftest ^:parallel retrieve-dashboard-card-test
  (testing "retrieve-dashboard-card basic dashcard (no additional series)"
    (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                   :model/Card          {card-id :id}      {}
                   :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id :card_id card-id :parameter_mappings [{:foo "bar"}]}]
      (is (= {:size_x                 4
              :size_y                 4
              :col                    0
              :row                    0
              :parameter_mappings     [{:foo "bar"}]
              :visualization_settings {}
              :series                 []}
             (remove-ids-and-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id)))))))

(deftest ^:parallel retrieve-dashboard-card-with-additional-series-test
  (testing "retrieve-dashboard-card dashcard w/ additional series"
    (mt/with-temp [:model/Dashboard           {dashboard-id :id} {}
                   :model/Card                {card-id :id} {}
                   :model/Card                {series-id-1 :id} {:name "Additional Series Card 1"}
                   :model/Card                {series-id-2 :id} {:name "Additional Series Card 2"}
                   :model/DashboardCard       {dashcard-id :id} {:dashboard_id dashboard-id :card_id card-id}
                   :model/DashboardCardSeries _                 {:dashboardcard_id dashcard-id :card_id series-id-1 :position 0}
                   :model/DashboardCardSeries _                 {:dashboardcard_id dashcard-id :card_id series-id-2 :position 1}]
      (is (= {:size_x                 4
              :size_y                 4
              :col                    0
              :row                    0
              :parameter_mappings     []
              :visualization_settings {}
              :series                 [{:name                   "Additional Series Card 1"
                                        :description            nil
                                        :display                :table
                                        :type                   :question
                                        :dataset_query          {}
                                        :visualization_settings {}}
                                       {:name                   "Additional Series Card 2"
                                        :description            nil
                                        :display                :table
                                        :type                   :question
                                        :dataset_query          {}
                                        :visualization_settings {}}]}
             (remove-ids-and-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id)))))))

(deftest ^:parallel dashcard->multi-card-test
  (testing "Check that the multi-cards are returned"
    (mt/with-temp [:model/Card                card1 {}
                   :model/Card                card2 {}
                   :model/Dashboard           dashboard {}
                   :model/DashboardCard       dc-1 {:dashboard_id (u/the-id dashboard) :card_id (u/the-id card1)}
                   :model/DashboardCard       _    {:dashboard_id (u/the-id dashboard) :card_id (u/the-id card2)}
                   :model/DashboardCardSeries _    {:dashboardcard_id (u/the-id dc-1) :card_id (u/the-id card2)}]
      (testing "get multi-cards"
        (is (= 1 (count (dashboard-card/dashcard->multi-cards dc-1))))))))

(deftest update-dashboard-card-series!-test
  (mt/with-temp [:model/Dashboard     {dashboard-id :id} {:name       "Test Dashboard"
                                                          :creator_id (mt/user->id :rasta)}
                 :model/Card          {card-id :id} {}
                 :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}
                 :model/Card          {card-id-1 :id} {:name "card1"}
                 :model/Card          {card-id-2 :id} {:name "card2"}
                 :model/Card          {card-id3 :id} {:name "card3"}]
    (let [upd-series (fn [series]
                       (dashboard-card/update-dashboard-cards-series! {dashcard-id series})
                       (set (for [card-id (t2/select-fn-set :card_id :model/DashboardCardSeries, :dashboardcard_id dashcard-id)]
                              (t2/select-one-fn :name :model/Card, :id card-id))))]
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
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                   :model/Card      {card-id :id} {:name "Test Card"}]
      (let [dashboard-card (first (dashboard-card/create-dashboard-cards!
                                   [{:dashboard_id           dashboard-id
                                     :card_id                card-id
                                     :size_x                 4
                                     :size_y                 3
                                     :row                    1
                                     :col                    1
                                     :parameter_mappings     [{:foo "bar"}]
                                     :visualization_settings {}
                                     :series                 [card-id]}]))]
        (testing "return value from function"
          (is (= {:size_x                 4
                  :size_y                 3
                  :col                    1
                  :row                    1
                  :parameter_mappings     [{:foo "bar"}]
                  :visualization_settings {}
                  :series                 [{:name                   "Test Card"
                                            :description            nil
                                            :display                :table
                                            :type                   :question
                                            :dataset_query          {}
                                            :visualization_settings {}}]}
                 (remove-ids-and-timestamps dashboard-card))))
        (testing "validate db captured everything"
          (is (= {:size_x                 4
                  :size_y                 3
                  :col                    1
                  :row                    1
                  :parameter_mappings     [{:foo "bar"}]
                  :visualization_settings {}
                  :series                 [{:name                   "Test Card"
                                            :description            nil
                                            :display                :table
                                            :type                   :question
                                            :dataset_query          {}
                                            :visualization_settings {}}]}
                 (remove-ids-and-timestamps (dashboard-card/retrieve-dashboard-card (:id dashboard-card))))))))))

(deftest update-dashboard-card!-test
  (testing (str "update-dashboard-card! basic update. We are testing multiple things here: 1. ability to update all "
                "the normal attributes for size/position 2. ability to update series and ensure proper ordering 3. "
                "ensure the card_id cannot be changed 4. ensure the dashboard_id cannot be changed")
    (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                   :model/Card          {card-id :id} {}
                   :model/DashboardCard {dashcard-id :id
                                         :as dashboard-card} {:dashboard_id       dashboard-id
                                                              :card_id            card-id
                                                              :parameter_mappings [{:foo "bar"}]}
                   :model/Card          {card-id-1 :id}   {:name "Test Card 1"}
                   :model/Card          {card-id-2 :id}   {:name "Test Card 2"}]
      (testing "unmodified dashcard"
        (is (= {:size_x                 4
                :size_y                 4
                :col                    0
                :row                    0
                :parameter_mappings     [{:foo "bar"}]
                :visualization_settings {}
                :series                 []}
               (remove-ids-and-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id)))))
      (testing "return value from the update call should be nil"
        (is (nil? (dashboard-card/update-dashboard-card!
                   {:id                     dashcard-id
                    :actor_id               (mt/user->id :rasta)
                    :dashboard_id           nil
                    :card_id                nil
                    :size_x                 5
                    :size_y                 3
                    :row                    1
                    :col                    1
                    :parameter_mappings     [{:foo "barbar"}]
                    :visualization_settings {}
                    :series                 [card-id-2 card-id-1]}
                   dashboard-card))))
      (testing "validate db captured everything"
        (is (= {:size_x                 5
                :size_y                 3
                :col                    1
                :row                    1
                :parameter_mappings     [{:foo "barbar"}]
                :visualization_settings {}
                :series                 [{:name                   "Test Card 2"
                                          :description            nil
                                          :display                :table
                                          :type                   :question
                                          :dataset_query          {}
                                          :visualization_settings {}}
                                         {:name                   "Test Card 1"
                                          :description            nil
                                          :display                :table
                                          :type                   :question
                                          :dataset_query          {}
                                          :visualization_settings {}}]}
               (remove-ids-and-timestamps (dashboard-card/retrieve-dashboard-card dashcard-id))))))))

(deftest update-dashboard-card!-call-count-test
  (testing "This tracks the call count of update-dashcards! for the purpose of optimizing the
           PUT /api/dashboard/:id/cards handler"
    (mt/with-temp [:model/Dashboard     {dashboard-id :id :as dashboard} {}
                   :model/Card          {card-id :id} {}
                   :model/DashboardCard dashcard-1 {:dashboard_id dashboard-id :card_id card-id}
                   :model/DashboardCard dashcard-2 {:dashboard_id dashboard-id :card_id card-id}
                   :model/DashboardCard dashcard-3 {:dashboard_id dashboard-id :card_id card-id}
                   :model/Card          {series-id-1 :id} {:name "Series Card 1"}
                   :model/Card          {series-id-2 :id} {:name "Series Card 2"}]
      (let [dashboard (t2/hydrate dashboard [:dashcards :series :card])]
        (testing "Should have fewer DB calls if there are no changes to the dashcards"
          (t2/with-call-count [call-count]
            (dashboard/update-dashcards! dashboard [dashcard-1 dashcard-2 dashcard-3])
            (is (= 1 (call-count)))))
        (testing "Should have more calls if there are changes to the dashcards"
          (t2/with-call-count [call-count]
            (dashboard/update-dashcards! dashboard [{:id     (:id dashcard-1)
                                                     :cardId card-id
                                                     :row    1
                                                     :col    2
                                                     :size_x 3
                                                     :size_y 4
                                                     :series [{:id series-id-1}]}
                                                    {:id     (:id dashcard-2)
                                                     :cardId card-id
                                                     :row    1
                                                     :col    2
                                                     :size_x 3
                                                     :size_y 4
                                                     :series [{:id series-id-2}]}
                                                    {:id     (:id dashcard-3)
                                                     :cardId card-id
                                                     :row    1
                                                     :col    2
                                                     :size_x 3
                                                     :size_y 4
                                                     :series []}])
            ;; this is usually 10, but it can be 11 sometimes in CI for some reason
            (is (contains? #{10 11} (call-count)))))))))

(deftest ^:parallel normalize-parameter-mappings-test
  (testing "DashboardCard parameter mappings should get normalized when coming out of the DB"
    (mt/with-temp [:model/Dashboard     dashboard {:parameters [{:name "Venue ID"
                                                                 :slug "venue_id"
                                                                 :id   "22486e00"
                                                                 :type "id"}]}
                   :model/Card          card      {}
                   :model/DashboardCard dashcard  {:dashboard_id       (u/the-id dashboard)
                                                   :card_id            (u/the-id card)
                                                   :parameter_mappings [{:parameter_id "22486e00"
                                                                         :card_id      (u/the-id card)
                                                                         :target       [:dimension [:field-id (mt/id :venues :id)]]}]}]
      (is (= [{:parameter_id "22486e00"
               :card_id      (u/the-id card)
               :target       [:dimension [:field (mt/id :venues :id) nil]]}]
             (t2/select-one-fn :parameter_mappings :model/DashboardCard :id (u/the-id dashcard)))))))

(deftest ^:parallel normalize-visualization-settings-test
  (testing "DashboardCard visualization settings should get normalized to use modern MBQL syntax"
    (mt/with-temp [:model/Card      card      {}
                   :model/Dashboard dashboard {}]
      (card-test/test-visualization-settings-normalization
       (fn [original expected]
         (t2.with-temp/with-temp [:model/DashboardCard dashcard {:dashboard_id           (u/the-id dashboard)
                                                                 :card_id                (u/the-id card)
                                                                 :visualization_settings original}]
           (is (= expected
                  (t2/select-one-fn :visualization_settings :model/DashboardCard :id (u/the-id dashcard))))))))))

(deftest ^:parallel normalize-parameter-mappings-test-2
  (testing "make sure parameter mappings correctly normalize things like legacy MBQL clauses"
    (is (= [{:target [:dimension [:field 30 {:source-field 23}]]}]
           ((:out mi/transform-parameters-list)
            (json/encode
             [{:target [:dimension [:fk-> 23 30]]}]))))

    (testing "...but parameter mappings we should not normalize things like :target"
      (is (= [{:card-id 123, :hash "abc", :target "foo"}]
             ((:out mi/transform-parameters-list)
              (json/encode
               [{:card-id 123, :hash "abc", :target "foo"}])))))))

(deftest ^:parallel keep-empty-parameter-mappings-empty-test
  (testing (str "we should keep empty parameter mappings as empty instead of making them nil (if `normalize` removes "
                "them because they are empty) (I think this is to prevent NPEs on the FE? Not sure why we do this)")
    (is (= []
           ((:out mi/transform-parameters-list)
            (json/encode []))))))

(deftest ^:parallel normalize-card-parameter-mappings-test
  (doseq [parameters [[]
                      [{:name "Time grouping"
                        :slug "time_grouping"
                        :id "8e366c15"
                        :type :temporal-unit
                        :sectionId "temporal-unit"
                        :temporal_units [:minute :quarter-of-year]}]]]
    (is (= parameters
           ((:out mi/transform-card-parameters-list)
            (json/encode parameters))))))

(deftest ^:parallel identity-hash-test
  (testing "Dashboard card hashes are composed of the card hash, dashboard hash, and visualization settings"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (mt/with-temp [:model/Collection    c1       {:name "top level" :location "/" :created_at now}
                     :model/Dashboard     dash     {:name "my dashboard"  :collection_id (:id c1) :created_at now}
                     :model/Card          card     {:name "some question" :collection_id (:id c1) :created_at now}
                     :model/DashboardCard dashcard {:card_id                (:id card)
                                                    :dashboard_id           (:id dash)
                                                    :visualization_settings {}
                                                    :row                    6
                                                    :col                    3
                                                    :created_at             now}]
        (is (= "1311d6dc"
               (serdes/raw-hash [(serdes/identity-hash card) (serdes/identity-hash dash) {} 6 3 now])
               (serdes/identity-hash dashcard)))))))

(deftest ^:parallel from-decoded-json-test
  (testing "Dashboard Cards should remain the same if they are serialized to JSON,
            deserialized, and finally transformed with `from-parsed-json`."
    (mt/with-temp [:model/Dashboard     dash     {:name "my dashboard"}
                   :model/Card          card     {:name "some question"}
                   :model/DashboardCard dashcard {:card_id (:id card)
                                                  :dashboard_id (:id dash)
                                                  :visualization_settings {:click_behavior {:type         "link",
                                                                                            :linkType     "url",
                                                                                            :linkTemplate "/dashboard/1?year={{column:Year}}"}}
                                                  :parameter_mappings     [{:card_id (:id card)
                                                                            :parameter_id "-1419866742"
                                                                            :target [:dimension [:field 1 nil]]}]
                                                  :row                    4
                                                  :col                    3}]
      ;; NOTE: we need to remove `:created_at` and `:updated_at` because they are not
      ;; transformed by `from-parsed-json`
      (let [dashcard     (dissoc (t2/select-one :model/DashboardCard :id (u/the-id dashcard))
                                 :created_at :updated_at)
            serialized   (json/encode dashcard)
            deserialized (json/decode+kw serialized)
            transformed  (dashboard-card/from-parsed-json deserialized)]
        (is (= dashcard
               transformed))))))
