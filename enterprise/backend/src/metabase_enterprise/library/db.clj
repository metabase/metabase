(ns metabase-enterprise.library.db
  "Application database queries for the library module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn card-types-in-collections
  "The set of types of the unarchived Cards in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (mdb/select-batched-set #(t2/select-fn-set :type [:model/Card :type] :collection_id [:in %] :archived false)
                          collection-ids))

(mu/defn published-table-in-collections?
  "Whether an unarchived published Table exists in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (boolean (some #(t2/exists? :model/Table
                              {:from      [[(t2/table-name :model/Table) :t]]
                               :left-join [[(t2/table-name :model/TableUserSettings) :s] [:= :s.table_id :t.id]]
                               :where     [:and
                                           [:= :t.archived_at nil]
                                           [:= :s.is_published true]
                                           [:in :s.collection_id %]]})
                 (mdb/select-partitions collection-ids))))

(mu/defn dashboard-in-collections?
  "Whether an unarchived Dashboard exists in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (boolean (some #(t2/exists? :model/Dashboard :collection_id [:in %] :archived false)
                 (mdb/select-partitions collection-ids))))

(mu/defn library-collections
  "The readable Library Collections, ordered by name."
  []
  (t2/select :model/Collection
             {:where    [:and
                         [:in :type (vec collection/library-collection-types)]
                         (perms/visible-collections-filter-clause (u/qualified-key (t2/table-name :model/Collection) :id) (api/current-user-info) {:include-archived-items    :exclude
                                                                                                                                                   :include-trash-collection? false
                                                                                                                                                   :permission-level          :read
                                                                                                                                                   :archive-operation-id      nil
                                                                                                                                                   :root-namespace            nil})]
              :order-by [[[:lower :name] :asc]]}))

(mu/defn collection-type
  "The type of the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one-fn :type [:model/Collection :type] :id collection-id))

(mu/defn unarchived-card-collection-types-reducible
  "Reducible distinct Collection ID and Card type pairs of the unarchived Cards."
  []
  (t2/reducible-query {:select-distinct [:collection_id :type]
                       :from            [(t2/table-name :model/Card)]
                       :where           [:= :archived false]}))
