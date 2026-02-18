(ns metabase.lib.query.field-ref-upgrade
  (:require
   ;; allowed since this is needed to convert legacy queries to MBQL 5
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.dispatch :as lib.dispatch]
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
  (cond
    (lib.ref/field-ref-id field-ref)
    (or (some-> (lib.equality/find-matching-column query stage-number field-ref columns)
                lib.ref/ref)
        (throw (ex-info "Cannot find matching column."
                        {:query query
                         :stage-number stage-number
                         :field-ref field-ref
                         :columns columns})))

    (lib.ref/field-ref-name field-ref)
    field-ref

    :else
    (throw (ex-info "Unknown field-ref type." {:field-ref field-ref}))))

(defn- walk-field-refs
  [clause f]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (if-not (lib.field/is-field-clause? clause)
                            clause
                            (f clause)))))

(defn- upgrade-field-refs-in-clauses
  [clauses query stage-number columns-fn]
  (let [columns (columns-fn query stage-number)
        upgrade (fn [field-ref]
                  (upgrade-field-ref-by-columns query stage-number columns field-ref))]
    (mapv (fn [fr] (walk-field-refs fr upgrade)) clauses)))

(defn- upgrade-field-refs-in-join
  [query stage-number join]
  (if (:conditions join)
    (let [lhs-columns (lib.join/join-condition-lhs-columns query stage-number join nil nil)
          rhs-columns (lib.join/join-condition-rhs-columns query stage-number join nil nil)
          columns (concat lhs-columns rhs-columns)]
      (update join :conditions upgrade-field-refs-in-clauses query stage-number (constantly columns)))
    join))

(defn- upgrade-field-refs-in-stage
  [query stage-number]
  (let [stage (lib.util/query-stage query stage-number)]
    (cond-> stage
      (:fields stage)
      (update :fields      upgrade-field-refs-in-clauses query stage-number lib.field/fieldable-columns)

      (:filters stage)
      (update :filters     upgrade-field-refs-in-clauses query stage-number lib.filter/filterable-columns)

      (:expressions stage)
      (update :expressions upgrade-field-refs-in-clauses query stage-number lib.expression/expressionable-columns)

      (:aggregation stage)
      (update :aggregation upgrade-field-refs-in-clauses query stage-number lib.expression/expressionable-columns)

      (:breakout stage)
      (update :breakout    upgrade-field-refs-in-clauses query stage-number lib.breakout/breakoutable-columns)

      (:joins stage)
      (update :joins #(mapv (fn [join]
                              (upgrade-field-refs-in-join query stage-number join)) %)))))

(defn upgrade-field-refs
  "Upgrades all the field refs in the query."
  [query]
  (update query :stages #(vec (map-indexed (fn [i _]
                                             (upgrade-field-refs-in-stage query i))
                                           %))))
