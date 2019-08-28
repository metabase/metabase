(ns metabase.events.revision-test
  (:require [expectations :refer :all]
            [metabase.events.revision :refer [process-revision-event!]]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [database :refer [Database]]
             [metric :refer [Metric]]
             [revision :refer [Revision]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.test.data :as data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- card-properties
  "Some default properties for `Cards` for use in tests in this namespace."
  []
  {:display                "table"
   :dataset_query          {:database (data/id)
                            :type     :query
                            :query    {:source-table (data/id :categories)}}
   :visualization_settings {}
   :creator_id             (user->id :crowberto)})

(defn- card->revision-object [card]
  {:archived               false
   :collection_id          nil
   :collection_position    nil
   :creator_id             (:creator_id card)
   :database_id            (data/id)
   :dataset_query          (:dataset_query card)
   :read_permissions       nil
   :description            nil
   :display                :table
   :enable_embedding       false
   :embedding_params       nil
   :id                     (u/get-id card)
   :made_public_by_id      nil
   :name                   (:name card)
   :public_uuid            nil
   :cache_ttl              nil
   :query_type             :query
   :table_id               (data/id :categories)
   :visualization_settings {}})

(defn- dashboard->revision-object [dashboard]
  {:description  nil
   :name         (:name dashboard)})


;; :card-create
(tt/expect-with-temp [Card [{card-id :id, :as card} (card-properties)]]
  {:model        "Card"
   :model_id     card-id
   :user_id      (user->id :crowberto)
   :object       (card->revision-object card)
   :is_reversion false
   :is_creation  true}
  (do
    (process-revision-event! {:topic :card-create
                              :item  card})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model       "Card"
      :model_id    card-id)))


;; :card-update
(tt/expect-with-temp [Card [{card-id :id, :as card} (card-properties)]]
  {:model        "Card"
   :model_id     card-id
   :user_id      (user->id :crowberto)
   :object       (card->revision-object card)
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event! {:topic :card-update
                              :item  card})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model       "Card"
      :model_id    card-id)))


;; :dashboard-create
(tt/expect-with-temp [Dashboard [{dashboard-id :id, :as dashboard}]]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :rasta)
   :object       (assoc (dashboard->revision-object dashboard) :cards [])
   :is_reversion false
   :is_creation  true}
  (do
    (process-revision-event! {:topic :dashboard-create
                              :item  dashboard})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model    "Dashboard"
      :model_id dashboard-id)))


;; :dashboard-update
(tt/expect-with-temp [Dashboard [{dashboard-id :id, :as dashboard}]]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :rasta)
   :object       (assoc (dashboard->revision-object dashboard) :cards [])
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event! {:topic :dashboard-update
                              :item  dashboard})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model    "Dashboard"
      :model_id dashboard-id)))


;; :dashboard-add-cards
(tt/expect-with-temp [Dashboard     [{dashboard-id :id, :as dashboard}]
                      Card          [{card-id :id}                     (card-properties)]
                      DashboardCard [dashcard                          {:card_id card-id, :dashboard_id dashboard-id}]]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :rasta)
   :object       (assoc (dashboard->revision-object dashboard) :cards [(assoc (select-keys dashcard [:id :card_id :sizeX :sizeY :row :col]) :series [])])
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event! {:topic :dashboard-add-cards
                              :item  {:id        dashboard-id
                                      :actor_id  (user->id :rasta)
                                      :dashcards [dashcard]}})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model    "Dashboard"
      :model_id dashboard-id)))


;; :dashboard-remove-cards
(tt/expect-with-temp [Dashboard     [{dashboard-id :id, :as dashboard}]
                      Card          [{card-id :id}                     (card-properties)]
                      DashboardCard [dashcard                          {:card_id card-id, :dashboard_id dashboard-id}]]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :rasta)
   :object       (assoc (dashboard->revision-object dashboard) :cards [])
   :is_reversion false
   :is_creation  false}
  (do
    (db/simple-delete! DashboardCard, :id (:id dashcard))
    (process-revision-event! {:topic :dashboard-remove-cards
                              :item  {:id       dashboard-id
                                      :actor_id (user->id :rasta)
                                      :dashcards [dashcard]}})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model    "Dashboard"
      :model_id dashboard-id)))


;; :dashboard-reposition-cards
(tt/expect-with-temp [Dashboard     [{dashboard-id :id, :as dashboard}]
                      Card          [{card-id :id}                     (card-properties)]
                      DashboardCard [dashcard                          {:card_id card-id, :dashboard_id dashboard-id}]]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :crowberto)
   :object       (assoc (dashboard->revision-object dashboard) :cards [{:id      (:id dashcard)
                                                                        :card_id card-id
                                                                        :sizeX   4
                                                                        :sizeY   2
                                                                        :row     0
                                                                        :col     0
                                                                        :series  []}])
   :is_reversion false
   :is_creation  false}
  (do
    (db/update! DashboardCard (:id dashcard), :sizeX 4)
    (process-revision-event! {:topic :dashboard-reeposition-cards
                              :item  {:id        dashboard-id
                                      :actor_id  (user->id :crowberto)
                                      :dashcards [(assoc dashcard :sizeX 4)]}})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model    "Dashboard"
      :model_id dashboard-id)))


