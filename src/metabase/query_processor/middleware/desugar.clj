(ns metabase.query-processor.middleware.desugar
  (:require
   [medley.core :as m]
   [metabase.legacy-mbql.predicates :as mbql.preds]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.malli :as mu]))

(defn- add-missing-field-base-types
  "Add base type to fields with id that are missing it. It is necessary for correct function
   of [[metabase.legacy-mbql.util/desugar-is-empty-and-not-empty]]."
  [query]
  (lib.util.match/replace query
    (field-clause :guard (fn [clause]
                           (and (mbql.preds/Field? clause)
                                (integer? (second clause))
                                (not (contains? (get clause 2) :base-type)))))
    (let [id (second field-clause)
          metadata (lib.metadata/field (qp.store/metadata-provider) id)
          {:keys [base-type]} metadata]
      (update field-clause 2 assoc
              :base-type base-type
              ::desugar-added-base-type true))))

(defn- remove-desugar-added-base-types
  [query]
  (lib.util.match/replace query
    (field-clause :guard (fn [clause]
                           (and (mbql.preds/Field? clause)
                                (integer? (second clause))
                                (get-in clause [2 ::desugar-added-base-type]))))
    (update field-clause 2 (comp not-empty
                                 #(dissoc % :base-type ::desugar-added-base-type)))))

(defn- desugar*
  [query]
  (lib.util.match/replace query
    (filter-clause :guard mbql.preds/Filter?)
    (mbql.u/desugar-filter-clause filter-clause)

    (temporal-extract-clause :guard mbql.preds/DatetimeExpression?)
    (mbql.u/desugar-temporal-extract temporal-extract-clause)

    (expression :guard mbql.preds/FieldOrExpressionDef?)
    (mbql.u/desugar-expression expression)))

(mu/defn desugar :- mbql.s/Query
  "Middleware that uses MBQL lib functions to replace high-level 'syntactic sugar' clauses like `time-interval` and
  `inside` with lower-level clauses like `between`. This is done to minimize the number of MBQL clauses individual
  drivers need to support. Clauses replaced by this middleware are marked `^:sugar` in the MBQL schema."
  [query]
  ;; Base types are added to field options for integer id fields that are missing those. Then original desugar
  ;; is performed. Later those base types (added for desugaring purposes [expanding is-empty, not-empty]) are removed.
  (m/update-existing query :query (comp remove-desugar-added-base-types
                                        desugar*
                                        add-missing-field-base-types)))
