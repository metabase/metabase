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
  - throws a 404 naming the collection references that don't resolve —
    missing and unreadable are deliberately indistinguishable — while
    database references that don't resolve yield an empty scope, and
    therefore an empty schema rather than an error.

  Database and collection scopes are bare id sets; the library scope is a
  [[LibraryScope]] map classifying the in-scope library tree by collection
  type. Resolution is batched: query count is constant regardless of how many
  references are passed."
  (:require
   [clojure.string :as str]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.db :as typed-schemas.db]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private library-data-entity-id
  "Entity id of the root data library collection."
  "librarylibrarydatadat")

(def ^:private library-metrics-entity-id
  "Entity id of the root metrics library collection."
  "librarylibrarymetrics")

(defn database-ids-for-ref
  "Returns readable database ids matching a typed database reference.

  An id matches at most one database. Database names are not unique, so a
  name reference can genuinely match several databases — currently their
  content is unioned into one scope."
  [database-ref]
  (when database-ref
    (let [{:keys [id name]} database-ref]
      (if id
        (let [database (typed-schemas.db/database id)]
          (if (and database (mi/can-read? database))
            #{id}
            #{}))
        (->> (typed-schemas.db/databases-named name)
             (filter mi/can-read?)
             (map :id)
             set)))))

(defn- not-found!
  [collection-refs]
  (throw (ex-info (str "Collections not found: "
                       (str/join ", " (map pr-str collection-refs)))
                  {:status-code     404
                   :collection-refs (vec collection-refs)})))

(defn- resolve-collection-refs!
  "Batch-resolves collection references into readable collection rows, in ref
  order.

  Throws a 404 naming every reference that does not resolve to a collection
  satisfying `usable-collection?` that the current user can read; missing and
  unreadable references are deliberately indistinguishable."
  [collection-refs usable-collection?]
  (let [ids        (into #{} (keep :id) collection-refs)
        entity-ids (into #{} (keep :entity-id) collection-refs)
        usable?    (fn [collection]
                     (and collection
                          (usable-collection? collection)
                          (mi/can-read? collection)))
        by-id      (when (seq ids)
                     (into {} (map (juxt :id identity))
                           (typed-schemas.db/collections ids)))
        ;; entity_id is a fixed-width char column; some app dbs return it
        ;; space-padded, so key the lookup by the trimmed value.
        by-eid     (when (seq entity-ids)
                     (into {} (map (juxt (comp str/trimr :entity_id) identity))
                           (typed-schemas.db/collections-by-entity-ids entity-ids)))
        resolved   (for [{:keys [id entity-id] :as collection-ref} collection-refs]
                     [collection-ref
                      (let [collection (if id (get by-id id) (get by-eid entity-id))]
                        (when (usable? collection)
                          collection))])
        missing    (into [] (comp (remove second) (map first)) resolved)]
    (when (seq missing)
      (not-found! missing))
    (mapv second resolved)))

(defn collection-scope
  "Returns ids for the referenced collections and their descendants."
  [collection-refs]
  (when (seq collection-refs)
    (let [collections (resolve-collection-refs! collection-refs (constantly true))]
      (into (into #{} (map :id) collections)
            (map :id)
            (collection/descendants-flat-for collections)))))

(def LibraryScope
  "A resolved library scope: the readable library collection tree, expanded to
  descendants and classified by collection type. `:data-collection-ids` bound
  published table selection; `:metric-collection-ids` bound metric selection."
  [:map {:closed true}
   [:data-collection-ids [:set :int]]
   [:metric-collection-ids [:set :int]]])

(defn- library-collection?
  [collection]
  (contains? collection/library-collection-types (:type collection)))

(defn- library-refs
  "Returns collection references for explicit library refs plus any included
  well-known library roots."
  [{:keys [library-collection-refs include-data-library? include-metric-library?]}]
  (concat library-collection-refs
          (when include-data-library?
            [{:entity-id library-data-entity-id}])
          (when include-metric-library?
            [{:entity-id library-metrics-entity-id}])))

(mu/defn library-scope :- [:maybe LibraryScope]
  "Resolves library collection refs and include flags into a [[LibraryScope]],
  or nil when no library scope is requested."
  [scope-options]
  (when-let [refs (seq (library-refs scope-options))]
    (let [roots       (resolve-collection-refs! refs library-collection?)
          collections (concat roots (collection/descendants-flat-for roots))
          ids-of-type (fn [collection-type]
                        (into #{}
                              (comp (filter #(= (:type %) collection-type))
                                    (map :id))
                              collections))]
      {:data-collection-ids   (ids-of-type collection/library-data-collection-type)
       :metric-collection-ids (ids-of-type collection/library-metrics-collection-type)})))
