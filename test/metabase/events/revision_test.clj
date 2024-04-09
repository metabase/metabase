(ns metabase.events.revision-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.models
    :refer [Card Dashboard DashboardCard Database LegacyMetric Revision Segment Table]]
   [metabase.models.dashboard :as dashboard]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- card-properties
  "Some default properties for `Cards` for use in tests in this namespace."
  []
  {:display                "table"
   :dataset_query          {:database (mt/id)
                            :type     :query
                            :query    {:source-table (mt/id :categories)}}
   :visualization_settings {}
   :creator_id             (mt/user->id :crowberto)})

(defn- card->revision-object [card]
  {:archived               false
   :collection_id          nil
   :collection_position    nil
   :collection_preview     true
   :database_id            (mt/id)
   :dataset_query          (:dataset_query card)
   :type                   :question
   :description            nil
   :display                :table
   :enable_embedding       false
   :embedding_params       nil
   :name                   (:name card)
   :parameters             []
   :parameter_mappings     []
   :cache_ttl              nil
   :query_type             :query
   :table_id               (mt/id :categories)
   :visualization_settings {}})

(defn- dashboard->revision-object [dashboard]
  {:collection_id       (:collection_id dashboard)
   :description         nil
   :cache_ttl           nil
   :auto_apply_filters  true
   :name                (:name dashboard)
   :width               (:width dashboard)
   :tabs                []
   :cards               []
   :archived            false
   :collection_position nil
   :enable_embedding    false
   :embedding_params    nil
   :parameters          []})

(deftest card-create-test
  (testing :event/card-create
    (t2.with-temp/with-temp [Card {card-id :id, :as card} (card-properties)]
      (events/publish-event! :event/card-create {:object card :user-id (mt/user->id :crowberto)})
      (is (= {:model        "Card"
              :model_id     card-id
              :user_id      (mt/user->id :crowberto)
              :object       (card->revision-object card)
              :is_reversion false
              :is_creation  true}
             (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                            :model       "Card"
                            :model_id    card-id))))))

(deftest card-update-test
  (testing :event/card-update
   (t2.with-temp/with-temp [Card {card-id :id, :as card} (card-properties)]
     (events/publish-event! :event/card-update {:object card :user-id (mt/user->id :crowberto)})
     (is (= {:model        "Card"
             :model_id     card-id
             :user_id      (mt/user->id :crowberto)
             :object       (card->revision-object card)
             :is_reversion false
             :is_creation  false}
            (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                           :model       "Card"
                           :model_id    card-id))))))

(deftest card-update-shoud-not-contains-public-info-test
  (testing :event/card-update
    (t2.with-temp/with-temp [Card {card-id :id, :as card} (card-properties)]
      (events/publish-event! :event/card-update {:object card :user-id (mt/user->id :crowberto)})
      ;; we don't want the public_uuid and made_public_by_id to be recorded in a revision
      ;; otherwise revert a card to earlier revision might toggle the public sharing settings
      (is (empty? (set/intersection #{:public_uuid :made_public_by_id}
                                    (->> (t2/select-one-fn :object Revision
                                                           :model       "Card"
                                                           :model_id    card-id)
                                     keys set)))))))

(deftest dashboard-create-test
  (testing :event/dashboard-create
    (mt/with-test-user :rasta
     (t2.with-temp/with-temp [Dashboard {dashboard-id :id, :as dashboard}]
       (events/publish-event! :event/dashboard-create {:object dashboard :user-id (mt/user->id :rasta)})
       (is (= {:model        "Dashboard"
               :model_id     dashboard-id
               :user_id      (mt/user->id :rasta)
               :object       (assoc (dashboard->revision-object dashboard) :cards [])
               :is_reversion false
               :is_creation  true}
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                             :model "Dashboard"
                             :model_id dashboard-id)))))))

(deftest dashboard-update-test
  (testing :event/dashboard-update
    (mt/with-test-user :rasta
     (t2.with-temp/with-temp [Dashboard {dashboard-id :id, :as dashboard}]
       (events/publish-event! :event/dashboard-update {:object dashboard :user-id (mt/user->id :rasta)})
       (is (= {:model        "Dashboard"
               :model_id     dashboard-id
               :user_id      (mt/user->id :rasta)
               :object       (dashboard->revision-object dashboard)
               :is_reversion false
               :is_creation  false}
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                             :model    "Dashboard"
                             :model_id dashboard-id)))))))

