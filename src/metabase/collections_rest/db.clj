(ns metabase.collections-rest.db
  "Application database queries for the collections REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn collection
  "The Collection with `id`, or nil."
  [id :- [:maybe ::lib.schema.id/collection]]
  (t2/select-one :model/Collection :id id))

(mu/defn directly-archived-descendant-collections
  "The directly archived Collections whose location starts with `location-prefix`."
  [location-prefix :- :string]
  (t2/select :model/Collection :location [:like (str location-prefix "%")] :archived_directly true))

(mu/defn delete-collection!
  "Delete the Collection with `id`."
  [id :- ::lib.schema.id/collection]
  (t2/delete! :model/Collection :id id))

(mu/defn unarchived-card-collection-types-reducible
  "A reducible of the distinct Collection id and type of the unarchived Cards."
  []
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:= :archived false]}))

(mu/defn published-table-collection-ids
  "The distinct `:collection_id`s of the published, unarchived Tables."
  []
  (t2/query {:select-distinct [:collection_id]
             :from :metabase_table
             :where [:and
                     [:= :is_published true]
                     [:= :archived_at nil]]}))

(mu/defn top-level-cards-in-collection
  "The Cards in the Collection with `collection-id` that belong to no Dashboard, newest first."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select :model/Card {:where [:and
                                  [:= :collection_id collection-id]
                                  [:= :dashboard_id nil]]
                          :order-by [[:id :desc]]}))
