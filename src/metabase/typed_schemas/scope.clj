(ns metabase.typed-schemas.scope
  "Resolves portable references into scopes.

  Callers hold *references*: portable ways to name content that survive
  moving between instances — a database by id or name, a collection by id or
  entity id, or a well-known library root by its fixed entity id. Remote-sync
  representations and coding agents pass names and entity ids precisely
  because numeric ids don't travel.

  A *scope* is what references resolve to on this instance: the concrete,
  permission-filtered sets of row ids that bound what fetching selects for the
  current user. Resolution:

  - filters to what the current user can read;
  - expands collection references to include their descendants;
  - distinguishes nil (no reference given: unscoped) from the empty set
    (references resolved to nothing: match nothing);
  - throws a 404 for collection references that don't resolve, while database
    references that don't resolve yield an empty scope — and therefore an
    empty schema rather than an error.

  Database and collection scopes are bare id sets; the library scope is a
  [[LibraryScope]] map classifying the in-scope library tree by collection
  type."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private library-data-entity-id
  "Entity id of the root data library collection."
  "librarylibrarydatadat")

(def ^:private library-metrics-entity-id
  "Entity id of the root metrics library collection."
  "librarylibrarymetrics")

(defn database-ids-for-ref
  "Returns readable database ids matching a typed database reference."
  [database-ref]
  (when database-ref
    (let [{:keys [id name]} database-ref]
      (->> (if id
             (t2/select :model/Database :id id)
             (t2/select :model/Database :name name))
           (filter mi/can-read?)
           (map :id)
           set))))

(defn id-filter-clause
  "Returns a Honey SQL filter clause for optional ids."
  [ids column]
  (when ids
    (if (seq ids)
      [:in column ids]
      [:= column -1])))

(defn- library-collection-for-ref
  [{:keys [id entity-id]}]
  (->> (if id
         (t2/select :model/Collection :id id)
         (t2/select :model/Collection :entity_id entity-id))
       (filter #(contains? collection/library-collection-types (:type %)))
       (filter mi/can-read?)
       first))

(defn- collection-for-ref
  [{:keys [id entity-id]}]
  (->> (if id
         (t2/select :model/Collection :id id)
         (t2/select :model/Collection :entity_id entity-id))
       (filter mi/can-read?)
       first))

(defn- not-found!
  []
  (throw (ex-info "Not found." {:status-code 404})))

(defn collection-scope
  "Returns ids for requested collections and its descendants."
  [collection-refs]
  (when (seq collection-refs)
    (let [collections (for [collection-ref collection-refs]
                        (or (collection-for-ref collection-ref)
                            (not-found!)))]
      (->> collections
           (mapcat #(cons % (collection/descendants-flat %)))
           (map :id)
           set))))

(def LibraryScope
  "A resolved library scope: the readable library collection tree, expanded to
  descendants and classified by collection type. `:data-collection-ids` bound
  published table selection; `:metric-collection-ids` bound metric selection."
  [:map {:closed true}
   [:data-collection-ids [:set :int]]
   [:metric-collection-ids [:set :int]]])

(defn- library-collection-scope*
  [library-collections]
  (let [ids          (->> library-collections
                          (mapcat #(cons % (collection/descendants-flat %)))
                          (map :id)
                          set)
        rows         (t2/select [:model/Collection :id :type] :id [:in ids])
        ids-for-type (fn [collection-type]
                       (->> rows
                            (filter #(= (:type %) collection-type))
                            (map :id)
                            set))]
    {:data-collection-ids   (ids-for-type collection/library-data-collection-type)
     :metric-collection-ids (ids-for-type collection/library-metrics-collection-type)}))

(defn- library-collections-for-refs
  [collection-refs]
  (when (seq collection-refs)
    (for [collection-ref collection-refs]
      (or (library-collection-for-ref collection-ref)
          (not-found!)))))

(defn- included-library-root-collections
  [{:keys [include-data-library? include-metric-library?]}]
  (keep (fn [[include? entity-id]]
          (when include?
            (or (library-collection-for-ref {:entity-id entity-id})
                (not-found!))))
        [[include-data-library? library-data-entity-id]
         [include-metric-library? library-metrics-entity-id]]))

(defn library-scope
  "Resolves library collection refs and include flags into a [[LibraryScope]],
  or nil when no library scope is requested."
  [{:keys [library-collection-refs] :as options}]
  (let [library-collections (library-collections-for-refs library-collection-refs)
        included-roots      (included-library-root-collections options)
        all-collections     (seq (concat library-collections included-roots))]
    (when all-collections
      (library-collection-scope* all-collections))))
