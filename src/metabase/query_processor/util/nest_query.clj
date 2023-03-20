(ns metabase.query-processor.util.nest-query
  "Utility functions for raising/nesting parts of MBQL queries. Currently, this only has [[nest-expressions]], but in
  the future hopefully we can generalize this a bit so we can do more things that require us to introduce another
  level of nesting, e.g. support window functions.

   (This namespace is here rather than in the shared MBQL lib because it relies on other QP-land utils like the QP
  refs stuff.)"
  (:require
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.mbql.util :as mbql.u]
   [metabase.plugins.classloader :as classloader]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.util :as u]))

(defn- joined-fields [inner-query]
  (m/distinct-by
   add/normalize-clause
   (mbql.u/match (walk/prewalk (fn [x]
                                 (if (map? x)
                                   (dissoc x :source-query :source-metadata)
                                   x))
                               inner-query)
     [:field _ (_ :guard :join-alias)]
     &match)))

(defn- add-joined-fields-to-fields [joined-fields source]
  (cond-> source
    (seq joined-fields) (update :fields (fn [fields]
                                          (m/distinct-by add/normalize-clause (concat fields joined-fields))))))

(defn- keep-source+alias-props [field]
  (update field 2 select-keys [::add/source-alias ::add/source-table :join-alias]))

(defn- nfc-root [[_ field-id]]
  (when-let [field (and (int? field-id) (qp.store/field field-id))]
    (when-let [nfc-root (first (:nfc_path field))]
      {:table_id (:table_id field)
       :name nfc-root})))

(defn- field-id-props [[_ field-id]]
  (when-let [field (and (int? field-id) (qp.store/field field-id))]
    (select-keys field [:table_id :name])))

(defn- remove-unused-fields [inner-query source]
  (let [used-fields (-> #{}
                        (into (map keep-source+alias-props) (mbql.u/match inner-query :field))
                        (into (map keep-source+alias-props) (mbql.u/match inner-query :expression)))
        nfc-roots (into #{} (keep nfc-root) used-fields)]
    (update source :fields (fn [fields]
                             (filterv #(or (-> % keep-source+alias-props used-fields)
                                           (-> % field-id-props nfc-roots))
                                      fields)))))

(defn- nest-source [inner-query]
  (classloader/require 'metabase.query-processor)
  (let [filter-clause (:filter inner-query)
        keep-filter? (nil? (mbql.u/match-one filter-clause :expression))
        source (as-> (select-keys inner-query [:source-table :source-query :source-metadata :joins :expressions]) source
                 ;; preprocess this without a current user context so it's not subject to permissions checks. To get
                 ;; here in the first place we already had to do perms checks to make sure the query we're transforming
                 ;; is itself ok, so we don't need to run another check
                 (binding [api/*current-user-id* nil]
                   ((resolve 'metabase.query-processor/preprocess) {:database (u/the-id (qp.store/database))
                                                                    :type     :query
                                                                    :query    source}))
                 (add/add-alias-info source)
                 (:query source)
                 (dissoc source :limit)
                 (add-joined-fields-to-fields (joined-fields inner-query) source)
                 (remove-unused-fields inner-query source)
                 (cond-> source
                   keep-filter? (assoc :filter filter-clause)))]
    (-> inner-query
        (dissoc :source-table :source-metadata :joins)
        (assoc :source-query source)
        (cond-> keep-filter? (dissoc :filter)))))

(defn- raise-source-query-expression-ref
  "Convert an `:expression` reference from a source query into an appropriate `:field` clause for use in the surrounding
  query."
  [{:keys [source-query], :as query} [_ expression-name opts :as _clause]]
  (let [expression-definition        (mbql.u/expression-with-name query expression-name)
        {base-type :base_type}       (some-> expression-definition annotate/infer-expression-type)
        {::add/keys [desired-alias]} (mbql.u/match-one source-query
                                       [:expression (_ :guard (partial = expression-name)) source-opts]
                                       source-opts)]
    [:field
     (or desired-alias expression-name)
     (assoc opts :base-type (or base-type :type/*))]))

(defn- rewrite-fields-and-expressions [query]
  (mbql.u/replace query
    ;; don't rewrite anything inside any source queries or source metadata.
    (_ :guard (constantly (some (partial contains? (set &parents))
                                [:source-query :source-metadata])))
    &match

    :expression
    (raise-source-query-expression-ref query &match)

    ;; mark all Fields at the new top level as `::outer-select` so QP implementations know not to apply coercion or
    ;; whatever to them a second time.
    [:field _id-or-name (_opts :guard (every-pred :temporal-unit (complement ::outer-select)))]
    (recur (mbql.u/update-field-options &match assoc ::outer-select true))

    [:field id-or-name (opts :guard :join-alias)]
    (let [{::add/keys [desired-alias]} (mbql.u/match-one (:source-query query)
                                         [:field
                                          (_ :guard (partial = id-or-name))
                                          (matching-opts :guard #(= (:join-alias %) (:join-alias opts)))]
                                         matching-opts)]
      [:field id-or-name (cond-> opts
                           desired-alias (assoc ::add/source-alias desired-alias
                                                ::add/desired-alias desired-alias))])

    ;; when recursing into joins use the refs from the parent level.
    (m :guard (every-pred map? :joins))
    (let [{:keys [joins]} m]
      (-> (dissoc m :joins)
          rewrite-fields-and-expressions
          (assoc :joins (mapv (fn [join]
                                (assoc join :qp/refs (:qp/refs query)))
                              joins))))))

(defn nest-expressions
  "Pushes the `:source-table`/`:source-query`, `:expressions`, and `:joins` in the top-level of the query into a
  `:source-query` and updates `:expression` references and `:field` clauses with `:join-alias`es accordingly. See
  tests for examples. This is used by the SQL QP to make sure expressions happen in a subselect."
  [query]
  (let [{:keys [expressions], :as query} (m/update-existing query :source-query nest-expressions)]
    (if (empty? expressions)
      query
      (let [{:keys [source-query], :as query} (nest-source query)
            query                             (rewrite-fields-and-expressions query)
            source-query                      (assoc source-query :expressions expressions)]
        (-> query
            (dissoc :source-query :expressions)
            (assoc :source-query source-query)
            add/add-alias-info)))))
