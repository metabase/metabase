(ns metabase.events.revision-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.events.revision :refer [process-revision-event]]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [database :refer [Database]]
                             [metric :refer [Metric]]
                             [revision :refer [Revision revisions]]
                             [segment :refer [Segment]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

(defn- card-properties
  "Some default properties for `Cards` for use in tests in this namespace."
  []
  {:display                "table"
   :dataset_query          {:database (id)
                            :type     "query"
                            :query    {:aggregation ["rows"]
                                       :source_table (id :categories)}}
   :visualization_settings {}
   :creator_id             (user->id :crowberto)})

(defn- card->revision-object [card]
  {:description            nil
   :table_id               (id :categories)
   :database_id            (id)
   :query_type             "query"
   :name                   (:name card)
   :creator_id             (:creator_id card)
   :dataset_query          (:dataset_query card)
   :id                     (:id card)
   :display                "table"
   :visualization_settings {}
   :archived               false})

(defn- dashboard->revision-object [dashboard]
  {:description  nil
   :name         (:name dashboard)})


;; :card-create
(tu/expect-with-temp [Card [{card-id :id, :as card} (card-properties)]]
  {:model        "Card"
   :model_id     card-id
   :user_id      (user->id :crowberto)
   :object       (card->revision-object card)
   :is_reversion false
   :is_creation  true}
  (do
    (process-revision-event {:topic :card-create
                             :item  card})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model       "Card"
      :model_id    card-id)))


;; :card-update
(tu/expect-with-temp [Card [{card-id :id, :as card} (card-properties)]]
  {:model        "Card"
   :model_id     card-id
   :user_id      (user->id :crowberto)
   :object       (card->revision-object card)
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :card-update
                             :item  card})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model       "Card"
      :model_id    card-id)))


;; :dashboard-create
(tu/expect-with-temp [Dashboard [{dashboard-id :id, :as dashboard}]]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :rasta)
   :object       (assoc (dashboard->revision-object dashboard) :cards [])
   :is_reversion false
   :is_creation  true}
  (do
    (process-revision-event {:topic :dashboard-create
                             :item  dashboard})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model    "Dashboard"
      :model_id dashboard-id)))


;; :dashboard-update
(tu/expect-with-temp [Dashboard [{dashboard-id :id, :as dashboard}]]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :rasta)
   :object       (assoc (dashboard->revision-object dashboard) :cards [])
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :dashboard-update
                             :item  dashboard})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model    "Dashboard"
      :model_id dashboard-id)))


;; :dashboard-add-cards
(tu/expect-with-temp [Dashboard     [{dashboard-id :id, :as dashboard}]
                      Card          [{card-id :id}                     (card-properties)]
                      DashboardCard [dashcard                          {:card_id card-id, :dashboard_id dashboard-id}]]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :rasta)
   :object       (assoc (dashboard->revision-object dashboard) :cards [(assoc (select-keys dashcard [:id :card_id :sizeX :sizeY :row :col]) :series [])])
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :dashboard-add-cards
                             :item  {:id        dashboard-id
                                     :actor_id  (user->id :rasta)
                                     :dashcards [dashcard]}})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model    "Dashboard"
      :model_id dashboard-id)))


;; :dashboard-remove-cards
(tu/expect-with-temp [Dashboard     [{dashboard-id :id, :as dashboard}]
                      Card          [{card-id :id}                     (card-properties)]
                      DashboardCard [dashcard                          {:card_id card-id, :dashboard_id dashboard-id}]]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :rasta)
   :object       (assoc (dashboard->revision-object dashboard) :cards [])
   :is_reversion false
   :is_creation  false}
  (do
    (db/delete! DashboardCard, :id (:id dashcard))
    (process-revision-event {:topic :dashboard-remove-cards
                             :item  {:id       dashboard-id
                                     :actor_id (user->id :rasta)
                                     :dashcards [dashcard]}})
    (db/select-one [Revision :model :model_id :user_id :object :is_reversion :is_creation]
      :model    "Dashboard"
      :model_id dashboard-id)))


;; :dashboard-reposition-cards
(tu/expect-with-temp [Dashboard     [{dashboard-id :id, :as dashboard}]
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
    (process-revision-event {:topic :dashboard-reeposition-cards
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
                  :is_active               true
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  true
   :message      nil}
  (tu/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Metric   [metric       {:table_id id, :definition {:a "b"}}]]
    (process-revision-event {:topic :metric-create
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
                  :is_active               true
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  false
   :message      "updated"}
  (tu/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Metric   [metric       {:table_id id, :definition {:a "b"}}]]
    (process-revision-event {:topic :metric-update
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
                  :is_active               false
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  false
   :message      nil}
  (tu/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Metric   [metric       {:table_id id, :definition {:a "b"}, :is_active false}]]
    (process-revision-event {:topic :metric-delete
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
                  :is_active               true
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  true
   :message      nil}
  (tu/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Segment  [segment      {:table_id   id
                                          :definition {:a "b"}}]]
    (process-revision-event {:topic :segment-create
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
                  :is_active               true
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  false
   :message      "updated"}
  (tu/with-temp* [Database [{database-id :id}]
                  Table [{:keys [id]} {:db_id database-id}]
                  Segment [segment {:table_id   id
                                    :definition {:a "b"}}]]
    (process-revision-event {:topic :segment-update
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
                  :is_active               false
                  :creator_id              (user->id :rasta)
                  :definition              {:a "b"}}
   :is_reversion false
   :is_creation  false
   :message      nil}
  (tu/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Segment  [segment      {:table_id   id
                                          :definition {:a "b"}
                                          :is_active  false}]]
    (process-revision-event {:topic :segment-delete
                             :item  segment})
    (update (db/select-one [Revision :model :user_id :object :is_reversion :is_creation :message], :model "Segment", :model_id (:id segment))
            :object (u/rpartial dissoc :id :table_id))))