(deftest dashboard-update-shoud-not-contains-public-info-test
  (testing :event/dashboard-update
    (mt/with-test-user :rasta
     (t2.with-temp/with-temp [Dashboard {dashboard-id :id, :as dashboard}]
       (events/publish-event! :event/dashboard-update {:object dashboard :user-id (mt/user->id :rasta)})

       ;; we don't want the public_uuid and made_public_by_id to be recorded in a revision
       ;; otherwise revert a card to earlier revision might toggle the public sharing settings
       (is (empty? (set/intersection #{:public_uuid :made_public_by_id}
                                     (->> (t2/select-one-fn :object Revision
                                                            :model       "Dashboard"
                                                            :model_id    dashboard-id)
                                          keys set))))))))
(deftest dashboard-add-cards-test
  (testing ":event/dashboard-update with adding dashcards"
    (t2.with-temp/with-temp [Dashboard     {dashboard-id :id, :as dashboard} {}
                             Card          {card-id :id}                     (card-properties)
                             DashboardCard dashcard                          {:card_id card-id, :dashboard_id dashboard-id}]
      (events/publish-event! :event/dashboard-update {:object  dashboard
                                                      :user-id (mt/user->id :rasta)})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :rasta)
              :object       (assoc (dashboard->revision-object dashboard)
                                   :cards [(assoc (apply dissoc dashcard @#'dashboard/excluded-columns-for-dashcard-revision) :series [])])
              :is_reversion false
              :is_creation  false}
             (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                            :model    "Dashboard"
                            :model_id dashboard-id))))))

(deftest dashboard-remove-cards-test
  (testing ":event/dashboard-update with removing dashcards"
    (t2.with-temp/with-temp [Dashboard     {dashboard-id :id, :as dashboard} {}
                             Card          {card-id :id}                     (card-properties)
                             DashboardCard dashcard                          {:card_id card-id, :dashboard_id dashboard-id}]
      (t2/delete! (t2/table-name DashboardCard), :id (:id dashcard))
      (events/publish-event! :event/dashboard-update {:object dashboard :user-id (mt/user->id :rasta)})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :rasta)
              :object       (assoc (dashboard->revision-object dashboard) :cards [])
              :is_reversion false
              :is_creation  false}
             (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                            :model    "Dashboard"
                            :model_id dashboard-id))))))

(deftest dashboard-reposition-cards-test
  (testing ":event/dashboard-update with repositioning dashcards"
    (t2.with-temp/with-temp [Dashboard     {dashboard-id :id, :as dashboard} {}
                             Card          {card-id :id}                     (card-properties)
                             DashboardCard dashcard                          {:card_id card-id, :dashboard_id dashboard-id}]
      (t2/update! DashboardCard (:id dashcard) {:size_x 3})
      (events/publish-event! :event/dashboard-update {:object dashboard :user-id (mt/user->id :crowberto)})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :crowberto)
              :object       (assoc (dashboard->revision-object dashboard) :cards [{:id                    (:id dashcard)
                                                                                   :card_id               card-id
                                                                                   :size_x                3
                                                                                   :size_y                4
                                                                                   :row                   0
                                                                                   :col                   0
                                                                                   :series                []
                                                                                   :dashboard_tab_id      nil
                                                                                   :action_id nil
                                                                                   :parameter_mappings     []
                                                                                   :visualization_settings {}
                                                                                   :dashboard_id           dashboard-id}])
              :is_reversion false
              :is_creation  false}
             (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                            :model    "Dashboard"
                            :model_id dashboard-id))))))

(deftest dashboard-add-tabs-test
  (testing ":event/dashboard-update with added tabs"
    (t2.with-temp/with-temp
      [:model/Dashboard     {dashboard-id :id, :as dashboard} {:name "A dashboard"}
       :model/DashboardTab  {dashtab-id :id}                  {:name         "First tab"
                                                               :position     0
                                                               :dashboard_id dashboard-id}]
      (events/publish-event! :event/dashboard-update {:object dashboard :user-id (mt/user->id :rasta)})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :rasta)
              :object       (assoc (dashboard->revision-object dashboard)
                                   :tabs [{:id           dashtab-id
                                           :name         "First tab"
                                           :position     0
                                           :dashboard_id dashboard-id}])
              :is_reversion false
              :is_creation  false}
             (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                            :model    "Dashboard"
                            :model_id dashboard-id))))))

