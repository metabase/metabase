(ns metabase.query-processor.middleware.rewrite-array-filters
  "Rewrite equality filters on array columns to `:array-contains` clauses before SQL compilation."
  (:require
   [metabase.driver.util :as driver.u]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(defn- array-field-ref?
  [query stage-number column-ref]
  (when (and (vector? column-ref) (= :field (first column-ref)))
    (let [opts (second column-ref)]
      (or (when-let [base-type (or (:base-type opts) (:effective-type opts))]
            (isa? base-type :type/Array))
          (when-let [column (lib.field.resolution/resolve-field-ref query stage-number column-ref)]
            (isa? (or (:effective-type column) (:base-type column)) :type/Array))))))

(defn- rewrite-array-filter-clause
  "Matches `:=` / `:!=` / `:in` / `:not-in` clauses where the column ref resolves to `:type/Array`. Rewrites to
  `:array-contains` (positive) or `[:not :array-contains]` (negative). Only activates when the driver advertises
  `:filter/array-elements`."
  [query path-type path clause]
  (when (and (= path-type :lib.walk/stage)
             (vector? clause))
    (let [[tag opts column & values] clause]
      (when (and (#{:= :in :!= :not-in} tag)
                 (seq values)
                 (let [{:keys [query stage-number]} (lib.walk/query-for-path query path)]
                   (array-field-ref? query stage-number column)))
        (let [{:keys [query stage-number]} (lib.walk/query-for-path query path)
              database (lib.metadata/database query)
              driver   (:engine database)]
          (when (driver.u/supports? driver :filter/array-elements database)
            (case tag
              (:= :in) (into [:array-contains opts column] values)
              (:!= :not-in)
              (lib.options/ensure-uuid
               [:not {} (into [:array-contains opts column] values)]))))))))

(mu/defn rewrite-array-filters :- ::lib.schema/query
  "Rewrite `:=` / `:in` filters on array columns to `:array-contains`, and negated variants to `[:not ...]`."
  [query :- ::lib.schema/query]
  (lib.walk/walk-clauses query rewrite-array-filter-clause))
