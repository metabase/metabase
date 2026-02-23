(ns metabase.lib.query.field-ref-upgrade
  (:require
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.performance :refer [mapv]]))

(defn- upgrade-field-ref-by-columns
  [query stage-number columns field-ref]
  (or (some-> (lib.equality/find-matching-column query stage-number field-ref columns)
              lib.ref/ref)
      field-ref))

(defn- walk-field-refs
  [clause f]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (cond-> clause
                            (lib.field/is-field-clause? clause)
                            f))))

(defn- upgrade-field-refs-in-clauses
  [clauses query stage-number columns]
  (mapv (fn [clause]
          (walk-field-refs clause #(upgrade-field-ref-by-columns query stage-number columns %)))
        clauses))

(defn- upgrade-field-refs-in-join
  [query stage-number join columns]
  (-> join
      (u/update-some :fields upgrade-field-refs-in-clauses query stage-number columns)
      (u/update-some :conditions upgrade-field-refs-in-clauses query stage-number columns)))

(defn- upgrade-field-refs-in-joins
  [query stage-number joins columns]
  (mapv #(upgrade-field-refs-in-join query stage-number % columns) joins))

(defn- upgrade-field-refs-in-stage
  [query stage-number]
  (let [stage (lib.util/query-stage query stage-number)
        visible-columns (when ((some-fn :fields :filters :expressions :aggregation :breakout :order-by) stage)
                          (lib.metadata.calculation/visible-columns query stage-number))
        orderable-columns (if ((some-fn :aggregation :breakout) stage)
                            (lib.order-by/orderable-columns query stage-number)
                            visible-columns)]
    (-> stage
        (u/update-some :fields upgrade-field-refs-in-clauses query stage-number visible-columns)
        (u/update-some :joins (fn [joins] (upgrade-field-refs-in-joins query stage-number joins visible-columns)))
        (u/update-some :expressions upgrade-field-refs-in-clauses query stage-number visible-columns)
        (u/update-some :filters upgrade-field-refs-in-clauses query stage-number visible-columns)
        (u/update-some :aggregation upgrade-field-refs-in-clauses query stage-number visible-columns)
        (u/update-some :breakout upgrade-field-refs-in-clauses query stage-number visible-columns)
        (u/update-some :order-by upgrade-field-refs-in-clauses query stage-number orderable-columns))))

(defn upgrade-field-refs
  "Upgrades all the field refs in the query."
  [query]
  (update query :stages #(vec (map-indexed (fn [stage-number _]
                                             (upgrade-field-refs-in-stage query stage-number))
                                           %))))
