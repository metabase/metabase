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
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.middleware.resolve-joins :as qp.middleware.resolve-joins]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defn- joined-fields [inner-query]
  (m/distinct-by
   add/normalize-clause
   (lib.util.match/match (walk/prewalk (fn [x]
                                 (if (map? x)
                                   (dissoc x :source-query :source-metadata)
                                   x))
                               inner-query)
     [:field _ (_ :guard :join-alias)]
     &match)))

(defn- keep-source+alias-props [field]
  (update field 2 select-keys [::add/source-alias ::add/source-table :join-alias]))

(defn- nfc-root [[_ field-id]]
  (when-let [field (and (int? field-id)
                        (lib.metadata/field (qp.store/metadata-provider) field-id))]
    (when-let [nfc-root (first (:nfc-path field))]
      {:table_id (:table-id field)
       :name nfc-root})))

(defn- field-id-props [[_ field-id]]
  (when-let [field (and (int? field-id)
                        (lib.metadata/field (qp.store/metadata-provider) field-id))]
    {:table_id (:table-id field)
     :name     (:name field)}))

(defn- remove-unused-fields [inner-query source]
  (let [used-fields (into #{}
                          (map keep-source+alias-props)
                          (lib.util.match/match inner-query #{:field :expression}))
        nfc-roots (into #{} (keep nfc-root) used-fields)]
    (log/debugf "Used fields:\n%s" (u/pprint-to-str used-fields))
    (letfn [(used? [[_tag id-or-name {::add/keys [desired-alias], :as opts}, :as field]]
              (or (contains? used-fields (keep-source+alias-props field))
                  ;; we should also consider a Field to be used if we're referring to it with a nominal field literal
                  ;; ref in the next stage -- that's actually how you're supposed to be doing it anyway.
                  (when (integer? id-or-name)
                    (let [nominal-ref (keep-source+alias-props [:field desired-alias opts])]
                      (contains? used-fields nominal-ref)))
                  (contains? nfc-roots (field-id-props field))))
            (used?* [field]
              (u/prog1 (used? field)
                (if <>
                  (log/debugf "Keeping used field:\n%s" (u/pprint-to-str field))
                  (log/debugf "Removing unused field:\n%s" (u/pprint-to-str (keep-source+alias-props field))))))
            (remove-unused [fields]
              (filterv used?* fields))]
      (update source :fields remove-unused))))

(defn- nest-source [inner-query]
  (let [filter-clause (:filter inner-query)
        keep-filter? (nil? (lib.util.match/match-one filter-clause :expression))
        source (as-> (select-keys inner-query [:source-table :source-query :source-metadata :joins :expressions]) source
                 ;; preprocess this without a current user context so it's not subject to permissions checks. To get
                 ;; here in the first place we already had to do perms checks to make sure the query we're transforming
                 ;; is itself ok, so we don't need to run another check
                 (binding [api/*current-user-id* nil]
                   ((requiring-resolve 'metabase.query-processor.preprocess/preprocess)
                    {:database (u/the-id (lib.metadata/database (qp.store/metadata-provider)))
                     :type     :query
                     :query    source}))
                 (add/add-alias-info source)
                 (:query source)
                 (dissoc source :limit)
                 (qp.middleware.resolve-joins/append-join-fields-to-fields source (joined-fields inner-query))
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
        {::add/keys [desired-alias]} (lib.util.match/match-one source-query
                                       [:expression (_ :guard (partial = expression-name)) source-opts]
                                       source-opts)
        source-alias                 (or desired-alias expression-name)]
    [:field
     source-alias
     (-> opts
         (assoc :base-type          (or base-type :type/*)
                ::add/source-table  ::add/source
                ::add/source-alias  source-alias))]))

(defn- rewrite-fields-and-expressions [query]
  (lib.util.match/replace query
    ;; don't rewrite anything inside any source queries or source metadata.
    (_ :guard (constantly (some (partial contains? (set &parents))
                                [:source-query :source-metadata])))
    &match

    :expression
    (raise-source-query-expression-ref query &match)

    ;; mark all Fields at the new top level as `:qp/ignore-coercion` so QP implementations know not to apply coercion or
    ;; whatever to them a second time.
    [:field _id-or-name (_opts :guard (every-pred :temporal-unit (complement :qp/ignore-coercion)))]
    (recur (mbql.u/update-field-options &match assoc :qp/ignore-coercion true))

    [:field id-or-name (opts :guard :join-alias)]
    (let [{::add/keys [desired-alias]} (lib.util.match/match-one (:source-query query)
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

(defn- should-nest-expressions?
  "Whether we should nest the expressions in a inner query; true if

  1. there are some expression definitions in the inner query, AND

  2. there are some breakouts OR some aggregations in the inner query

  3. AND the breakouts/aggregations contain at least `:expression` reference."
  [{:keys [expressions], breakouts :breakout, aggregations :aggregation, :as _inner-query}]
  (and
   ;; 1. has some expression definitions
   (seq expressions)
   ;; 2. has some breakouts or aggregations
   (or (seq breakouts)
       (seq aggregations))
   ;; 3. contains an `:expression` ref
   (lib.util.match/match-one (concat breakouts aggregations)
                             :expression)))

(defn nest-expressions
  "Pushes the `:source-table`/`:source-query`, `:expressions`, and `:joins` in the top-level of the query into a
  `:source-query` and updates `:expression` references and `:field` clauses with `:join-alias`es accordingly. See
  tests for examples. This is used by the SQL QP to make sure expressions happen in a subselect."
  [inner-query]
  (let [{:keys [expressions], :as inner-query} (m/update-existing inner-query :source-query nest-expressions)]
    (if-not (should-nest-expressions? inner-query)
      inner-query
      (let [{:keys [source-query], :as inner-query} (nest-source inner-query)
            inner-query                                   (rewrite-fields-and-expressions inner-query)
            source-query                            (assoc source-query :expressions expressions)]
        (-> inner-query
            (dissoc :source-query :expressions)
            (assoc :source-query source-query)
            add/add-alias-info)))))
