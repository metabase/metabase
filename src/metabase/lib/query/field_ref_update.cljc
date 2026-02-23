(ns metabase.lib.query.field-ref-update
  (:refer-clojure :exclude [mapv])
  (:require
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.performance :refer [mapv]]))

(defn- build-field-id-mapping-for-table
  "Builds a mapping of field IDs of the source table to field IDs of the target table."
  [query source-table-id target-table-id]
  (let [source-fields (lib.metadata/fields query source-table-id)
        target-fields (lib.metadata/fields query target-table-id)
        target-fields-by-name (m/index-by :name target-fields)]
    (into {} (keep (fn [source-field]
                     (when-let [target-field (get target-fields-by-name (:name source-field))]
                       [(:id source-field) (:id target-field)]))
                   source-fields))))

(defn- build-field-id-mapping-for-card
  "Builds a mapping of field IDs of the source card to desired column aliases of the target card."
  [query source-card-id target-card-id]
  (let [source-fields (lib.metadata/fields query source-card-id)
        target-columns (lib.card/saved-question-metadata query target-card-id)
        target-columns-by-name (m/index-by :lib/desired-column-alias target-columns)]
    (into {} (keep (fn [source-field]
                     (when-let [target-column (get target-columns-by-name (:name source-field))]
                       [(:id source-field) (:lib/desired-column-alias target-column)]))
                   source-fields))))

(defn- build-field-id-mapping
  "Builds a mapping of field IDs of the source table to what should replace them in a field ref.

  - If the target is a table, source field IDs will be replaced with the target field IDs.
  - If the target is a card, source field IDs will be replaced with the desired column aliases of the target card columns.
  - If the source is not a table or card, the mapping will be empty and no replacement should be made."
  [query
   [old-source-type old-source-id  , :as _old-source]
   [new-source-type new-source-id, :as _new-source]]
  (cond
    (and (= old-source-type :table) (= new-source-type :table))
    (build-field-id-mapping-for-table query old-source-id new-source-id)

    (and (= old-source-type :card) (= new-source-type :card))
    (build-field-id-mapping-for-card query old-source-id new-source-id)

    :else {}))

(defn- update-field-id-in-ref
  "If this field ref is field-id-based and there is a mapping for the field ID, update the ref to use the target field ID or desired column alias."
  [field-ref field-id-mapping]
  (let [source-field-id (lib.ref/field-ref-id field-ref)
        source-field-options (lib.options/options field-ref)
        target-column-id-or-name (get field-id-mapping source-field-id)]
    (if (some? target-column-id-or-name)
      [:field source-field-options target-column-id-or-name]
      field-ref)))

(defn- walk-field-refs
  "Walks the clause and updates the field refs using the provided function."
  [clause f]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (cond-> clause
                            (lib.util/field-clause? clause)
                            f))))

(defn- update-field-ids-in-clauses
  "Updates the field IDs in the clauses using the provided mapping."
  [clauses field-id-mapping]
  (if (keyword? clauses)
    clauses
    (mapv (fn [clause]
            (walk-field-refs clause #(update-field-id-in-ref % field-id-mapping)))
          clauses)))

(defn- update-source-table-or-card
  "Updates the source table or card in the stage."
  [{:keys [source-table source-card], :as stage}
   [old-source-type old-source-id, :as old-source]
   [new-source-type new-source-id, :as new-source]]
  (when-not (every? #{:table :card} [old-source-type new-source-type])
    (throw (ex-info "Can only swap cards and tables" {:old-source old-source
                                                      :new-source new-source})))
  (cond
    (and (= old-source-type :table) (= old-source-id source-table))
    (-> stage
        (dissoc :source-table)
        (assoc (case new-source-type
                 :card :source-card
                 :table :source-table) new-source-id))
    (and (= old-source-type :card) (= old-source-id source-card))
    (-> stage
        (dissoc :source-card)
        (assoc (case new-source-type
                 :card :source-card
                 :table :source-table) new-source-id))
    :else stage))

(defn- update-source-and-field-ids-in-join
  "Updates the source table or card and field IDs in the join conditions using the provided mapping."
  [join old-source new-source field-id-mapping]
  (-> join
      (update-source-table-or-card old-source new-source)
      (u/update-some :fields (fn [fields]
                               (if (keyword? fields)
                                 fields
                                 (update-field-ids-in-clauses fields field-id-mapping))))
      (u/update-some :conditions update-field-ids-in-clauses field-id-mapping)))

(defn- update-source-and-field-ids-in-joins
  "Updates the field IDs in all joins using the provided mapping."
  [joins old-source new-source field-id-mapping]
  (mapv #(update-source-and-field-ids-in-join % old-source new-source field-id-mapping) joins))

(defn- update-field-ids-in-stage
  "Updates the field IDs in the stage using the provided mapping."
  [query stage-number old-source new-source field-id-mapping]
  (-> (lib.util/query-stage query stage-number)
      (update-source-table-or-card old-source new-source)
      (u/update-some :fields update-field-ids-in-clauses field-id-mapping)
      (u/update-some :joins update-source-and-field-ids-in-joins old-source new-source field-id-mapping)
      (u/update-some :expressions update-field-ids-in-clauses field-id-mapping)
      (u/update-some :filters update-field-ids-in-clauses field-id-mapping)
      (u/update-some :aggregation update-field-ids-in-clauses field-id-mapping)
      (u/update-some :breakout update-field-ids-in-clauses field-id-mapping)
      (u/update-some :order-by update-field-ids-in-clauses field-id-mapping)))

(defn update-field-refs
  "Updates the query to use the new source table or card."
  [query old-source new-source]
  (let [field-id-mapping (build-field-id-mapping query old-source new-source)]
    (update query :stages #(vec (map-indexed (fn [stage-number _]
                                               (update-field-ids-in-stage query stage-number old-source new-source field-id-mapping))
                                             %)))))
