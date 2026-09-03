(ns metabase-enterprise.stale.db
  "Application database queries for the stale module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [toucan2.core :as t2]))

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection collection-id))

(defn collections-by-id
  "A map of ID to Collection for `collection-ids`."
  [collection-ids]
  (t2/select-pk->fn identity :model/Collection :id [:in collection-ids]))

(defn stale-cards
  "The listing columns of the Cards with `card-ids`, with their latest moderation status."
  [card-ids]
  (t2/select [:model/Card
              :id
              :dashboard_id
              :description
              :collection_id
              :name
              :entity_id
              :archived
              :collection_position
              :display
              :collection_preview
              :database_id
              [nil :location]
              :dataset_query
              :card_schema
              :last_used_at
              [^:allow-subquery
               {:select   [:status]
                :from     [:moderation_review]
                :where    [:and
                           [:= :moderated_item_type "card"]
                           [:= :moderated_item_id :report_card.id]
                           [:= :most_recent true]]
                ;; limit 1 to ensure that there is only one result but this invariant should hold true, just
                ;; protecting against potential bugs
                :order-by [[:id :desc]]
                :limit    1}
               :moderated_status]]
             :id [:in card-ids]))

(defn stale-dashboards
  "The listing columns of the Dashboards with `dashboard-ids`."
  [dashboard-ids]
  (t2/select [:model/Dashboard
              :id
              :description
              :collection_id
              :name
              :entity_id
              :archived
              :collection_position
              [:last_viewed_at :last_used_at]
              ["dashboard" :model]
              [nil :dashboard_id]
              [nil :location]
              [nil :database_id]]
             :id [:in dashboard-ids]))

(defn query-rows
  "The rows of the Honey SQL `query`."
  [query]
  (t2/query query))

(defn query-one-row
  "The single row of the Honey SQL `query`."
  [query]
  (t2/query-one query))
