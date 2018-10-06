(ns metabase.query-processor.middleware.resolve-fields
  "Middleware that resolves the Fields referenced by a query."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- resolve-fields* [{mbql-inner-query :query, :as query}]
  (u/prog1 query
    (when-let [field-ids (seq (map second (mbql.u/clause-instances :field-id mbql-inner-query)))]
      (doseq [field (db/select (vec (cons Field qp.store/field-columns-to-fetch)) :id [:in (set field-ids)])]
        (qp.store/store-field! field)))))

(defn resolve-fields
  "Fetch the Fields referenced by `:field-id` clauses in a query and store them in the Query Processor Store for the
  duration of the Query Execution."
  [qp]
  (comp qp resolve-fields*))
