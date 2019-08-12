(ns metabase.query-processor.middleware.simplify
  "Middleware that performs final simplifications to the MBQL query before running it."
  (:require [metabase.mbql.util :as mbql.u]))

(defn- eliminate-unneeded-datetime-field-casts**
  "In a map with `:source-metadata`, unwrap `datetime-field` clauses that use the same unit mentioned in the source.
  This prevents us from having to apply a duplicate cast to the values, which are already of the correct bucketing."
  [{:keys [source-metadata] :as m}]
  (mbql.u/replace (dissoc m :source-query)
    [:datetime-field field unit]
    (let [v           (mbql.u/field-clause->id-or-literal field)
          k           (if (integer? v) :id :name)
          match       (some (fn [metadata]
                              (when (= (get metadata k) v)
                                metadata))
                            source-metadata)
          can-unwrap? (and match
                           (= unit :year)
                           (= (:unit match) unit))]
      (if can-unwrap?
        field
        &match))))

(defn- eliminate-unneeded-datetime-field-casts* [query]
  (mbql.u/replace query
    (m :guard (every-pred map? :source-metadata))
    ;; we only want to replace in the `top-level`, so remove `:source-query` from `m` before replacing; add it back
    ;; after performing the replacement.
    (let [{:keys [source-query]}                  m
          {:keys [source-metadata], :as replaced} (cond-> (eliminate-unneeded-datetime-field-casts** (dissoc m :source-query))
                                                    source-query (assoc :source-query source-query))]
      ;; recursively replace any other matches in `replaced`. Remove `:source-metadata` before the recursive call so
      ;; we don't end up in an infinite loop, then add it back when we're done.
      (-> (eliminate-unneeded-datetime-field-casts* (dissoc replaced :source-metadata))
          (assoc :source-metadata source-metadata)))))

(defn eliminate-unneeded-datetime-field-casts
  "Unwrap `:datetime-field` clauses in queries where the field is already bucketed in its source query.

    {:source-query {:fields [[:datetime-field [:field-id 10] :year]]}
     :fields       [[:datetime-field [:field-id 10] :year]]}
    ->
    {:source-query {:fields [[:datetime-field [:field-id 10] :year]]}
     :fields       [[:field-id 10]]}"
  [qp]
  (comp qp eliminate-unneeded-datetime-field-casts*))