(deftest dashboard-update-tabs-test
  (testing ":event/dashboard-update with updating tabs"
    (t2.with-temp/with-temp
      [:model/Dashboard     {dashboard-id :id, :as dashboard} {:name "A dashboard"}
       :model/DashboardTab  {dashtab-id :id}                  {:name         "First tab"
                                                               :position     0
                                                               :dashboard_id dashboard-id}]
      (t2/update! :model/DashboardTab dashtab-id {:name "New name"})
      (events/publish-event! :event/dashboard-update {:object dashboard :user-id (mt/user->id :rasta)})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :rasta)
              :object       (assoc (dashboard->revision-object dashboard)
                                   :tabs [{:id           dashtab-id
                                           :name         "New name"
                                           :position     0
                                           :dashboard_id dashboard-id}])
              :is_reversion false
              :is_creation  false}
             (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                            :model    "Dashboard"
                            :model_id dashboard-id))))))

(deftest dashboard-delete-tabs-test
  (testing ":event/dashboard-update with deleting tabs"
    (t2.with-temp/with-temp
      [:model/Dashboard     {dashboard-id :id, :as dashboard} {:name "A dashboard"}
       :model/DashboardTab  {dashtab-id :id}                  {:name         "First tab"
                                                               :position     0
                                                               :dashboard_id dashboard-id}]
      (t2/delete! :model/DashboardTab dashtab-id)
      (events/publish-event! :event/dashboard-update {:object dashboard :user-id (mt/user->id :rasta)})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :rasta)
              :object       (dashboard->revision-object dashboard)
              :is_reversion false
              :is_creation  false}
             (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                            :model    "Dashboard"
                            :model_id dashboard-id))))))

(deftest metric-create-test
  (testing :event/metric-create
    (t2.with-temp/with-temp [Database {database-id :id} {}
                             Table    {:keys [id]}      {:db_id database-id}
                             LegacyMetric   metric            {:table_id id, :definition {:a "b"}}]
      (events/publish-event! :event/metric-create {:object metric :user-id (mt/user->id :rasta)})
      (let [revision (t2/select-one [Revision :model :user_id :object :is_reversion :is_creation :message]
                                    :model "Metric"
                                    :model_id (:id metric))]
        (is (= {:model        "Metric"
                :user_id      (mt/user->id :rasta)
                :object       {:name                    "Toucans in the rainforest"
                               :description             "Lookin' for a blueberry"
                               :entity_id               (:entity_id metric)
                               :how_is_this_calculated  nil
                               :show_in_getting_started false
                               :caveats                 nil
                               :points_of_interest      nil
                               :archived                false
                               :creator_id              (mt/user->id :rasta)
                               :definition              {:a "b"}}
                :is_reversion false
                :is_creation  true
                :message      nil}
               (assoc revision :object (dissoc (:object revision) :id :table_id))))))))

(deftest metric-update-test
  (testing :event/metric-update
   (t2.with-temp/with-temp [Database {database-id :id} {}
                            Table    {:keys [id]}      {:db_id database-id}
                            LegacyMetric   metric            {:table_id id, :definition {:a "b"}}]
     (events/publish-event! :event/metric-update
                            (assoc {:object metric}
                                   :revision-message "updated"
                                   :user-id (mt/user->id :crowberto)))
     (let [revision (t2/select-one [Revision :model :user_id :object :is_reversion :is_creation :message]
                                   :model "Metric"
                                   :model_id (:id metric))]
       (is (= {:model        "Metric"
               :user_id      (mt/user->id :crowberto)
               :object       {:name                    "Toucans in the rainforest"
                              :description             "Lookin' for a blueberry"
                              :entity_id               (:entity_id metric)
                              :how_is_this_calculated  nil
                              :show_in_getting_started false
                              :caveats                 nil
                              :points_of_interest      nil
                              :archived                false
                              :creator_id              (mt/user->id :rasta)
                              :definition              {:a "b"}}
               :is_reversion false
               :is_creation  false
               :message      "updated"}
              (assoc revision :object (dissoc (:object revision) :id :table_id))))))))

