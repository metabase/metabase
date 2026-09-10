(ns metabase.collections-rest.db
  "Application database queries for the collections REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [toucan2.core :as t2]))

(defn collection
  "The Collection with `id`, or nil."
  [id]
  (t2/select-one :model/Collection :id id))

(defn directly-archived-descendant-collections
  "The directly archived Collections whose location starts with `location-prefix`."
  [location-prefix]
  (t2/select :model/Collection :location [:like (str location-prefix "%")] :archived_directly true))

(defn update-collection!
  "Apply `changes` to the Collection with `id`."
  [id changes]
  (t2/update! :model/Collection id changes))

(defn delete-collection!
  "Delete the Collection with `id`."
  [id]
  (t2/delete! :model/Collection :id id))

(defn unarchived-card-collection-types-reducible
  "A reducible of the distinct Collection id and type of the unarchived Cards."
  []
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:= :archived false]}))

(defn published-table-collection-ids
  "The distinct `:collection_id`s of the published, unarchived Tables."
  []
  (t2/query {:select-distinct [:collection_id]
             :from :metabase_table
             :where [:and
                     [:= :is_published true]
                     [:= :archived_at nil]]}))

(defn top-level-cards-in-collection
  "The Cards in the Collection with `collection-id` that belong to no Dashboard, newest first."
  [collection-id]
  (t2/select :model/Card {:where [:and
                                  [:= :collection_id collection-id]
                                  [:= :dashboard_id nil]]
                          :order-by [[:id :desc]]}))

(defn cards-in-collection
  "The Cards in the Collection with `collection-id`."
  [collection-id]
  (t2/select :model/Card :collection_id collection-id))
