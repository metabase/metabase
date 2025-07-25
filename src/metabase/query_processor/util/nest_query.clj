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
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.middleware.annotate.legacy-helper-fns :as annotate.legacy-helper-fns]
   [metabase.query-processor.middleware.resolve-joins :as qp.middleware.resolve-joins]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- all-fields-for-table [table-id]
  (->> (lib.metadata/fields (qp.store/metadata-provider) table-id)
       ;; The remove line is taken from the add-implicit-clauses middleware. It shouldn't be necessary, because any
       ;; unused fields should be dropped from the inner query. It also shouldn't hurt anything, because the outer
       ;; query shouldn't use these fields in the first place.
       (remove #(#{:sensitive :retired} (:visibility-type %)))
       (map (fn [field]
              [:field (u/the-id field) nil]))))

(defn- add-all-fields
  "This adds all non-sensitive/retired fields (including fields with parent ids) to the passed-in query.

  The issue is that nest-query mostly relies on the preprocessor (specifically, the add-implicit-clauses middleware)
  to add all possible fields to the newly created inner query. However, add-implicit-fields ignores fields with a
  parent id. The main user of parent-id is mongo, and mongo doesn't use nest-query, so this usually isn't an
  issue. However, bigquery also uses parent-id, and bigquery is a sql driver that uses nest-query. As a result,
  without this function, nest-query wasn't adding bigquery struct member fields to the inner query, which caused sql
  errors. This function adds in any missing fields and fixes those errors."
  [{{source-table-id :source-table, :keys [fields]} :query, :as outer-query}]
  (if source-table-id
    (let [all-fields (all-fields-for-table source-table-id)
          existing-fields (into #{} (map second) fields)]
      (assoc-in outer-query [:query :fields]
                (into fields
                      (remove (comp existing-fields second))
                      all-fields)))
    outer-query))

(defn- joined-fields [inner-query]
  (m/distinct-by
   add/normalize-clause
   (lib.util.match/match (walk/prewalk (fn [x]
                                         (if (map? x)
                                           (dissoc x :source-query :source-metadata :temporal-unit)
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

(defn- ->nominal-ref
  "Transforms a ref into a simplified version of the form it would take as a nominal ref in a later stage.

  Nominal refs use the `desired-alias` as its `id-or-name`, and have `::add/source-table ::add/source` in the options.

  Other options (`:position`, `:join-alias`, other aliases) are dropped, since those are internal to the stage where the
  column joined the party, not to later stages.

  Refs which are either missing `::add/desired-alias`, or which are coming directly from a table or join, are skipped.
  We want to pick up the usages only, not anything from `:fields` lists."
  [[_tag _id-or-name {::add/keys [source-alias source-table]}]]
  (when (and source-alias
             (= source-table ::add/source))
    [:field source-alias {::add/source-table ::add/source}]))

(defn- remove-unused-fields [inner-query source]
  (let [usages         (lib.util.match/match inner-query #{:field :expression})
        used-fields    (into #{} (map keep-source+alias-props) usages)
        nominal-fields (into #{} (keep ->nominal-ref) usages)
        nfc-roots      (into #{} (keep nfc-root) used-fields)]
    (letfn [(used? [[_tag _id-or-name {::add/keys [source-table]}, :as field]]
              (or (contains? used-fields (keep-source+alias-props field))
                  ;; We should also consider a Field to be used if we're referring to it with a nominal field literal
                  ;; ref in the next stage -- that's actually how you're supposed to be doing it anyway.
                  (and (= source-table ::add/source)
                       (contains? nominal-fields (->nominal-ref field)))
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
        keep-filter? (and filter-clause
                          (nil? (lib.util.match/match-one filter-clause :expression)))
        source (as-> (select-keys inner-query [:source-table :source-query :source-metadata :joins :expressions]) source
                 ;; preprocess this in a superuser context so it's not subject to permissions checks. To get here in the
                 ;; first place we already had to do perms checks to make sure the query we're transforming is itself
                 ;; ok, so we don't need to run another check.
                 ;; (Not using mw.session/as-admin due to cyclic dependency.)
                 (binding [api/*is-superuser?* true]
                   ((requiring-resolve 'metabase.query-processor.preprocess/preprocess)
                    {:database (u/the-id (lib.metadata/database (qp.store/metadata-provider)))
                     :type     :query
                     :query    source}))
                 (add-all-fields source)
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

(mu/defn- infer-expression-type :- [:maybe ::lib.schema.common/base-type]
  [inner-query :- :map
   expression  :- [:maybe ::mbql.s/FieldOrExpressionDef]]
  (when expression
    (let [mlv2-query (annotate.legacy-helper-fns/legacy-inner-query->mlv2-query inner-query)]
      (lib/type-of mlv2-query (lib/->pMBQL expression)))))

(defn- raise-source-query-expression-ref
  "Convert an `:expression` reference from a source query into an appropriate `:field` clause for use in the surrounding
  query."
  [{:keys [source-query], :as query} [_ expression-name opts :as _clause]]
  (let [expression-definition        (mbql.u/expression-with-name query expression-name)
        base-type                    (infer-expression-type query expression-definition)
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

(defn- coerced-field?
  [field-id]
  (contains? (lib.metadata/field (qp.store/metadata-provider) field-id) :coercion-strategy))

(defn- coercible-field-ref?
  [form]
  (and (vector? form)
       (let [[tag id-or-name opts] form]
         (and (= tag :field)
              (not (:qp/ignore-coercion opts))
              (or (contains? opts :temporal-unit)
                  (and (int? id-or-name)
                       (coerced-field? id-or-name)))))))

(defn- rewrite-fields-and-expressions [query]
  (lib.util.match/replace query
    ;; don't rewrite anything inside any source queries or source metadata.
    (_ :guard (constantly (some (partial contains? (set &parents))
                                [:source-query :source-metadata])))
    &match

    :expression
    (raise-source-query-expression-ref query &match)

    ;; Mark all Fields at the new top level as `:qp/ignore-coercion` so QP implementations know not to apply coercion
    ;; or whatever to them a second time.
    ;; In fact, we don't mark all Fields, only the ones we deem coercible. Marking all would make a bunch of tests
    ;; fail, but it might still make sense. For example, #48721 would have been avoided by unconditional marking.
    (_ :guard coercible-field-ref?)
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

    ;; Some refs in the outer stage might be referring to these fields by `:name` (eg. ID) and not
    ;; properly by their `desired-alias`/this ref's `source-alias` (eg. "People - User__ID")
    ;; Since these refs are across stages, there's no need to adjust `:expression` refs.
    [:field (id-or-name :guard string?) (opts :guard ::add/source-alias)]
    [:field (::add/source-alias opts) opts]

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

  2. there are some breakouts OR aggregations OR order-by in the inner query

  3. AND the breakouts/aggregations/order-bys contain at least one `:expression` reference."
  [{:keys [expressions], breakouts :breakout, aggregations :aggregation, order-bys :order-by, :as _inner-query}]
  (and
   ;; 1. has some expression definitions
   (seq expressions)
   ;; 2. has some breakouts or aggregations or order-by
   (or (seq breakouts)
       (seq aggregations)
       (seq order-bys))
   ;; 3. contains an `:expression` ref
   (lib.util.match/match-one (concat breakouts aggregations order-bys)
     :expression)))

(mu/defn- nest-expressions* :- ::mbql.s/SourceQuery
  [inner-query :- ::mbql.s/SourceQuery]
  (let [{:keys [expressions]
         :as inner-query}                      (m/update-existing inner-query :source-query nest-expressions*)]
    (if-not (should-nest-expressions? inner-query)
      inner-query
      (let [{:keys [source-query], :as inner-query} (nest-source inner-query)
            inner-query                             (rewrite-fields-and-expressions inner-query)
            source-query                            (assoc source-query :expressions expressions)]
        (-> inner-query
            (dissoc :source-query :expressions :expression-idents)
            (assoc :source-query source-query))))))

(mu/defn nest-expressions :- ::mbql.s/SourceQuery
  "Pushes the `:source-table`/`:source-query`, `:expressions`, and `:joins` in the top-level of the query into a
  `:source-query` and updates `:expression` references and `:field` clauses with `:join-alias`es accordingly. See
  tests for examples. This is used by the SQL QP to make sure expressions happen in a subselect."
  [inner-query :- ::mbql.s/SourceQuery]
  (-> inner-query
      nest-expressions*
      add/add-alias-info))