;; :metric-create
(expect
  {:model        "Metric"
   :user_id      (user->id :rasta)
   :object       {:name                    "Toucans in the rainforest"
                  :description             "Lookin' for a blueberry"
                  :how_is_this_calculated  nil
                  :show_in_getting_started false
                  :caveats                 nil
                  :points_of_interest      nil
                  :archived                false
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  true
   :message      nil}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Metric   [metric       {:table_id id, :definition {:a "b"}}]]
    (process-revision-event! {:topic :metric-create
                              :item  metric})

    (let [revision (db/select-one [Revision :model :user_id :object :is_reversion :is_creation :message], :model "Metric", :model_id (:id metric))]
      (assoc revision :object (dissoc (:object revision) :id :table_id)))))


;; :metric-update
(expect
  {:model        "Metric"
   :user_id      (user->id :crowberto)
   :object       {:name                    "Toucans in the rainforest"
                  :description             "Lookin' for a blueberry"
                  :how_is_this_calculated  nil
                  :show_in_getting_started false
                  :caveats                 nil
                  :points_of_interest      nil
                  :archived                false
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  false
   :message      "updated"}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Metric   [metric       {:table_id id, :definition {:a "b"}}]]
    (process-revision-event! {:topic :metric-update
                              :item  (assoc metric
                                       :actor_id         (user->id :crowberto)
                                       :revision_message "updated")})
    (let [revision (db/select-one [Revision :model :user_id :object :is_reversion :is_creation :message], :model "Metric", :model_id (:id metric))]
      (assoc revision :object (dissoc (:object revision) :id :table_id)))))


;; :metric-delete
(expect
  {:model        "Metric"
   :user_id      (user->id :rasta)
   :object       {:name                    "Toucans in the rainforest"
                  :description             "Lookin' for a blueberry"
                  :how_is_this_calculated  nil
                  :show_in_getting_started false
                  :caveats                 nil
                  :points_of_interest      nil
                  :archived                true
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  false
   :message      nil}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Metric   [metric       {:table_id id, :definition {:a "b"}, :archived true}]]
    (process-revision-event! {:topic :metric-delete
                              :item  metric})
    (let [revision (db/select-one [Revision :model :user_id :object :is_reversion :is_creation :message], :model "Metric", :model_id (:id metric))]
      (assoc revision :object (dissoc (:object revision) :id :table_id)))))


;; :segment-create
(expect
  {:model        "Segment"
   :user_id      (user->id :rasta)
   :object       {:name                    "Toucans in the rainforest"
                  :description             "Lookin' for a blueberry"
                  :show_in_getting_started false
                  :caveats                 nil
                  :points_of_interest      nil
                  :archived                false
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  true
   :message      nil}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Segment  [segment      {:table_id   id
                                          :definition {:a "b"}}]]
    (process-revision-event! {:topic :segment-create
                              :item  segment})
    (let [revision (-> (Revision :model "Segment", :model_id (:id segment))
                       (select-keys [:model :user_id :object :is_reversion :is_creation :message]))]
      (assoc revision :object (dissoc (:object revision) :id :table_id)))))

;; :segment-update
(expect
  {:model        "Segment"
   :user_id      (user->id :crowberto)
   :object       {:name                    "Toucans in the rainforest"
                  :description             "Lookin' for a blueberry"
                  :show_in_getting_started false
                  :caveats                 nil
                  :points_of_interest      nil
                  :archived                false
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  false
   :message      "updated"}
  (tt/with-temp* [Database [{database-id :id}]
                  Table [{:keys [id]} {:db_id database-id}]
                  Segment [segment {:table_id   id
                                    :definition {:a "b"}}]]
    (process-revision-event! {:topic :segment-update
                              :item  (assoc segment
                                       :actor_id         (user->id :crowberto)
                                       :revision_message "updated")})
    (update (db/select-one [Revision :model :user_id :object :is_reversion :is_creation :message], :model "Segment", :model_id (:id segment))
            :object (u/rpartial dissoc :id :table_id))))

;; :segment-delete
(expect
  {:model        "Segment"
   :user_id      (user->id :rasta)
   :object       {:name                    "Toucans in the rainforest"
                  :description             "Lookin' for a blueberry"
                  :show_in_getting_started false
                  :caveats                 nil
                  :points_of_interest      nil
                  :archived                true
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  false
   :message      nil}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Segment  [segment      {:table_id   id
                                          :definition {:a "b"}
                                          :archived   true}]]
    (process-revision-event! {:topic :segment-delete
                              :item  segment})
    (update (db/select-one [Revision :model :user_id :object :is_reversion :is_creation :message], :model "Segment", :model_id (:id segment))
            :object (u/rpartial dissoc :id :table_id))))
