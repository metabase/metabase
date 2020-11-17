(ns metabase.query-processor.middleware.resolve-fields
  "Middleware that resolves the Fields referenced by a query."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]))

(defn- resolve-fields-with-ids!
  [field-ids]
  (qp.store/fetch-and-store-fields! field-ids)
  (when-let [parent-ids (seq (filter some? (map (comp :parent_id qp.store/field) field-ids)))]
    (recur parent-ids)))

(defn resolve-fields*
  "Resolve all field referenced in the `query`, and store them in the QP Store."
  [query]
  (u/prog1 query
    (resolve-fields-with-ids! (mbql.u/match (:query query) [:field-id id] id))))

(defn resolve-fields
  "Fetch the Fields referenced by `:field-id` clauses in a query and store them in the Query Processor Store for the
  duration of the Query Execution."
  [qp]
  (fn [query rff context]
    (qp (resolve-fields* query) rff context)))
