(ns metabase.query-processor.middleware.resolve-joined-fields
  "Middleware that adds `:join-alias` info to `:field` clauses where needed."
  (:require [clojure.data :as data]
            [clojure.tools.logging :as log]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(def ^:private InnerQuery
  (s/constrained su/Map (every-pred (some-fn :source-table :source-query :joins)
                                    (complement :condition))))

(s/defn ^:private add-join-alias
  [{table-id :table_id, field-id :id, :as field}
   {:keys [joins source-query]}   :- InnerQuery
   [_ id-or-name opts :as clause] :- mbql.s/field:id]
  (let [candidate-tables (filter (fn [join]
                                   (when-let [source-table-id (mbql.u/join->source-table-id join)]
                                     (= source-table-id table-id)))
                                 joins)]
    (case (count candidate-tables)
      1
      [:field
       (if (string? id-or-name) field-id id-or-name)
       (assoc opts :join-alias (-> candidate-tables first :alias))]

      ;; if there are no candidates, try looking for one in the source query if we have a source query. Otherwise we
      ;; can't do anything, so return field as-is
      0
      (if (empty? source-query)
        clause
        (do
          (recur field source-query clause)))

      ;; if there are multiple candidates, try ignoring the implicit ones
      ;; presence of `:fk-field-id` indicates that the join was implicit, as the result of an `fk->` form
      (let [explicit-joins (remove :fk-field-id joins)]
        (if (= (count explicit-joins) 1)
          (recur field {:joins explicit-joins} clause)
          (let [{:keys [id name]} (qp.store/table table-id)]
            (throw (ex-info (tru "Cannot resolve joined field due to ambiguous joins: table {0} (ID {1}) joined multiple times. You need to specify an explicit `:join-alias` in the field reference."
                                 name field-id)
                            {:field      field
                             :error      error-type/invalid-query
                             :joins      joins
                             :candidates candidate-tables}))))))))

(s/defn ^:private add-join-alias-to-fields-if-needed*
  "Wrap Field clauses in a form that has `:joins`."
  [{:keys [source-table source-query joins], :as form} :- InnerQuery]
  ;; don't replace stuff in child `:join` or `:source-query` forms -- remove these from `form` when we call `replace`
  (let [form (mbql.u/replace (dissoc form :joins :source-query)
               ;; don't add `:join-alias` to anything that already has one
               [:field _ (_ :guard :join-alias)]
               &match

               ;; otherwise for any other `:field` whose table isn't the source Table, attempt to wrap it.
               [:field
                (field-id :guard (every-pred integer?
                                             #(not= (:table_id (qp.store/field %)) source-table)))
                _]
               (add-join-alias (qp.store/field field-id) form &match))
        ;; add :joins and :source-query back which we removed above.
        form (cond-> form
               (seq joins)  (assoc :joins joins)
               source-query (assoc :source-query source-query))]
    ;; now deduplicate :fields clauses
    (mbql.u/replace form
      (m :guard (every-pred map? :fields))
      (update m :fields distinct))))

(defn- add-join-alias-to-fields-if-needed
  [form]
  ;; look for any form that has `:joins`, then wrap stuff as needed
  (mbql.u/replace form
    (m :guard (every-pred map? (complement (s/checker InnerQuery))))
    (cond-> m
      ;; recursively wrap stuff in nested joins or source queries in the form
      (:source-query m)
      (update :source-query add-join-alias-to-fields-if-needed)

      (seq (:joins m))
      (update :joins (partial mapv add-join-alias-to-fields-if-needed))

      ;; now call `add-join-alias-to-fields-if-needed*` which actually does the wrapping.
      true
      add-join-alias-to-fields-if-needed*)))

(defn resolve-joined-fields
  "Add `:join-alias` info to `:field` clauses where needed."
  [qp]
  (fn [query rff context]
    (let [query' (add-join-alias-to-fields-if-needed query)]
      (when-not (= query query')
        (let [[before after] (data/diff query query')]
          (log/tracef "Inferred :field :join-alias info: %s -> %s" (u/pprint-to-str 'yellow before) (u/pprint-to-str 'cyan after))))
      (qp query' rff context))))
