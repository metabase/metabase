(ns metabase.query-processor.middleware.resolve-joined-fields
  "Middleware that wraps field references in `:joined-field` clauses where needed."
  (:require [clojure.data :as data]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]))

(defn- wrap-field-in-joined-field
  [{table-id :table_id, field-id :id} joins]
  (let [candidate-tables (filter (fn [join]
                                   (when-let [source-table-id (mbql.u/join->source-table-id join)]
                                     (= source-table-id table-id)))
                                 joins)]
    (case (count candidate-tables)
      1 [:joined-field (-> candidate-tables first :alias) [:field-id field-id]]
      0 [:field-id field-id]
      (let [{:keys [id name]} (qp.store/table table-id)]
        (throw (ex-info (tru "Cannot resolve joined field due to ambiguous joins: table {0} (ID {1}) joined multiple times. You need to wrap field references in explicit :joined-field clauses."
                             name field-id)
                        {:error error-type/invalid-query
                         :joins joins}))))))

(defn- wrap-fields-in-joined-field-if-needed*
  "Wrap Field clauses in a form that has `:joins`."
  [{:keys [source-table source-query joins] :as form}]
  ;; don't replace stuff in child `:join` or `:source-query` forms -- remove these from `form` when we call `replace`
  (let [form (mbql.u/replace (dissoc form :joins :source-query)
               ;; don't wrap a `:joined-field`.
               :joined-field
               &match

               ;; otherwise for any other `:field-id` we find, attempt to wrap it.
               [:field-id field-id]
               (let [field (qp.store/field field-id)]
                 (if (= (:table_id field) source-table)
                   [:field-id field-id]
                   (wrap-field-in-joined-field field joins))))
        ;; add :joins and :source-query back which we removed above.
        form (cond-> form
               (seq joins)  (assoc :joins joins)
               source-query (assoc :source-query source-query))]
    ;; now deduplicate :fields clauses
    (mbql.u/replace form
      (m :guard (every-pred map? :fields))
      (update m :fields distinct))))

(defn- wrap-fields-in-joined-field-if-needed
  [form]
  ;; look for any form that has `:joins`, then wrap stuff as needed
  (mbql.u/replace form
    (m :guard (every-pred map? :joins))
    (cond-> m
      ;; recursively wrap stuff in nested joins or source queries in the form
      (:source-query m)
      (update :source-query wrap-fields-in-joined-field-if-needed)

      (seq (:joins m))
      (update :joins (partial mapv wrap-fields-in-joined-field-if-needed))

      ;; now call `wrap-fields-in-joined-field-if-needed*` which actually does the wrapping.
      true
      wrap-fields-in-joined-field-if-needed*)))

(defn resolve-joined-fields
  "Wrap field references in `:joined-field` clauses where needed."
  [qp]
  (fn [query rff context]
    (let [query' (wrap-fields-in-joined-field-if-needed query)]
      (when-not (= query query')
        (log/tracef "Inferred :joined-field clauses: %s" (u/pprint-to-str 'yellow (take 2 (data/diff query query')))))
      (qp query' rff context))))
