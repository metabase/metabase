(ns metabase.query-processor.middleware.resolve-joined-fields
  "Middleware that wraps field references in `:joined-field` clauses where needed."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.query-processor
             [error-type :as error-type]
             [store :as qp.store]]
            [metabase.util.i18n :refer [tru]]))

(defn- wrap-field-in-joined-field
  [{:keys [table_id id]} joins]
  (let [candidate-tables (filter (comp #{table_id} :source-table) joins)]
    (case (count candidate-tables)
      1 [:joined-field (-> candidate-tables first :alias) [:field-id id]]
      0 [:field-id id]
      (let [{:keys [id name]} (qp.store/table table_id)]
        (throw (ex-info (tru "Cannot resolve joined field due to ambiguous joins: table {0} (ID {1}) joined multiple times. You need to wrap field references in explicit :joined-field clauses."
                             name id)
                 {:error error-type/invalid-query
                  :joins joins}))))))

(defn- wrap-fields-in-joined-field-if-needed
  [{:keys [source-table source-query joins] :as form}]
  (let [form (mbql.u/replace (dissoc form :source-query)
               [:field-id field-id] (let [field (qp.store/field field-id)]
                                      (if (or (= (:table_id field) source-table)
                                              (contains? (set &parents) :joined-field))
                                        [:field-id field-id]
                                        (wrap-field-in-joined-field field joins))))]
    (cond-> form
      source-query (assoc :source-query (wrap-fields-in-joined-field-if-needed source-query)))))

(defn resolve-joined-fields
  "Wrap field references in `:joined-field` clauses where needed."
  [qp]
  (fn [query rff context]
    (qp (update query :query wrap-fields-in-joined-field-if-needed) rff context)))
