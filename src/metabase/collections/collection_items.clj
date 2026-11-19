(ns metabase.collections.collection-items
  "How the collection items listing selects the Collections that a Collection holds and shows them."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.children :as collections.children]
   [metabase.collections.db :as collections.db]
   [metabase.collections.listing :as collections.listing]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defenterprise snippets-collection-filter-clause
  "Clause to filter out snippet collections from the collection query on OSS instances, and instances without the
  snippet-collections. EE implementation returns `nil`, so as to not filter out snippet collections."
  metabase-enterprise.snippet-collections.api.native-query-snippet
  []
  [:or
   [:= :namespace nil]
   [:not= :namespace (u/qualified-name "snippets")]])

(mu/defn subcollection-items :- [:maybe :map]
  "The query of the Collections in `collection` that the collection items listing of `opts` holds, selected as the other
  items, nil when `opts` restrict the items to those created by a user, which Collections do not record. A
  Collection is never pinned."
  [collection :- :map
   {:keys [archived? pinned-state collection-types include-library? created-by-id]} :- :map]
  (when (nil? created-by-id)
    (-> (assoc
         (collection/effective-children-query
          collection
          (collections.listing/visible-items-options archived? {:root-namespace (:namespace collection)})
          [:and
           (collections.children/collection-types-clause collection-types)
           (when-not include-library?
             [:or [:= nil :type]
              [:not [:in :type (vec collection/library-collection-types)]]])
           (if archived?
             [:or
              [:= :archived true]
              [:= :id (collection/trash-collection-id)]]
             [:and [:= :archived false] [:not= :id (collection/trash-collection-id)]])]
          (perms/namespace-clause :namespace (u/qualified-name (:namespace collection)) (collection/is-trash? collection))
          [:or
           [:= :type nil]
           [:not= :type collection/tenant-specific-root-collection-type]]
          (snippets-collection-filter-clause))
         :select [:id
                  [:id :collection_id]
                  :archived
                  :name
                  :description
                  :entity_id
                  :personal_owner_id
                  :location
                  :archived_directly
                  :namespace
                  :type
                  [[:case [:= :is_remote_synced nil] [:inline false] :else :is_remote_synced] :is_remote_synced]
                  [:type :collection_type]
                  [(h2x/literal "collection") :model]
                  :authority_level])
        (sql.helpers/where (collections.listing/pinned-state->clause pinned-state nil)))))

(defn- annotate-collections
  [parent-coll colls {:keys [show-dashboard-questions?]}]
  (let [descendant-collections (collection/descendants-flat parent-coll nil
                                                            (perms/visible-collections-filter-clause :collection.id (api/current-user-info) {:include-archived-items :all :root-namespace nil}))

        descendant-collection-ids (mapv u/the-id descendant-collections)

        child-type->coll-id-set
        (reduce (fn [acc {collection-id :collection_id, card-type :type, :as _card}]
                  (update acc (case (keyword card-type)
                                :model :dataset
                                :metric :metric
                                :card) conj collection-id))
                {:dataset #{}
                 :metric  #{}
                 :card    #{}}
                (when (seq descendant-collection-ids)
                  (collections.db/unarchived-card-collection-types-in-reducible
                   descendant-collection-ids
                   (not show-dashboard-questions?))))
        collections-containing-tables
        (if (premium-features/has-feature? :library)
          (->> (when (seq descendant-collection-ids)
                 (collections.db/published-table-collection-ids-in descendant-collection-ids))
               (map :collection_id)
               (into #{}))
          #{})

        collections-containing-transforms
        (if (seq (transforms.gating/enabled-source-types))
          (->> (when (seq descendant-collection-ids)
                 (collections.db/transform-collection-ids-in descendant-collection-ids (transforms.gating/enabled-source-types)))
               (map :collection_id)
               (into #{}))
          #{})

        collections-containing-dashboards
        (->> (when (seq descendant-collection-ids)
               (collections.db/unarchived-dashboard-collection-ids-in descendant-collection-ids))
             (map :collection_id)
             (into #{}))

        collections-containing-actions
        (->> (when (seq descendant-collection-ids)
               (collections.db/unarchived-action-collection-ids-in descendant-collection-ids))
             (map :collection_id)
             (into #{}))
        collections-containing-collections
        (->> (t2/hydrate descendant-collections :effective_parent :is_remote_synced)
             (reduce (fn [accu {:keys [effective_parent] :as _coll}]
                       (let [parent-id (:id effective_parent)]
                         (conj accu parent-id)))
                     #{}))

        child-type->coll-id-set
        (merge child-type->coll-id-set
               {:table collections-containing-tables
                :collection collections-containing-collections
                :dashboard collections-containing-dashboards
                :transform collections-containing-transforms
                :action collections-containing-actions})
        coll-id->annotated (m/index-by :id (collection/annotate-collections child-type->coll-id-set descendant-collections))]
    (for [coll colls]
      (merge coll (select-keys (coll-id->annotated (:id coll)) [:here :below])))))

(defn hydrate
  "The `rows` of Collections of the collection items listing as the API shows them, annotated with the types of the items
  they hold and what the user can do with them."
  [parent-collection options rows]
  (letfn [(update-personal-collection [{:keys [personal_owner_id] :as row}]
            (if personal_owner_id
              (assoc row :name (collection/user->personal-collection-name (:personal_owner_id row) :user))
              (dissoc row :personal_owner_id)))]
    (let [rows        (annotate-collections parent-collection rows options)
          collections (for [row rows]
                        (-> (t2/instance :model/Collection row)
                            collection/maybe-localize-system-collection-name
                            collection/maybe-localize-tenant-collection-name
                            collection/maybe-mark-collection-as-library-root
                            (update :archived api/bit->boolean)
                            (update :is_remote_synced api/bit->boolean)))]
      (map (fn [row collection]
             (-> collection
                 (dissoc :collection_position :display :moderated_status :icon
                         :dataset_query :table_id :query_type :is_upload)
                 (assoc :type (:type row))
                 update-personal-collection))
           rows
           (t2/hydrate collections :can_write :effective_location :can_restore :can_delete
                       :is_shared_tenant_collection)))))

(defmethod collection-items/spec :model/Collection [_model]
  {"collection" {:rank    7
                 :items   subcollection-items
                 :hydrate hydrate}})
