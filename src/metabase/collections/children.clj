(ns metabase.collections.children
  "Selecting the Collections of the collection views: [[select-collections]] and
  [[shallow-tree-from-collection-id]] serve the collection-tree views, and
  [[collection-types-clause]] is the filter by collection type that they share with the collection items."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]))

(set! *warn-on-reflection* true)

(defn- location-from-collection-id-clause
  "Clause to restrict which collections are being selected based off collection-id. If collection-id is nil,
   then restrict to the children and the grandchildren of the root collection. If collection-id is an an integer,
   then restrict to that collection's parents and children."
  [collection-id]
  (if collection-id
    [:and
     [:like :location (str "%/" collection-id "/%")]
     [:not [:like :location (str "%/" collection-id "/%/%/%")]]]
    [:not [:like :location "/%/%/"]]))

(defn- remove-other-users-personal-subcollections
  [user-id collections]
  (let [personal-ids         (set (collections.db/other-users-personal-collection-ids user-id))
        personal-descendant? (fn [collection]
                               (let [first-parent-collection-id (-> collection
                                                                    :location
                                                                    collection/location-path->ids
                                                                    first)]
                                 (personal-ids first-parent-collection-id)))]
    (remove personal-descendant? collections)))

(defn collection-types-clause
  "A HoneySQL clause that keeps the collections of one of `collection-types`, \"remote-synced\" meaning the
  remote-synced ones, or nil when there are none."
  [collection-types]
  (when (seq collection-types)
    (into [:or] (for [collection-type (sort collection-types)]
                  (if (= collection-type "remote-synced")
                    [:= :is_remote_synced true]
                    [:= :type collection-type])))))

(defn select-collections
  "Select collections based off certain parameters. If `shallow` is true, we select only the requested collection (or
  the root, if `collection-id` is `nil`) and its immediate children, to avoid reading the entire collection tree when it
  is not necessary.

  For archived, we can either include only archived items (when archived is truthy) or exclude archived items (when
  archived is falsey).

  The Trash Collection itself (the container for archived items) is *always* included.

  This will select only collections where `personal_owner_id` is not `nil`.

  To include library collections and their descendants, pass in `include-library?` as `true`.
  By default, library-type collections are excluded.

  To select only collections of some types, pass them as the set `collection-types`. "
  [{:keys [archived exclude-other-user-collections namespaces shallow collection-id personal-only include-library?
           collection-types]}]
  (cond->>
   (collections.db/collections-matching
    {:where [:and
             (case archived
               nil nil
               false [:and
                      [:not= :id (collection/trash-collection-id)]
                      [:not :archived]]
               true [:or
                     [:= :id (collection/trash-collection-id)]
                     :archived])
             (when shallow
               (location-from-collection-id-clause collection-id))
             (when personal-only
               [:!= :personal_owner_id nil])
             (collection-types-clause collection-types)
             (when exclude-other-user-collections
               [:or [:= :personal_owner_id nil] [:= :personal_owner_id api/*current-user-id*]])
             (when-not include-library?
               [:or [:= nil :type]
                [:not-in :type (vec collection/library-collection-types)]])
             [:or
              (when (contains? namespaces nil)
                [:= :namespace nil])
              (when (seq namespaces)
                [:in :namespace namespaces])]
             (perms/visible-collections-filter-clause :collection.id (api/current-user-info) {:include-archived-items    (if archived
                                                                                                                           :only
                                                                                                                           :exclude)
                                                                                              :include-trash-collection? true
                                                                                              :permission-level          :read
                                                                                              :archive-operation-id      nil
                                                                                              :root-namespace            nil})]
     ;; Order NULL collection types first so that audit collections are last
     :order-by [[[[:case [:= :authority_level "official"] 0 :else 1]] :asc]
                [[[:case
                   [:= :type nil] 0
                   [:= :type collection/trash-collection-type] 1
                   :else 2]] :asc]
                [:%lower.name :asc]]})
    exclude-other-user-collections
    (remove-other-users-personal-subcollections api/*current-user-id*)))

(defn prep-collection-for-export
  "Given a collection, tweaks it to be ready for returning to the FE.

  These same functions were called in several places in this namespace, so they're combined here to keep it DRY."
  [coll]
  (-> coll
      collection/personal-collection-with-ui-details
      collection/maybe-localize-tenant-collection-name
      collection/maybe-mark-collection-as-library-root))

(defn shallow-tree-from-collection-id
  "Returns only a shallow Collection in the provided collection-id, e.g.

  location: /1/
  ```
  [{:name     \"A\"
    :location \"/1/\"
    :children 1}
    ...
    {:name     \"H\"
     :location \"/1/\"}]

  If the collection-id is nil, then we default to the root collection.
  ```"
  [colls]
  (->> colls
       (map prep-collection-for-export)
       (collection/collections->tree nil)
       (map (fn [coll] (update coll :children #(boolean (seq %)))))))
