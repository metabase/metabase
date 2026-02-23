(ns metabase.lib.query.field-ref-upgrade
  (:require
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some select-keys mapv empty? #?(:clj for)]]
   [weavejester.dependency :as dep]))

(defn- build-field-id-mapping-for-table
  [source-table-id target-table-id]
  (let [source-fields (lib.metadata/fields query source-table-id)
        target-fields (lib.metadata/fields query target-table-id)
        target-fields-by-name (m/index-by :name target-fields)]
    (into {} (keep (fn [source-field]
                     (when-let [target-field (get target-fields-by-name (:name source-field))]
                       [(:id source-field) (:id target-field)]))
                   source-fields))))

(defn- build-field-id-mapping-for-card
  [source-card-id target-card-id]
  (let [source-fields (lib.metadata/fields query source-card-id)
        target-columns (lib.card/saved-question-metadata query target-card-id)
        target-columns-by-name (m/index-by :lib/desired-column-alias target-columns)]
    (into {} (keep (fn [source-field]
                     (when-let [target-column (get target-columns-by-name (:name source-field))]
                       [(:id source-field) (:lib/desired-column-alias target-column)]))
                   source-fields))))

(defn- build-field-id-mapping
  [query
   [old-source-type old-source-id  , :as _old-source]
   [new-source-type new-source-alias new-source-id, :as _new-source]]
  (cond
    (and (= old-source-type :table) (= new-source-type :table))
    (build-field-id-mapping-for-table old-source-id new-source-id)

    (and (= old-source-type :card) (= new-source-type :card))
    (build-field-id-mapping-for-card old-source-id new-source-id)

    :else {}))

(defn- update-field-id-in-ref
  [field-ref field-id-mapping]
  (let [field-id (lib.ref/field-ref-id field-ref)]
    (cond-> field-ref
      (and (some? field-id) (contains? field-id-mapping field-id))
      (assoc 2 (get field-id-mapping field-id)))))

(defn- walk-field-refs
  [clause f]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (cond-> clause
                            (lib.ref/field-ref-id clause)
                            f))))

(defn- update-field-ids-in-clauses
  [clauses field-id-mapping]
  (mapv (fn [clause]
          (walk-field-refs clause #(update-field-id-in-ref % field-id-mapping)))
        clauses))

(defn- update-field-ids-in-join
  [join field-id-mapping]
  (u/update-some join :conditions update-field-ids-in-clauses field-id-mapping))

(defn- update-source-table-or-card
  [{:keys [source-table source-card], :as stage}
   [old-source-type old-source-id, :as _old-source]
   [new-source-type new-source-alias new-source-id, :as _new-source]]
  (cond-> stage
    (and (= old-source-type :table) (= old-source-id source-table)) (assoc :source-table new-source-id)
    (and (= old-source-type :card) (= old-source-id source-card)) (assoc :source-card new-source-id)))

(defn- update-field-ids-in-stage
  [query stage-number]
  (-> (lib.util/query-stage query stage-number)
      (update-source-table-or-card old-source new-source)
      (u/update-some :fields update-field-ref-ids-in-clauses field-id-mapping)
      (u/update-some :expressions update-field-ids-in-clauses field-id-mapping)
      (u/update-some :filters update-field-ids-in-clauses field-id-mapping)
      (u/update-some :aggregation update-field-ids-in-clauses field-id-mapping)
      (u/update-some :breakout update-field-ids-in-clauses field-id-mapping)
      (u/update-some :order-by update-field-ids-in-clauses field-id-mapping)
      (u/update-some :joins update-field-ref-ids-in-join field-id-mapping)))

(defn update-field-refs
  "Updates the qeury to use the new source table or card."
  [query old-source new-source]
  (let [field-id-mapping (build-field-id-mapping query old-source new-source)]
    (update query :stages #(vec (map-indexed (fn [stage-number _]
                                               (update-field-ids-in-stage query stage-number field-id-mapping))
                                             %)))))
