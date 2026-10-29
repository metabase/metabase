(ns metabase.xrays.db
  "Application database queries for the x-rays module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn metadata-column
  "The `:metadata/column` with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :metadata/column :id field-id))

(mu/defn insert-card!
  "Insert the Card `card` and return the inserted instance."
  [card :- ::queries.schema/card.update]
  (t2/insert-returning-instance! :model/Card card))

(mu/defn delete-cards-in-collection!
  "Delete the Cards in the Collection with `collection-id`, returning the number deleted."
  [collection-id :- ::lib.schema.id/collection]
  (t2/delete! :model/Card :collection_id collection-id))

(mu/defn insert-collection!
  "Insert the Collection `row` and return the inserted instance."
  [row :- ::collections.schema/collection.update]
  (t2/insert-returning-instance! :model/Collection row))

(mu/defn insert-collection-returning-pk!
  "Insert the Collection `row` and return its id."
  [row :- ::collections.schema/collection.update]
  (t2/insert-returning-pk! :model/Collection row))

(mu/defn dashcard-card-and-dashboard-ids
  "The Card and Dashboard ids of the DashboardCards, optionally narrowed to `card-ids` and/or excluding
  `excluded-dashboard-ids`."
  [card-ids                :- [:maybe [:sequential ::lib.schema.id/card]]
   excluded-dashboard-ids  :- [:maybe [:sequential ::lib.schema.id/dashboard]]]
  (apply t2/select [:model/DashboardCard :card_id :dashboard_id]
         (concat (when (seq card-ids) [:card_id [:in card-ids]])
                 (when (seq excluded-dashboard-ids) [:dashboard_id [:not-in excluded-dashboard-ids]]))))
