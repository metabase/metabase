(ns metabase-enterprise.library.db
  "Application database queries for the library module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn library-collections
  "The readable Library Collections, ordered by name."
  []
  (t2/select :model/Collection
             {:where    [:and
                         [:in :type (vec collection/library-collection-types)]
                         (collection/visible-collection-filter-clause
                          :id
                          {:include-archived-items    :exclude
                           :include-trash-collection? false
                           :permission-level          :read
                           :archive-operation-id      nil})]
              :order-by [[:%lower.name :asc]]}))

(mu/defn unarchived-card-collection-types-reducible
  "Reducible distinct Collection ID and Card type pairs of the unarchived Cards."
  []
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [:report_card]
                       :where           [:= :archived false]}))
