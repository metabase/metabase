(ns metabase.query-processor.util.add-alias-info
  "Walks query and generates appropriate aliases for every selected column; and adds extra keys to the
  corresponding MBQL clauses with this information. Deduplicates aliases and calls [[metabase.driver/escape-alias]]
  with the generated aliases. Adds information about the aliases in source queries and joins that correspond to
  columns in the parent level.

  This code is currently opt-in, and is currently only used by SQL drivers ([[metabase.driver.sql.query-processor]]
  manually calls [[add-alias-info]] inside of [[metabase.driver.sql.query-processor/mbql->native]]
  and [[metabase.driver.mongo.query-processor/mbql->native]]) but at some point in the future this may
  become general QP middleware that can't be opted out of.

  [[add-alias-info]] adds some or all of the following keys to every `:field` clause, `:expression` reference, and
  `:aggregation` reference:

  ##### `::source-table`

  String name, integer Table ID, the keyword `::source`, or the keyword `::none`. Use this alias to qualify the clause
  during compilation.

  - String names are aliases for joins. This name should be used literally.

  - An integer Table ID means this comes from the `:source-table`; use the Table's schema and name to qualify the
    clause. (Some databases also need to qualify Fields with the Database name.)

  - `::source` means this clause comes from the `:source-query`; the alias to use is theoretically driver-specific but
    in practice is `source` (see [[metabase.driver.sql.query-processor/source-query-alias]]).

  - `::none` means this clause SHOULD NOT be qualified at all. `::none` is currently only used in some very special
     circumstances, specially by the Spark SQL driver when compiling Field Filter replacement snippets. But it's here
     for those sorts of cases where we need it.

  TODO -- consider allowing vectors of multiple qualifiers e.g. `[schema table]` or `[database schema table]` as well
  -- so drivers that need to modify these can rewrite this info appropriately.

  ##### `::source-alias`

  String name to use to refer to this clause during compilation.

  ##### `::desired-alias`

  If this clause is 'selected' (i.e., appears in `:fields`, `:aggregation`, or `:breakout`), select the clause `AS`
  this alias. This alias is guaranteed to be unique.

  ##### `::position`

  If this clause is 'selected', this is the position the clause will appear in the results (i.e. the corresponding
  column index)."
  (:require
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor.deprecated :as sql.qp.deprecated]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.malli :as mu]))

