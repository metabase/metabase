(ns metabase.lib.query.field-ref-upgrade
  (:require
   ;; allowed since this is needed to convert legacy queries to MBQL 5
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some select-keys mapv empty? #?(:clj for)]]
   [weavejester.dependency :as dep]))

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
  (u/update-some join :conditions upgrade-field-refs-in-clauses query stage-number columns))

(defn- upgrade-field-refs-in-stage
  [query stage-number]
  (let [stage (lib.util/query-stage query stage-number)
        visible-columns (when ((some-fn :fields :filters :expressions :aggregation :breakout :order-by) stage)
                          (lib.metadata.calculation/visible-columns query stage-number)))
        orderable-columns (if ((some-fn :aggregation :breakout) stage)
                            (lib.order-by/orderable-columns query stage-number)
                            visible-columns)]
    (-> stage
      (u/update-some :fields upgrade-field-refs-in-clauses query stage-number visible-columns)
      (u/update-some :joins upgrade-field-refs-in-join query stage-number visible-columns)
      (u/update-some :expressions upgrade-field-refs-in-clauses query stage-number visible-columns)
      (u/update-some :filters upgrade-field-refs-in-clauses query stage-number visible-columns)
      (u/update-some :aggregation upgrade-field-refs-in-clauses query stage-number visible-columns)
      (u/update-some :breakout upgrade-field-refs-in-clauses query stage-number visible-columns)
      (u/update-some :order-by upgrade-field-refs-in-clauses query stage-number orderable-columns)))

(defn upgrade-field-refs
  "Upgrades all the field refs in the query."
  [query]
  (update query :stages #(vec (map-indexed (fn [i _]
                                             (upgrade-field-refs-in-stage query i))
                                           %))))
