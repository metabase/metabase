(ns metabase.query-processor.middleware.resolve-joined-fields
  "Middleware that adds `:join-alias` info to `:field` clauses where needed."
  (:require
   [clojure.data :as data]
   [malli.core :as mc]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(def ^:private InnerQuery
  [:and
   :map
   [:fn
    {:error/message "Must have :source-table, :source-query, or :joins"}
    (some-fn :source-table :source-query :joins)]
   [:fn
    {:error/message "Should not have :condition"}
    (complement :condition)]])

(mu/defn ^:private add-join-alias
  [{:keys [table-id], field-id :id, :as field}
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
        (recur field source-query clause))

      ;; if there are multiple candidates, try ignoring the implicit ones
      ;; presence of `:fk-field-id` indicates that the join was implicit, as the result of an `fk->` form
      (let [explicit-joins (remove :fk-field-id joins)]
        (if (= (count explicit-joins) 1)
          (recur field {:joins explicit-joins} clause)
          (let [{:keys [_id name]} (lib.metadata/table (qp.store/metadata-provider) table-id)]
            (throw (ex-info (tru "Cannot resolve joined field due to ambiguous joins: table {0} (ID {1}) joined multiple times. You need to specify an explicit `:join-alias` in the field reference."
                                 name field-id)
                            {:field      field
                             :error      qp.error-type/invalid-query
                             :joins      joins
                             :candidates candidate-tables}))))))))

(defn- primary-source-table-id
  "Get the ID of the 'primary' table towards which this query is pointing at: either the `:source-table` or indirectly
  thru some number of `:source-query`s."
  [{:keys [source-table source-query]}]
  (or source-table
      (when source-query
        (recur source-query))))

(mu/defn ^:private add-join-alias-to-fields-if-needed*
  "Wrap Field clauses in a form that has `:joins`."
  [{:keys [source-query joins], :as form} :- InnerQuery]
  ;; don't replace stuff in child `:join` or `:source-query` forms -- remove these from `form` when we call `replace`
  (let [source-table (primary-source-table-id form)
        form         (lib.util.match/replace (dissoc form :joins :source-query)
                       ;; don't add `:join-alias` to anything that already has one
                       [:field _ (_ :guard :join-alias)]
                       &match

                       ;; otherwise for any other `:field` whose table isn't the source Table, attempt to wrap it.
                       [:field
                        (field-id :guard (every-pred integer?
                                                     (fn [field-id]
                                                       (not= (:table-id (lib.metadata/field (qp.store/metadata-provider) field-id))
                                                             source-table))))
                        _]
                       (add-join-alias (lib.metadata/field (qp.store/metadata-provider) field-id) form &match))
        ;; add :joins and :source-query back which we removed above.
        form (cond-> form
               (seq joins)  (assoc :joins joins)
               source-query (assoc :source-query source-query))]
    ;; now deduplicate :fields clauses
    (lib.util.match/replace form
      (m :guard (every-pred map? :fields))
      (update m :fields distinct))))

(defn- add-join-alias-to-fields-if-needed
  [form]
  ;; look for any form that has `:joins`, then wrap stuff as needed
  (lib.util.match/replace form
    (m :guard (every-pred map? (mc/validator InnerQuery)))
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
  [query]
  (let [query' (add-join-alias-to-fields-if-needed query)]
    (when-not (= query query')
      (let [[before after] (data/diff query query')]
        (log/tracef "Inferred :field :join-alias info: %s -> %s" (u/pprint-to-str 'yellow before) (u/pprint-to-str 'cyan after))))
    query'))
