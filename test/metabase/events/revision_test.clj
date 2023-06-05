(ns metabase.events.revision-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.revision :as revision]
   [metabase.models
    :refer [Card Dashboard DashboardCard Database Metric Revision Segment Table]]
   [metabase.test :as mt]
   [metabase.util :as u]
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
   :creator_id             (:creator_id card)
   :database_id            (mt/id)
   :dataset_query          (:dataset_query card)
   :dataset                false
   :description            nil
   :display                :table
   :enable_embedding       false
   :entity_id              (:entity_id card)
   :embedding_params       nil
   :id                     (u/the-id card)
   :made_public_by_id      nil
   :name                   (:name card)
   :parameters             []
   :parameter_mappings     []
   :public_uuid            nil
   :cache_ttl              nil
   :query_type             :query
   :table_id               (mt/id :categories)
   :visualization_settings {}})

(defn- dashboard->revision-object [dashboard]
  {:collection_id      (:collection_id dashboard)
   :description        nil
   :cache_ttl          nil
   :auto_apply_filters true
   :name               (:name dashboard)
   :tabs               []
   :cards              []})

(deftest card-create-test
  (testing ":card-create"
    (t2.with-temp/with-temp [Card {card-id :id, :as card} (card-properties)][]
      (revision/process-revision-event! {:topic :card-create
                                         :item  card})
      (is (= {:model        "Card"
              :model_id     card-id
              :user_id      (mt/user->id :crowberto)
              :object       (card->revision-object card)
              :is_reversion false
              :is_creation  true}
             (mt/derecordize
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                :model       "Card"
                :model_id    card-id)))))))

(deftest card-update-test
  (testing ":card-update"
    (t2.with-temp/with-temp [Card {card-id :id, :as card} (card-properties)]
      (revision/process-revision-event! {:topic :card-update
                                         :item  card})
      (is (= {:model        "Card"
              :model_id     card-id
              :user_id      (mt/user->id :crowberto)
              :object       (card->revision-object card)
              :is_reversion false
              :is_creation  false}
             (mt/derecordize
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                :model       "Card"
                :model_id    card-id)))))))

(deftest dashboard-create-test
  (testing ":dashboard-create"
    (t2.with-temp/with-temp [Dashboard {dashboard-id :id, :as dashboard}]
      (revision/process-revision-event! {:topic :dashboard-create
                                         :item  dashboard})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :rasta)
              :object       (assoc (dashboard->revision-object dashboard) :cards [])
              :is_reversion false
              :is_creation  true}
             (mt/derecordize
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                :model "Dashboard"
                :model_id dashboard-id)))))))

(deftest dashboard-update-test
  (testing ":dashboard-update"
    (t2.with-temp/with-temp [Dashboard {dashboard-id :id, :as dashboard}]
      (revision/process-revision-event! {:topic :dashboard-update
                                         :item  dashboard})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :rasta)
              :object       (dashboard->revision-object dashboard)
              :is_reversion false
              :is_creation  false}
             (mt/derecordize
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                :model    "Dashboard"
                :model_id dashboard-id)))))))

(deftest dashboard-add-cards-test
  (testing ":dashboard-add-cards"
    (mt/with-temp* [Dashboard     [{dashboard-id :id, :as dashboard}]
                    Card          [{card-id :id}                     (card-properties)]
                    DashboardCard [dashcard                          {:card_id card-id, :dashboard_id dashboard-id}]]
      (revision/process-revision-event! {:topic :dashboard-add-cards
                                         :item  {:id        dashboard-id
                                                 :actor_id  (mt/user->id :rasta)
                                                 :dashcards [dashcard]}})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :rasta)
              :object       (assoc (dashboard->revision-object dashboard)
                                   :cards [(assoc (select-keys dashcard [:id :card_id :size_x :size_y :row :col :dashboard_tab_id]) :series [])])
              :is_reversion false
              :is_creation  false}
             (mt/derecordize
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                :model    "Dashboard"
                :model_id dashboard-id)))))))

(deftest dashboard-remove-cards-test
  (testing ":dashboard-remove-cards"
    (mt/with-temp* [Dashboard     [{dashboard-id :id, :as dashboard}]
                    Card          [{card-id :id}                     (card-properties)]
                    DashboardCard [dashcard                          {:card_id card-id, :dashboard_id dashboard-id}]]
      (t2/delete! (t2/table-name DashboardCard), :id (:id dashcard))
      (revision/process-revision-event! {:topic :dashboard-remove-cards
                                         :item  {:id        dashboard-id
                                                 :actor_id  (mt/user->id :rasta)
                                                 :dashcards [dashcard]}})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :rasta)
              :object       (assoc (dashboard->revision-object dashboard) :cards [])
              :is_reversion false
              :is_creation  false}
             (mt/derecordize
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                :model    "Dashboard"
                :model_id dashboard-id)))))))

(deftest dashboard-reposition-cards-test
  (testing ":dashboard-reposition-cards"
    (mt/with-temp* [Dashboard     [{dashboard-id :id, :as dashboard}]
                    Card          [{card-id :id}                     (card-properties)]
                    DashboardCard [dashcard                          {:card_id card-id, :dashboard_id dashboard-id}]]
      (t2/update! DashboardCard (:id dashcard) {:size_x 3})
      (revision/process-revision-event! {:topic :dashboard-reeposition-cards
                                         :item  {:id        dashboard-id
                                                 :actor_id  (mt/user->id :crowberto)
                                                 :dashcards [(assoc dashcard :size_x 4)]}})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :crowberto)
              :object       (assoc (dashboard->revision-object dashboard) :cards [{:id               (:id dashcard)
                                                                                   :card_id          card-id
                                                                                   :size_x           3
                                                                                   :size_y           4
                                                                                   :row              0
                                                                                   :col              0
                                                                                   :series           []
                                                                                   :dashboard_tab_id nil}])
              :is_reversion false
              :is_creation  false}
             (mt/derecordize
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                :model    "Dashboard"
                :model_id dashboard-id)))))))

