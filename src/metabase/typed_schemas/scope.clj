(ns metabase.typed-schemas.scope
  "Scope resolution for typed schemas."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private library-data-entity-id
  "Entity id of the root Data library collection."
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

(defn database-id-filter-clause
  "Returns a Honey SQL filter clause for optional database ids."
  [database-ids column]
  (when database-ids
    (if (seq database-ids)
      [:in column database-ids]
      [:= column -1])))

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
  "Returns ids for requested normal collections and descendants."
  [collection-refs]
  (when (seq collection-refs)
    (let [collections (for [collection-ref collection-refs]
                        (or (collection-for-ref collection-ref)
                            (not-found!)))]
      (->> collections
           (mapcat #(cons % (collection/descendants-flat %)))
           (map :id)
           set))))

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
    {:library-collections  library-collections
     :collection-ids        ids
     :data-collection-ids   (ids-for-type collection/library-data-collection-type)
     :metric-collection-ids (ids-for-type collection/library-metrics-collection-type)}))

(defn library-collections-scope
  "Returns the library scope for requested library collection refs."
  [collection-refs]
  (when (seq collection-refs)
    (let [collections (for [collection-ref collection-refs]
                        (or (library-collection-for-ref collection-ref)
                            (not-found!)))]
      (library-collection-scope* collections))))

(defn- included-library-root-collections
  [{:keys [include-data-library? include-metric-library?]}]
  (keep (fn [[include? entity-id]]
          (when include?
            (or (library-collection-for-ref {:entity-id entity-id})
                (not-found!))))
        [[include-data-library? library-data-entity-id]
         [include-metric-library? library-metrics-entity-id]]))

(defn library-scope
  "Returns the requested library scope for semantic schema options."
  [{:keys [library-collection-refs] :as options}]
  (let [included-roots            (included-library-root-collections options)
        collection-scope          (when (seq library-collection-refs)
                                    (library-collections-scope library-collection-refs))]
    (cond
      (and collection-scope (seq included-roots))
      (library-collection-scope* (concat (:library-collections collection-scope) included-roots))

      (seq included-roots)
      (library-collection-scope* included-roots)

      :else
      collection-scope)))
