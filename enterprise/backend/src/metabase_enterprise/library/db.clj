(ns metabase-enterprise.library.db
  "Application database queries for the library module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

(defn card-types-in-collections
  "The set of Card types present in the Collections with `collection-ids`."
  [collection-ids]
  (t2/select-fn-set :type [:model/Card :type] :collection_id [:in collection-ids]))

(defn published-table-in-collections?
  "Whether a published Table exists in the Collections with `collection-ids`."
  [collection-ids]
  (t2/exists? :model/Table :is_published true :collection_id [:in collection-ids]))

(defn library-collections
  "The readable Library, Library-data, and Library-metrics Collections, ordered by name."
  []
  (t2/select :model/Collection
             {:where    [:and
                         [:in :type [collection/library-collection-type
                                     collection/library-data-collection-type
                                     collection/library-metrics-collection-type]]
                         (collection/visible-collection-filter-clause
                          :id
                          {:include-archived-items    :exclude
                           :include-trash-collection? false
                           :permission-level          :read
                           :archive-operation-id      nil})]
              :order-by [[:%lower.name :asc]]}))

(defn collection-type
  "The type of the Collection with `collection-id`."
  [collection-id]
  (t2/select-one-fn :type [:model/Collection :type] :id collection-id))

(defn unarchived-card-collection-types-reducible
  "Reducible distinct Collection ID and Card type pairs of the unarchived Cards."
  []
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:= :archived false]}))