(deftest metric-delete-test
  (testing ":metric-delete"
    (t2.with-temp/with-temp [Database {database-id :id} {}
                             Table    {:keys [id]}      {:db_id database-id}
                             LegacyMetric   metric            {:table_id id, :definition {:a "b"}, :archived true}]
      (events/publish-event! :event/metric-delete {:object metric :user-id (mt/user->id :rasta)})
      (let [revision (t2/select-one [Revision :model :user_id :object :is_reversion :is_creation :message]
                                    :model "Metric"
                                    :model_id (:id metric))]
        (is (= {:model        "Metric"
                :user_id      (mt/user->id :rasta)
                :object       {:name                    "Toucans in the rainforest"
                               :description             "Lookin' for a blueberry"
                               :how_is_this_calculated  nil
                               :show_in_getting_started false
                               :caveats                 nil
                               :entity_id               (:entity_id metric)
                               :points_of_interest      nil
                               :archived                true
                               :creator_id              (mt/user->id :rasta)
                               :definition              {:a "b"}}
                :is_reversion false
                :is_creation  false
                :message      nil}
               (assoc revision :object (dissoc (:object revision) :id :table_id))))))))

(deftest segment-create-test
  (testing :event/segment-create
    (t2.with-temp/with-temp [Database {database-id :id} {}
                             Table    {:keys [id]}      {:db_id database-id}
                             Segment  segment           {:table_id   id
                                                         :definition {:a "b"}}]
      (events/publish-event! :event/segment-create {:object segment :user-id (mt/user->id :rasta)})
      (let [revision (-> (t2/select-one Revision :model "Segment", :model_id (:id segment))
                         (select-keys [:model :user_id :object :is_reversion :is_creation :message]))]
        (is (= {:model        "Segment"
                :user_id      (mt/user->id :rasta)
                :object       {:name                    "Toucans in the rainforest"
                               :description             "Lookin' for a blueberry"
                               :show_in_getting_started false
                               :caveats                 nil
                               :points_of_interest      nil
                               :entity_id               (:entity_id segment)
                               :archived                false
                               :creator_id              (mt/user->id :rasta)
                               :definition              {:a "b"}}
                :is_reversion false
                :is_creation  true
                :message      nil}
               (assoc revision :object (dissoc (:object revision) :id :table_id))))))))

(deftest segment-update-test
  (testing :event/segment-update
    (t2.with-temp/with-temp [Database {database-id :id} {}
                             Table    {:keys [id]}      {:db_id database-id}
                             Segment  segment           {:table_id   id
                                                         :definition {:a "b"}}]
      (events/publish-event! :event/segment-update
                             (assoc {:object segment}
                                    :revision-message "updated"
                                    :user-id (mt/user->id :crowberto)))
      (is (= {:model        "Segment"
              :user_id      (mt/user->id :crowberto)
              :object       {:name                    "Toucans in the rainforest"
                             :description             "Lookin' for a blueberry"
                             :show_in_getting_started false
                             :caveats                 nil
                             :points_of_interest      nil
                             :entity_id               (:entity_id segment)
                             :archived                false
                             :creator_id              (mt/user->id :rasta)
                             :definition              {:a "b"}}
              :is_reversion false
              :is_creation  false
              :message      "updated"}
             (update (t2/select-one [Revision :model :user_id :object :is_reversion :is_creation :message]
                                    :model "Segment"
                                    :model_id (:id segment))
                     :object dissoc :id :table_id))))))

(deftest segment-delete-test
  (testing :event/segment-delete
    (t2.with-temp/with-temp [Database {database-id :id} {}
                             Table    {:keys [id]}      {:db_id database-id}
                             Segment  segment           {:table_id   id
                                                         :definition {:a "b"}
                                                         :archived   true}]
      (events/publish-event! :event/segment-delete {:object segment :user-id (mt/user->id :rasta)})
      (is (= {:model        "Segment"
              :user_id      (mt/user->id :rasta)
              :object       {:name                    "Toucans in the rainforest"
                             :description             "Lookin' for a blueberry"
                             :show_in_getting_started false
                             :caveats                 nil
                             :points_of_interest      nil
                             :entity_id               (:entity_id segment)
                             :archived                true
                             :creator_id              (mt/user->id :rasta)
                             :definition              {:a "b"}}
              :is_reversion false
              :is_creation  false
              :message      nil}
             (update (t2/select-one [Revision :model :user_id :object :is_reversion :is_creation :message]
                                    :model "Segment"
                                    :model_id (:id segment))
                     :object dissoc :id :table_id))))))
