(ns metabase.revisions.events-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.segments.models.segment :as segment]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- revisions-of [model model-id]
  (t2/select :model/Revision :model model :model_id model-id {:order-by [[:id :asc]]}))

(deftest card-revisions-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (let [{card-id :id} (first (card/create-cards! [{:creator_id (mt/user->id :rasta) :database_id (mt/id) :dataset_query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues))) :display :table :name (mt/random-name) :visualization_settings {}}]))]
        (testing "the insert records a creation"
          (is (=? [{:is_creation true :user_id (mt/user->id :crowberto)}] (revisions-of "Card" card-id))))
        (testing "an update records a revision"
          (card/update-cards! [{:id card-id :name "renamed"}])
          (is (=? [{:is_creation true} {:is_creation false :object {:name "renamed"}}] (revisions-of "Card" card-id))))
        (testing "an update of what revisions leave out records none"
          (card/update-cards! [{:id card-id :collection_position 3}])
          (is (= 2 (count (revisions-of "Card" card-id)))))))))

(deftest no-user-records-nothing-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (card/update-cards! [{:id card-id :name "renamed"}])
    (is (empty? (revisions-of "Card" card-id)))))

(deftest dashboard-writes-are-one-revision-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                   :model/Card      {card-id :id}      {}]
      (let [before (count (revisions-of "Dashboard" dashboard-id))]
        (dashboard-card/create-dashboard-cards!
         (for [i (range 2)]
           {:dashboard_id dashboard-id :card_id card-id :row i :col 0 :size_x 4 :size_y 4}))
        (testing "the writes of the parts record no Revision of the Dashboard"
          (is (= before (count (revisions-of "Dashboard" dashboard-id)))))
        (dashboard/touch-dashboards! [dashboard-id] {:context {:revision-message "add two"}})
        (is (= (inc before) (count (revisions-of "Dashboard" dashboard-id))))
        (is (=? {:message "add two" :object {:cards [{} {}]}}
                (last (revisions-of "Dashboard" dashboard-id))))))))

(deftest segment-update-message-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Segment {segment-id :id} {}]
      (segment/update-segments! [{:id segment-id :name "renamed"}] {:context {:revision-message "why"}})
      (is (=? {:message "why"} (last (revisions-of "Segment" segment-id)))))))

(defn- last-object [model model-id]
  (:object (last (revisions-of model model-id))))

(deftest card-revision-object-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (let [{card-id :id} (first (card/create-cards! [(merge {:creator_id (mt/user->id :rasta) :database_id (mt/id) :dataset_query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues))) :display :table :name (mt/random-name) :visualization_settings {}} {:name "Card"})]))
            object        (last-object "Card" card-id)]
        (testing "the stored object is the serialized card"
          (is (=? {:name "Card" :archived false :type :question :database_id (mt/id)} object)))
        (testing "it holds nothing of the public link"
          (is (empty? (set/intersection #{:public_uuid :made_public_by_id :enable_embedding :embedding_params}
                                        (set (keys object))))))))))

(deftest card-query-update-revision-has-derived-columns-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {card-id :id} {:name "Card"}]
      (let [mp (mt/metadata-provider)]
        (card/update-cards! [{:id            card-id
                              :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :users)))}]))
      (testing "the revision of a change of the query holds the columns the model derives from it"
        (is (=? {:table_id (mt/id :users) :database_id (mt/id) :query_type :query}
                (last-object "Card" card-id)))))))

(deftest dashboard-revision-object-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Dashboard]
      (let [{dashboard-id :id} (first (dashboard/create-dashboards! [{:name "Dashboard" :creator_id (mt/user->id :crowberto)}]))
            object             (last-object "Dashboard" dashboard-id)]
        (is (=? {:name "Dashboard" :archived false :tabs [] :cards []} object))
        (is (empty? (set/intersection #{:public_uuid :made_public_by_id :enable_embedding}
                                      (set (keys object)))))))))

