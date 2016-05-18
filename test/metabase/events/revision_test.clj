(ns metabase.events.revision-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.events.revision :refer :all]
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
            [metabase.test.util :refer [expect-eval-actual-first random-name]]
            [metabase.test-setup :refer :all]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

(defn- create-test-card []
  (let [rand-name (random-name)]
    (db/insert! Card
      :name                   rand-name
      :description            rand-name
      :public_perms           2
      :display                "table"
      :dataset_query          {:database (id)
                               :type     "query"
                               :query    {:aggregation ["rows"]
                                          :source_table (id :categories)}}
      :visualization_settings {}
      :creator_id             (user->id :crowberto))))

(defn- test-card-object [card]
  {:description            (:name card)
   :table_id               (id :categories)
   :database_id            (id)
   :organization_id        nil
   :query_type             "query"
   :name                   (:name card)
   :creator_id             (user->id :crowberto)
   :dataset_query          (:dataset_query card)
   :id                     (:id card)
   :display                "table"
   :visualization_settings {}
   :public_perms           2
   :archived               false})

(defn- create-test-dashboard []
  (let [rand-name (random-name)]
    (db/insert! Dashboard
      :name                   rand-name
      :description            rand-name
      :public_perms           2
      :creator_id             (user->id :crowberto))))

(defn- test-dashboard-object [dashboard]
  {:description (:name dashboard),
   :name (:name dashboard),
   :public_perms 2})


;; :card-create
(expect-let [{card-id :id :as card} (create-test-card)]
  {:model        "Card"
   :model_id     card-id
   :user_id      (user->id :crowberto)
   :object       (test-card-object card)
   :is_reversion false
   :is_creation  true}
  (do
    (process-revision-event {:topic :card-create
                             :item  card})
    (-> (Revision :model "Card", :model_id card-id)
        (select-keys [:model :model_id :user_id :object :is_reversion :is_creation]))))

;; :card-update
(expect-let [{card-id :id :as card} (create-test-card)]
  {:model        "Card"
   :model_id     card-id
   :user_id      (user->id :crowberto)
   :object       (test-card-object card)
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :card-update
                             :item  card})
    (-> (Revision :model "Card", :model_id card-id)
        (select-keys [:model :model_id :user_id :object :is_reversion :is_creation]))))

;; :dashboard-create
(expect-let [{dashboard-id :id :as dashboard} (create-test-dashboard)]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :crowberto)
   :object       (assoc (test-dashboard-object dashboard) :cards [])
   :is_reversion false
   :is_creation  true}
  (do
    (process-revision-event {:topic :dashboard-create
                             :item  dashboard})
    (-> (Revision :model "Dashboard", :model_id dashboard-id)
        (select-keys [:model :model_id :user_id :object :is_reversion :is_creation]))))

;; :dashboard-update
(expect-let [{dashboard-id :id :as dashboard} (create-test-dashboard)]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :crowberto)
   :object       (assoc (test-dashboard-object dashboard) :cards [])
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :dashboard-update
                             :item  dashboard})
    (-> (Revision :model "Dashboard", :model_id dashboard-id)
        (select-keys [:model :model_id :user_id :object :is_reversion :is_creation]))))

;; :dashboard-add-cards
(expect-let [{dashboard-id :id :as dashboard} (create-test-dashboard)
             {card-id :id}                    (create-test-card)
             dashcard                         (db/insert! DashboardCard :card_id card-id :dashboard_id dashboard-id)]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :crowberto)
   :object       (assoc (test-dashboard-object dashboard) :cards [(assoc (select-keys dashcard [:id :card_id :sizeX :sizeY :row :col]) :series [])])
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :dashboard-add-cards
                             :item  {:id       dashboard-id
                                     :actor_id (user->id :crowberto)
                                     :dashcards [dashcard]}})
    (-> (Revision :model "Dashboard", :model_id dashboard-id)
        (select-keys [:model :model_id :user_id :object :is_reversion :is_creation]))))

;; :dashboard-remove-cards
(expect-let [{dashboard-id :id :as dashboard} (create-test-dashboard)
             {card-id :id}                    (create-test-card)
             dashcard                         (db/insert! DashboardCard :card_id card-id :dashboard_id dashboard-id)
             _                                (db/delete! DashboardCard, :id (:id dashcard))]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :crowberto)
   :object       (assoc (test-dashboard-object dashboard) :cards [])
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :dashboard-remove-cards
                             :item  {:id       dashboard-id
                                     :actor_id (user->id :crowberto)
                                     :dashcards [dashcard]}})
    (-> (Revision :model "Dashboard", :model_id dashboard-id)
        (select-keys [:model :model_id :user_id :object :is_reversion :is_creation]))))

;; :dashboard-reposition-cards
(expect-let [{dashboard-id :id :as dashboard} (create-test-dashboard)
             {card-id :id}                    (create-test-card)
             dashcard                         (u/prog1 (db/insert! DashboardCard :card_id card-id :dashboard_id dashboard-id)
                                                (db/update! DashboardCard (:id <>), :sizeX 4))]
  {:model        "Dashboard"
   :model_id     dashboard-id
   :user_id      (user->id :crowberto)
   :object       (assoc (test-dashboard-object dashboard) :cards [{:id      (:id dashcard)
                                                                   :card_id card-id
                                                                   :sizeX   4
                                                                   :sizeY   2
                                                                   :row     nil
                                                                   :col     nil
                                                                   :series  []}])
   :is_reversion false
   :is_creation  false}
  (do
    (process-revision-event {:topic :dashboard-reeposition-cards
                             :item  {:id       dashboard-id
                                     :actor_id (user->id :crowberto)
                                     :dashcards [(assoc dashcard :sizeX 4)]}})
    (-> (Revision :model "Dashboard", :model_id dashboard-id)
        (select-keys [:model :model_id :user_id :object :is_reversion :is_creation]))))


;; :metric-create
(expect
  {:model        "Metric"
   :user_id      (user->id :rasta)
   :object       {:name        "Toucans in the rainforest"
                  :description "Lookin' for a blueberry"
                  :is_active    true
                  :creator_id  (user->id :rasta)
                  :definition  {:a "b"}}
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
   :object       {:name        "Toucans in the rainforest"
                  :description "Lookin' for a blueberry"
                  :is_active   true
                  :creator_id  (user->id :rasta)
                  :definition  {:a "b"}}
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
   :object       {:name        "Toucans in the rainforest"
                  :description "Lookin' for a blueberry"
                  :is_active   false
                  :creator_id  (user->id :rasta)
                  :definition  {:a "b"}}
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
   :object       {:name        "Toucans in the rainforest"
                  :description "Lookin' for a blueberry"
                  :is_active    true
                  :creator_id  (user->id :rasta)
                  :definition  {:a "b"}}
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
   :object       {:name        "Toucans in the rainforest"
                  :description "Lookin' for a blueberry"
                  :is_active   true
                  :creator_id  (user->id :rasta)
                  :definition  {:a "b"}}
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
   :object       {:name        "Toucans in the rainforest"
                  :description "Lookin' for a blueberry"
                  :is_active   false
                  :creator_id  (user->id :rasta)
                  :definition  {:a "b"}}
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
