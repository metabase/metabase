(ns metabase.typed-schemas.api.scope
  "Scope resolution for typed-schema endpoints."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn truthy-query-param?
  "Returns true when a query param value should be interpreted as enabled."
  [v]
  (contains? #{true "true" "1"} v))

(def ^:private library-data-entity-id
  "Entity id of the root Data library collection."
  "librarylibrarydatadat")

(def ^:private library-metrics-entity-id
  "Entity id of the root metrics library collection."
  "librarylibrarymetrics")

(defn query-database-value
  "Returns the requested database id/name query param."
  [query-params]
  (some-> (or (:database query-params)
              (:database-name query-params))
          str/trim
          not-empty))

(defn database-ids-for-value
  "Returns readable database ids matching `database-value`."
  [database-value]
  (when database-value
    (let [database-id (parse-long database-value)]
      (->> (if database-id
             (t2/select :model/Database :id database-id)
             (t2/select :model/Database :name database-value))
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

(defn query-library-value
  "Returns the `library` query param."
  [query-params]
  (some-> (:library query-params)
          str/trim
          not-empty))

(defn- query-comma-separated-values
  [query-params param-keys]
  (when-let [value (some-> (->> param-keys
                                (keep query-params)
                                first)
                           str/trim
                           not-empty)]
    (->> (str/split value #",")
         (map str/trim)
         (remove str/blank?)
         seq)))

(defn query-library-collection-values
  "Returns requested library collection refs."
  [query-params]
  (query-comma-separated-values query-params [:library-collections
                                              :collections]))

(defn query-include-data-library?
  "Returns true when the root Data library should be included."
  [query-params]
  (truthy-query-param? (:include-data-library query-params)))

(defn query-include-metric-library?
  "Returns true when the root metrics library should be included."
  [query-params]
  (truthy-query-param? (:include-metric-library query-params)))

(defn query-include-models?
  "Returns true when readable model action namespaces should be included."
  [query-params]
  (truthy-query-param? (:include-models query-params)))

(defn query-question-collection-values
  "Returns requested question collection refs."
  [query-params]
  (query-comma-separated-values query-params [:question-collections]))

(defn- library-collection-for-value
  [library-value]
  (when library-value
    (let [collection-id (parse-long library-value)]
      (->> (if collection-id
             (t2/select :model/Collection :id collection-id)
             (t2/select :model/Collection :name library-value))
           (filter #(contains? collection/library-collection-types (:type %)))
           (filter mi/can-read?)
           first))))

(defn- library-collection-for-ref
  [collection-value]
  (let [collection-id (parse-long collection-value)]
    (->> (if collection-id
           (t2/select :model/Collection :id collection-id)
           (t2/select :model/Collection :entity_id collection-value))
         (filter #(contains? collection/library-collection-types (:type %)))
         (filter mi/can-read?)
         first)))

(defn- library-collection-for-entity-id
  [entity-id]
  (->> (t2/select :model/Collection :entity_id entity-id)
       (filter #(contains? collection/library-collection-types (:type %)))
       (filter mi/can-read?)
       first))

(defn- collection-for-ref
  [collection-value]
  (let [collection-id (parse-long collection-value)]
    (->> (if collection-id
           (t2/select :model/Collection :id collection-id)
           (t2/select :model/Collection :entity_id collection-value))
         (filter mi/can-read?)
         first)))

(defn collection-scope
  "Returns ids for requested normal collections and descendants."
  [collection-values]
  (when (seq collection-values)
    (let [collections (for [collection-value collection-values]
                        (or (collection-for-ref collection-value)
                            (api/check-404 false)))]
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

(defn library-collection-scope
  "Returns the library scope for one named or numeric library collection."
  [library-value]
  (when library-value
    (let [library (or (library-collection-for-value library-value)
                      (api/check-404 false))]
      (library-collection-scope* [library]))))

(defn library-collections-scope
  "Returns the library scope for requested library collection refs."
  [collection-values]
  (when (seq collection-values)
    (let [collections (for [collection-value collection-values]
                        (or (library-collection-for-ref collection-value)
                            (api/check-404 false)))]
      (library-collection-scope* collections))))

(defn- included-library-root-collections
  [query-params]
  (keep (fn [[include? entity-id]]
          (when include?
            (or (library-collection-for-entity-id entity-id)
                (api/check-404 false))))
        [[(query-include-data-library? query-params) library-data-entity-id]
         [(query-include-metric-library? query-params) library-metrics-entity-id]]))

(defn library-scope
  "Returns the requested library scope for data and metric library params."
  [query-params]
  (let [library-value             (query-library-value query-params)
        library-collection-values (query-library-collection-values query-params)
        included-roots            (included-library-root-collections query-params)
        collection-scope          (cond
                                    library-value
                                    (library-collection-scope library-value)

                                    library-collection-values
                                    (library-collections-scope library-collection-values))]
    (cond
      (and collection-scope (seq included-roots))
      (library-collection-scope* (concat (:library-collections collection-scope) included-roots))

      (seq included-roots)
      (library-collection-scope* included-roots)

      :else
      collection-scope)))