(deftest dashboard-add-tabs-test
  (testing ":dashboard-add-tabs"
    (t2.with-temp/with-temp
      [:model/Dashboard     {dashboard-id :id, :as dashboard} {:name "A dashboard"}
       :model/DashboardTab  {dashtab-id :id}                  {:name         "First tab"
                                                               :position     0
                                                               :dashboard_id dashboard-id}]
      (revision/process-revision-event! {:topic :dashboard-add-tabs
                                         :item  {:id        dashboard-id
                                                 :actor_id  (mt/user->id :rasta)
                                                 :tab_ids   [dashtab-id]}})
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
             (mt/derecordize
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                :model    "Dashboard"
                :model_id dashboard-id)))))))

(deftest dashboard-update-tabs-test
  (testing ":dashboard-update-tabs"
    (t2.with-temp/with-temp
      [:model/Dashboard     {dashboard-id :id, :as dashboard} {:name "A dashboard"}
       :model/DashboardTab  {dashtab-id :id}                  {:name         "First tab"
                                                               :position     0
                                                               :dashboard_id dashboard-id}]
      (t2/update! :model/DashboardTab dashtab-id {:name "New name"})
      (revision/process-revision-event! {:topic :dashboard-update-tabs
                                         :item  {:id        dashboard-id
                                                 :actor_id  (mt/user->id :rasta)
                                                 :tab_ids   [dashtab-id]}})
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
             (mt/derecordize
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                :model    "Dashboard"
                :model_id dashboard-id)))))))

(deftest dashboard-delete-tabs-test
  (testing ":dashboard-delete-tabs"
    (t2.with-temp/with-temp
      [:model/Dashboard     {dashboard-id :id, :as dashboard} {:name "A dashboard"}
       :model/DashboardTab  {dashtab-id :id}                  {:name         "First tab"
                                                               :position     0
                                                               :dashboard_id dashboard-id}]
      (t2/delete! :model/DashboardTab dashtab-id)
      (revision/process-revision-event! {:topic :dashboard-delete-tabs
                                         :item  {:id        dashboard-id
                                                 :actor_id  (mt/user->id :rasta)
                                                 :tab_ids   [dashtab-id]}})
      (is (= {:model        "Dashboard"
              :model_id     dashboard-id
              :user_id      (mt/user->id :rasta)
              :object       (dashboard->revision-object dashboard)
              :is_reversion false
              :is_creation  false}
             (mt/derecordize
              (t2/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
                :model    "Dashboard"
                :model_id dashboard-id)))))))

(deftest metric-create-test
  (testing ":metric-create"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{:keys [id]} {:db_id database-id}]
                    Metric   [metric       {:table_id id, :definition {:a "b"}}]]
      (revision/process-revision-event! {:topic :metric-create
                                         :item  metric})
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
               (mt/derecordize
                (assoc revision :object (dissoc (:object revision) :id :table_id)))))))))

(deftest metric-update-test
  (testing ":metric-update"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{:keys [id]} {:db_id database-id}]
                    Metric   [metric       {:table_id id, :definition {:a "b"}}]]
      (revision/process-revision-event! {:topic :metric-update
                                         :item  (assoc metric
                                                       :actor_id         (mt/user->id :crowberto)
                                                       :revision_message "updated")})
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
               (mt/derecordize
                (assoc revision :object (dissoc (:object revision) :id :table_id)))))))))

(deftest metric-delete-test
  (testing ":metric-delete"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{:keys [id]} {:db_id database-id}]
                    Metric   [metric       {:table_id id, :definition {:a "b"}, :archived true}]]
      (revision/process-revision-event! {:topic :metric-delete
                                         :item  metric})
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
               (mt/derecordize
                (assoc revision :object (dissoc (:object revision) :id :table_id)))))))))


(deftest segment-create-test
  (testing ":segment-create"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{:keys [id]} {:db_id database-id}]
                    Segment  [segment      {:table_id   id
                                            :definition {:a "b"}}]]
      (revision/process-revision-event! {:topic :segment-create
                                         :item  segment})
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
               (mt/derecordize
                (assoc revision :object (dissoc (:object revision) :id :table_id)))))))))

(deftest segment-update-test
  (testing ":segment-update"
    (mt/with-temp* [Database [{database-id :id}]
                    Table [{:keys [id]} {:db_id database-id}]
                    Segment [segment {:table_id   id
                                      :definition {:a "b"}}]]
      (revision/process-revision-event! {:topic :segment-update
                                         :item  (assoc segment
                                                       :actor_id         (mt/user->id :crowberto)
                                                       :revision_message "updated")})
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
             (mt/derecordize
              (update (t2/select-one [Revision :model :user_id :object :is_reversion :is_creation :message]
                        :model "Segment"
                        :model_id (:id segment))
                      :object dissoc :id :table_id)))))))

(deftest segment-delete-test
  (testing ":segment-delete"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{:keys [id]} {:db_id database-id}]
                    Segment  [segment      {:table_id   id
                                            :definition {:a "b"}
                                            :archived   true}]]
      (revision/process-revision-event! {:topic :segment-delete
                                         :item  segment})
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
             (mt/derecordize
              (update (t2/select-one [Revision :model :user_id :object :is_reversion :is_creation :message]
                        :model "Segment"
                        :model_id (:id segment))
                      :object dissoc :id :table_id)))))))