(defn- prefix-field-alias
  "Generate a field alias by applying `prefix` to `field-alias`. This is used for automatically-generated aliases for
  columns that are the result of joins."
  [prefix field-alias]
  (driver/escape-alias driver/*driver* (str prefix "__" field-alias)))

(defn- make-unique-alias-fn
  "Creates a function with the signature

    (unique-alias position original-alias)

  To return a uniquified version of `original-alias`. Memoized by `position`, so duplicate calls will result in the
  same unique alias."
  []
  (let [unique-name-fn (lib.util/unique-name-generator (qp.store/metadata-provider))]
    (fn unique-alias-fn [position original-alias]
      (assert (string? original-alias)
              (format "unique-alias-fn expected string, got: %s" (pr-str original-alias)))
      (unique-name-fn position (driver/escape-alias driver/*driver* original-alias)))))

;; TODO -- this should probably limit the resulting alias, and suffix a short hash as well if it gets too long. See also
;; [[unique-alias-fn]] below.

(defn- remove-namespaced-options [options]
  (when options
    (not-empty (into {}
                     (remove (fn [[k _]]
                               (when (keyword? k)
                                 (namespace k))))
                     options))))

(defn normalize-clause
  "Normalize a `:field`/`:expression`/`:aggregation` clause by removing extra info so it can serve as a key for
  `:qp/refs`. This removes `:source-field` if it is present -- don't use the output of this for anything but internal
  key/distinct comparison purposes."
  [clause]
  (lib.util.match/match-one clause
    ;; optimization: don't need to rewrite a `:field` clause without any options
    [:field _ nil]
    &match

    [:field id-or-name opts]
    ;; this doesn't use [[mbql.u/update-field-options]] because this gets called a lot and the overhead actually adds up
    ;; a bit
    [:field id-or-name (remove-namespaced-options (cond-> (dissoc opts :source-field :effective-type)
                                                    (integer? id-or-name) (dissoc :base-type)))]

    ;; for `:expression` and `:aggregation` references, remove the options map if they are empty.
    [:expression expression-name opts]
    (if-let [opts (remove-namespaced-options opts)]
      [:expression expression-name opts]
      [:expression expression-name])

    [:aggregation index opts]
    (if-let [opts (remove-namespaced-options opts)]
      [:aggregation index opts]
      [:aggregation index])

    _
    &match))

(defn- selected-clauses
  "Get all the clauses that are returned by this level of the query as a map of normalized-clause -> index of that
  column in the results."
  [{:keys [fields breakout aggregation], :as query}]
  ;; this is cached for the duration of the QP run because it's a little expensive to calculate and caching this speeds
  ;; up this namespace A LOT
  (qp.store/cached (select-keys query [:fields :breakout :aggregation])
    (into
     {}
     (comp cat
           (map-indexed
            (fn [i clause]
              [(normalize-clause clause) i])))
     [breakout
      (map-indexed
       (fn [i ag]
         (lib.util.match/replace ag
           ;; :offset is a special case since it doesn't NEED to get wrapped in aggregation options.
           [:offset _opts _expr _n]
           [:aggregation i]

           [:aggregation-options wrapped opts]
           [:aggregation i]

           ;; aggregation clause should be preprocessed into an `:aggregation-options` clause by now.
           _
           (throw (ex-info (tru "Expected :aggregation-options clause, got {0}" (pr-str ag))
                           {:type qp.error-type/qp, :clause ag}))))
       aggregation)
      fields])))

(defn- clause->position
  "Get the position (i.e., column index) `clause` is returned as, if it is returned (i.e. if it is in `:breakout`,
  `:aggregation`, or `:fields`). Not all clauses are returned."
  [inner-query clause]
  ((selected-clauses inner-query) (normalize-clause clause)))

(defn- this-level-join-aliases [{:keys [joins]}]
  (into #{} (map :alias) joins))

(defn- field-is-from-join-in-this-level? [inner-query [_field _id-or-name {:keys [join-alias]}]]
  (when join-alias
    ((this-level-join-aliases inner-query) join-alias)))

(mu/defn ^:private field-instance :- [:maybe ::lib.schema.metadata/column]
  [[_ id-or-name :as _field-clause] :- mbql.s/field]
  (when (integer? id-or-name)
    (lib.metadata/field (qp.store/metadata-provider) id-or-name)))

(defn- field-table-id [field-clause]
  (:table-id (field-instance field-clause)))

(mu/defn ^:private field-source-table-alias :- [:or
                                                ::lib.schema.common/non-blank-string
                                                ::lib.schema.id/table
                                                [:= ::source]]
  "Determine the appropriate `::source-table` alias for a `field-clause`."
  [{:keys [source-table source-query], :as inner-query} [_ _id-or-name {:keys [join-alias]}, :as field-clause]]
  (let [table-id            (field-table-id field-clause)
        join-is-this-level? (field-is-from-join-in-this-level? inner-query field-clause)]
    (cond
      join-is-this-level?                      join-alias
      (and table-id (= table-id source-table)) table-id
      source-query                             ::source
      :else
      (throw (ex-info (trs "Cannot determine the source table or query for Field clause {0}" (pr-str field-clause))
                      {:type   qp.error-type/invalid-query
                       :clause field-clause
                       :query  inner-query})))))

(defn- exports [query]
  (into #{} (lib.util.match/match (dissoc query :source-query :source-metadata :joins)
              [(_ :guard #{:field :expression :aggregation-options}) _ (_ :guard (every-pred map? ::position))])))

(defn- join-with-alias [{:keys [joins]} join-alias]
  (some (fn [join]
          (when (= (:alias join) join-alias)
            join))
        joins))

(defn- fuzzify [clause]
  (mbql.u/update-field-options clause dissoc :temporal-unit :binning))

(defn- field-signature
  [field-clause]
  [(second field-clause) (get-in field-clause [2 :join-alias])])

(defn- matching-field-in-source-query*
  [source-query source-metadata field-clause & {:keys [normalize-fn]
                                                :or   {normalize-fn normalize-clause}}]
  (let [normalized    (normalize-fn field-clause)
        all-exports   (exports source-query)
        field-exports (filter (partial mbql.u/is-clause? :field)
                              all-exports)]
    ;; first look for an EXACT match in the `exports`
    (or (m/find-first (fn [a-clause]
                        (= (normalize-fn a-clause) normalized))
                      field-exports)
        ;; if there is no EXACT match, attempt a 'fuzzy' match by disregarding the `:temporal-unit` and `:binning`
        (let [fuzzy-normalized (fuzzify normalized)]
          (m/find-first (fn [a-clause]
                          (= (fuzzify (normalize-fn a-clause)) fuzzy-normalized))
                        field-exports))
        ;; if still no match try looking based for a matching Field based on ID.
        (let [[_field id-or-name _opts] field-clause]
          (when (integer? id-or-name)
            (m/find-first (fn [[_field an-id-or-name _opts]]
                            (= an-id-or-name id-or-name))
                          field-exports)))
        ;; otherwise if this is a nominal field literal ref then look for matches based on the string name used
        (when-let [field-name (let [[_ id-or-name] field-clause]
                                (when (string? id-or-name)
                                  id-or-name))]
          (or ;; First, look for Expressions or fields from the source query stage whose `::desired-alias` matches the
              ;; name we're searching for.
              (m/find-first (fn [[tag _id-or-name {::keys [desired-alias], :as _opts} :as _ref]]
                              (when (#{:expression :field} tag)
                                (= desired-alias field-name)))
                            all-exports)
              ;; Expressions by exact name.
              (m/find-first (fn [[_ expression-name :as _expression-clause]]
                              (= expression-name field-name))
                            (filter (partial mbql.u/is-clause? :expression) all-exports))
              ;; aggregation clauses from the previous stage based on their `::desired-alias`. If THAT doesn't work,
              ;; then try to match based on their `::source-alias` (not 100% sure why we're checking `::source-alias` at
              ;; all TBH -- Cam)
              (when-let [ag-clauses (seq (filter (partial mbql.u/is-clause? :aggregation-options) all-exports))]
                (some (fn [k]
                        (m/find-first (fn [[_tag _ag-clause opts :as _aggregation-options-clause]]
                                        (= (get opts k) field-name))
                                      ag-clauses))
                      [::desired-alias ::source-alias]))
              ;; look for a field referenced by the name in source-metadata
              (when-let [column (m/find-first #(= (:name %) field-name) source-metadata)]
                (let [signature (field-signature (:field_ref column))]
                  (or ;; First try to match with the join alias.
                   (m/find-first #(= (field-signature %) signature) field-exports)
                   ;; Then just the names, but if the match is ambiguous, warn and return nil.
                   (let [matches (filter #(= (second %) field-name) field-exports)]
                     (when (= (count matches) 1)
                       (first matches)))))))))))

(defn- matching-field-in-join-at-this-level
  "If `field-clause` is the result of a join *at this level* with a `:source-query`, return the 'source' `:field` clause
  from that source query."
  [inner-query [_ _ {:keys [join-alias]} :as field-clause]]
  (when join-alias
    (let [{:keys [source-query source-metadata]} (join-with-alias inner-query join-alias)]
      (when source-query
        (matching-field-in-source-query*
         source-query
         source-metadata
         field-clause
         :normalize-fn #(mbql.u/update-field-options (normalize-clause %) dissoc :join-alias))))))

(defn- field-alias-in-join-at-this-level
  "If `field-clause` is the result of a join at this level, return the `::desired-alias` from that join (where the Field is
  introduced). This is the appropriate `::source-alias` for such a Field."
  [inner-query field-clause]
  (when-let [[_ _ {::keys [desired-alias]}] (matching-field-in-join-at-this-level inner-query field-clause)]
    desired-alias))

(defn- matching-field-in-source-query
  [{:keys [source-query source-metadata], :as inner-query} field-clause]
  (when (and source-query
             (= (field-source-table-alias inner-query field-clause) ::source))
    (matching-field-in-source-query* source-query source-metadata field-clause)))

(defn- field-alias-in-source-query
  [inner-query field-clause]
  (when-let [[_tag _id-or-name {::keys [desired-alias]}] (matching-field-in-source-query inner-query field-clause)]
    desired-alias))

(defmulti ^String field-reference
  "Generate a reference for the field instance `field-inst` appropriate for the driver `driver`.
  By default this is just the name of the field, but it can be more complicated, e.g., take
  parent fields into account.

  DEPRECATED: Implement [[field-reference-mlv2]] instead, which accepts a `kebab-case` Field metadata rather than
  `snake_case` metadata."
  {:added "0.46.0", :arglists '([driver field-inst]), :deprecated "0.48.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti ^String field-reference-mlv2
  "Generate a reference for the field instance `field-inst` appropriate for the driver `driver`.
  By default this is just the name of the field, but it can be more complicated, e.g., take
  parent fields into account."
  {:added "0.48.0", :arglists '([driver field-inst])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(mu/defmethod field-reference-mlv2 ::driver/driver
  [driver :- :keyword
   field  :- ::lib.schema.metadata/column]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (if (get-method field-reference driver)
    (do
      (sql.qp.deprecated/log-deprecation-warning
       driver
       `field-reference
       "0.48.0")
      (field-reference driver
                       #_{:clj-kondo/ignore [:deprecated-var]}
                       (qp.store/->legacy-metadata field)))
    (:name field)))

(defn- field-requires-original-field-name
  "JSON extraction fields need to be named with their outer `field-name`, not use any existing `::desired-alias`."
  [field-clause]
  (boolean (some-> field-clause field-instance :nfc-path)))

(defn- field-name
  "*Actual* name of a `:field` from the database or source query (for Field literals)."
  [_inner-query [_ id-or-name :as field-clause]]
  (or (some->> field-clause
               field-instance
               (field-reference-mlv2 driver/*driver*))
      (when (string? id-or-name)
        id-or-name)))

(defn- expensive-field-info
  "Calculate extra stuff about `field-clause` that's a little expensive to calculate. This is done once so we can pass
  it around instead of recalculating it a bunch of times."
  [inner-query field-clause]
  {:field-name              (field-name inner-query field-clause)
   :override-alias?         (field-requires-original-field-name field-clause)
   :join-is-this-level?     (field-is-from-join-in-this-level? inner-query field-clause)
   :alias-from-join         (field-alias-in-join-at-this-level inner-query field-clause)
   :alias-from-source-query (field-alias-in-source-query inner-query field-clause)})

(defn- field-source-alias
  "Determine the appropriate `::source-alias` for a `field-clause`."
  {:arglists '([inner-query field-clause expensive-field-info])}
  [{:keys [_source-table], :as _inner-query}
   [_ _id-or-name {:keys [join-alias]}, :as _field-clause]
   {:keys [field-name join-is-this-level? alias-from-join alias-from-source-query]}]
  (cond
    ;; TODO -- this just recalculates the info instead of actually finding the Field in the join and getting its desired
    ;; alias there... this seems like a clear bug since it doesn't go thru the uniquify logic. Something will
    ;; potentially break by doing this. I haven't been able to reproduce it yet however.
    ;;
    ;; This will only be triggered if the join somehow exposes duplicate columns or columns that have the same escaped
    ;; name after going thru [[driver/escape-alias]]. I think the only way this could happen is if we escape them
    ;; aggressively but the escape logic produces duplicate columns (i.e., there is overlap between the unique hashes we
    ;; suffix to escaped identifiers.)
    ;;
    ;; We'll have to look into this more in the future. For now, it seems to work for everything we try it with.
    (and join-is-this-level? alias-from-join)  alias-from-join
    alias-from-source-query                    alias-from-source-query
    (and join-alias (not join-is-this-level?)) (prefix-field-alias join-alias field-name)
    :else                                      field-name))

(defn- field-desired-alias
  "Determine the appropriate `::desired-alias` for a `field-clause`."
  {:arglists '([inner-query field-clause expensive-field-info])}
  [_inner-query
   [_ _id-or-name {:keys [join-alias], ::keys [desired-alias], explicit-name :name} :as _field-clause]
   {:keys [field-name alias-from-join alias-from-source-query override-alias?], :as _expensive-field-info}]
  (cond
    join-alias              (prefix-field-alias join-alias (or alias-from-join field-name))
    ;; JSON fields and similar have to be aliased by the outer field name.
    override-alias?         field-name
    explicit-name           explicit-name
    desired-alias           desired-alias
    alias-from-source-query alias-from-source-query
    :else                   field-name))

(defmulti ^:private clause-alias-info
  {:arglists '([inner-query unique-alias-fn clause])}
  (fn [_ _ [clause-type]]
    clause-type))

(defmethod clause-alias-info :field
  [inner-query unique-alias-fn field-clause]
  (let [expensive-info (expensive-field-info inner-query field-clause)]
    (merge {::source-table (field-source-table-alias inner-query field-clause)
            ::source-alias (field-source-alias inner-query field-clause expensive-info)}
           (when-let [position (clause->position inner-query field-clause)]
             {::desired-alias (unique-alias-fn position (field-desired-alias inner-query field-clause expensive-info))
              ::position      position}))))

(defmulti ^:private aggregation-name
  {:arglists '([mbql-clause])}
  (fn [x]
    (when (mbql.u/mbql-clause? x)
      (first x))))

;;; make sure we have an `:aggregation-options` or other fully-preprocessed aggregation clause (i.e., `:offset`) like we
;;; expect. This is mostly a precondition check since we should never be running this code on not-preprocessed queries,
;;; so it's not i18n'ed
(defmethod aggregation-name :default
  [ag-clause]
  (throw (ex-info (format "Expected :aggregation-options or other fully-preprocessed aggregation, got %s."
                          (pr-str ag-clause))
                  {:clause ag-clause})))

(mu/defmethod aggregation-name :aggregation-options :- :string
  [[_aggregation-options _wrapped-ag opts]]
  (:name opts))

(mu/defmethod aggregation-name :offset :- :string
  [[_offset opts _expr _n]]
  (:name opts))

(defmethod clause-alias-info :aggregation
  [{aggregations :aggregation, :as inner-query} unique-alias-fn [_ index _opts :as ag-ref-clause]]
  (let [position (clause->position inner-query ag-ref-clause)]
    ;; an aggregation is ALWAYS returned, so it HAS to have a `position`. If it does not, the aggregation reference
    ;; is busted.
    (when-not position
      (throw (ex-info (tru "Aggregation does not exist at index {0}" index)
                      {:type   qp.error-type/invalid-query
                       :clause ag-ref-clause
                       :query  inner-query})))
    (let [ag-name (aggregation-name (nth aggregations index))]
      {::desired-alias (unique-alias-fn position ag-name)
       ::position      position})))

(defmethod clause-alias-info :expression
  [inner-query unique-alias-fn [_ expression-name :as expression-ref-clause]]
  (when-let [position (clause->position inner-query expression-ref-clause)]
    {::desired-alias (unique-alias-fn position expression-name)
     ::position      position}))

(defn- add-info-to-aggregation-definition
  [inner-query unique-alias-fn ag-clause ag-index]
  (lib.util.match/replace ag-clause
    [:offset opts expr n]
    (let [position         (clause->position inner-query [:aggregation ag-index])
          original-ag-name (:name opts)
          unique-alias     (unique-alias-fn position original-ag-name)]
      [:offset (assoc opts
                      :name           unique-alias
                      ::source-alias  original-ag-name
                      ::position      position
                      ::desired-alias unique-alias)
       expr
       n])

    [:aggregation-options wrapped-ag-clause opts, :as _ag-clause]
    (let [position         (clause->position inner-query [:aggregation ag-index])
          original-ag-name (:name opts)
          unique-alias     (unique-alias-fn position original-ag-name)]
      [:aggregation-options wrapped-ag-clause (assoc opts
                                                     :name           unique-alias
                                                     ::source-alias  original-ag-name
                                                     ::position      position
                                                     ::desired-alias unique-alias)])))

(defn- add-info-to-aggregation-definitions [{aggregations :aggregation, :as inner-query} unique-alias-fn]
  (cond-> inner-query
    (seq aggregations)
    (update :aggregation (fn [aggregations]
                           (into
                            []
                            (map-indexed (fn [i aggregation]
                                           (add-info-to-aggregation-definition inner-query unique-alias-fn aggregation i)))
                            aggregations)))))

(defn- add-alias-info* [inner-query]
  (assert (not (:strategy inner-query)) "add-alias-info* should not be called on a join") ; not user-facing
  (let [unique-alias-fn (make-unique-alias-fn)]
    (-> (lib.util.match/replace inner-query
          ;; don't rewrite anything inside any source queries or source metadata.
          (_ :guard (constantly (some (partial contains? (set &parents))
                                      [:source-query :source-metadata])))
          &match

          #{:field :aggregation :expression}
          (mbql.u/update-field-options &match merge (clause-alias-info inner-query unique-alias-fn &match)))
        (add-info-to-aggregation-definitions unique-alias-fn))))

(defn add-alias-info
  "Add extra info to `:field` clauses, `:expression` references, and `:aggregation` references in `query`. `query` must
  be fully preprocessed.

  Adds some or all of the following keys:

  ### `::source-table`

  String name, integer Table ID, or the keyword `::source`. Use this alias to qualify the clause during compilation.
  String names are aliases for joins. `::source` means this clause comes from the `:source-query`; the alias to use is
  theoretically driver-specific but in practice is
  `source` (see [[metabase.driver.sql.query-processor/source-query-alias]]). An integer Table ID means this comes from
  the `:source-table` (either directly or indirectly via one or more `:source-query`s; use the Table's schema and name
  to qualify the clause.

  ### `::source-alias`

  String name to use to refer to this clause during compilation.

  ### `::desired-alias`

  If this clause is 'selected' (i.e., appears in `:fields`, `:aggregation`, or `:breakout`), select the clause `AS`
  this alias. This alias is guaranteed to be unique.

  ### `::position`

  If this clause is 'selected', this is the position the clause will appear in the results (i.e. the corresponding
  column index)."
  [query-or-inner-query]
  (walk/postwalk
   (fn [form]
     (if (and (map? form)
              ((some-fn :source-query :source-table) form)
              (not (:strategy form)))
       (vary-meta (add-alias-info* form) assoc ::transformed true)
       form))
   query-or-inner-query))
