(ns metabase.query-processor.middleware.resolve-fields
  "Middleware that resolves the Fields referenced by a query."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- resolve-fields-with-ids! [field-ids]
  (let [fetched-fields (db/select (apply vector Field qp.store/field-columns-to-fetch) :id [:in (set field-ids)])]
    ;; store the new fields
    (doseq [field fetched-fields]
      (qp.store/store-field! field))
    ;; now recursively fetch parents if needed
    (when-let [parent-ids (seq (filter some? (map :parent_id fetched-fields)))]
      (recur parent-ids))))

(defn- resolve-fields* [query]
  (u/prog1 query
    (when-let [field-ids (seq (remove (qp.store/already-fetched-field-ids)
                                      (mbql.u/match (:query query) [:field-id id] id)))]
      (resolve-fields-with-ids! field-ids))))

(defn resolve-fields
  "Fetch the Fields referenced by `:field-id` clauses in a query and store them in the Query Processor Store for the
  duration of the Query Execution."
  [qp]
  (comp qp resolve-fields*))