(deftest dashboard-touch-after-part-writes-records-revision-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                   :model/Card      {card-id :id}      {}
                   :model/Card      {series-id :id}    {}]
      (let [revisions #(count (revisions-of "Dashboard" dashboard-id))
            records!  (fn [what write]
                        (let [before (revisions)]
                          (write)
                          (testing what
                            (is (= before (revisions)))
                            (dashboard/touch-dashboards! [dashboard-id])
                            (is (= (inc before) (revisions))))))
            tab-id    (atom nil)
            dashcard  (atom nil)]
        (records! "adding a tab"
                  #(reset! tab-id (first (map :id (dashboard-tab/create-dashboard-tabs! [{:dashboard_id dashboard-id :name "First" :position 0}])))))
        (is (=? {:tabs [{:id @tab-id :name "First"}]} (last-object "Dashboard" dashboard-id)))
        (records! "renaming a tab"
                  #(dashboard-tab/replace-dashboard-tabs! dashboard-id
                                                          (t2/select :model/DashboardTab :dashboard_id dashboard-id)
                                                          [{:id @tab-id :name "Renamed" :position 0}]))
        (is (=? {:tabs [{:name "Renamed"}]} (last-object "Dashboard" dashboard-id)))
        (records! "adding a dashcard"
                  #(reset! dashcard (:id (first (dashboard-card/create-dashboard-cards!
                                                 [{:dashboard_id dashboard-id :card_id card-id
                                                   :row 0 :col 0 :size_x 4 :size_y 4}])))))
        (records! "repositioning a dashcard" #(dashboard-card/update-dashboard-cards! [{:id @dashcard :size_x 3}]))
        (is (=? {:cards [{:size_x 3}]} (last-object "Dashboard" dashboard-id)))
        (records! "adding a series to a dashcard"
                  #(dashboard-card/update-dashboard-cards! (mapv (fn [[id series]] {:id id :series series}) {@dashcard [series-id]})))
        (is (=? {:cards [{:series [series-id]}]} (last-object "Dashboard" dashboard-id)))
        (records! "removing the series"
                  #(dashboard-card/update-dashboard-cards! (mapv (fn [[id series]] {:id id :series series}) {@dashcard []})))
        (is (=? {:cards [{:series []}]} (last-object "Dashboard" dashboard-id)))
        (records! "removing a dashcard" #(dashboard-card/delete-dashboard-cards! [@dashcard]))
        (is (=? {:cards []} (last-object "Dashboard" dashboard-id)))
        (records! "removing a tab"
                  #(dashboard-tab/replace-dashboard-tabs! dashboard-id (t2/select :model/DashboardTab :dashboard_id dashboard-id) []))
        (is (=? {:tabs []} (last-object "Dashboard" dashboard-id)))))))

(defn- revision-statement-count!
  "The statements that the revisions consumer runs for the touch of each of `n` new Dashboards after a user's write of a
  dashcard of each, which records a Revision of each Dashboard."
  [card-id n]
  (let [dashboard-ids (atom nil)]
    (events.tu/consumer-statement-count! :model/Dashboard
                                         (repeatedly n #(mt/with-temp-defaults :model/Dashboard))
                                         (fn [ids]
                                           (reset! dashboard-ids ids)
                                           (dashboard-card/create-dashboard-cards!
                                            (for [id ids]
                                              (assoc (mt/with-temp-defaults :model/DashboardCard)
                                                     :dashboard_id id :card_id card-id)))
                                           (dashboard/touch-dashboards! ids))
                                         #(mt/with-current-user (mt/user->id :crowberto)
                                            (u/prog1 (%)
                                              (is (= (count @dashboard-ids)
                                                     (t2/count :model/Revision :model "Dashboard"
                                                               :model_id [:in @dashboard-ids])))))
                                         #(mt/with-current-user nil (%)))))

(deftest batch-of-part-writes-records-with-fixed-statements-test
  (testing "the touch of 2 or 6 Dashboards after dashcard writes records a Revision each with the same number of statements"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {}]
        (is (= (revision-statement-count! card-id 2) (revision-statement-count! card-id 6)))))))

(deftest dashboard-save-is-one-revision-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Before"}
                   :model/Card      {card-id :id}      {}
                   :model/Card      {series-id :id}    {}]
      (let [before (count (revisions-of "Dashboard" dashboard-id))
            save   (fn [updates]
                     (dashboards.write/update-dashboard! dashboard-id updates)
                     (count (revisions-of "Dashboard" dashboard-id)))]
        (testing "a save that changes the Dashboard, its tabs, its dashcards and their series is one Revision"
          (is (= (inc before)
                 (save {:name      "After"
                        :tabs      [{:id -1 :name "Tab"}]
                        :dashcards [{:id -1 :card_id card-id :dashboard_tab_id -1 :row 0 :col 0 :size_x 4 :size_y 4
                                     :series [{:id series-id}]}]})))
          (is (=? {:name "After" :tabs [{:name "Tab"}] :cards [{:card_id card-id :series [series-id]}]}
                  (last-object "Dashboard" dashboard-id))))
        (testing "a save that changes only dashcards is one Revision"
          (let [dashcard-id (t2/select-one-pk :model/DashboardCard :dashboard_id dashboard-id)
                tab-id      (t2/select-one-pk :model/DashboardTab :dashboard_id dashboard-id)]
            (is (= (+ before 2)
                   (save {:tabs      [{:id tab-id :name "Tab"}]
                          :dashcards [{:id dashcard-id :card_id card-id :dashboard_tab_id tab-id :row 1 :col 0
                                       :size_x 4 :size_y 4 :series []}]})))))))))
