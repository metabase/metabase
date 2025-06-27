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
  this alias. This alias is guaranteed to be unique."
  (:refer-clojure :exclude [ref])
  (:require
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.middleware.annotate.legacy-helper-fns :as annotate.legacy-helper-fns]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defmulti ^String field-reference-mlv2
  "Generate a reference for the field instance `field-inst` appropriate for the driver `driver`.
  By default this is just the name of the field, but it can be more complicated, e.g., take
  parent fields into account.

  DEPRECATED in 0.56.0, and no longer used."
  {:added "0.48.0", :deprecated "0.56.0, ":arglists '([driver field-inst])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(mr/def ::updated-opts
  "Schema for an updated options map that includes the keys added by this namespace."
  [:map
   [::source-alias  ::lib.schema.metadata/source-column-alias]
   [::desired-alias ::lib.schema.metadata/desired-column-alias]
   [::source-table  [:or
                     [:enum ::source ::none]
                     ::lib.schema.join/alias
                     ::lib.schema.id/table]]
   ;; only for 'returned' columns.
   [::position {:optional true} [:int {:min 0}]]])

(defn- escape-fn []
  {:pre [(keyword? driver/*driver*)]}

  (let [f      (lib.util/unique-name-generator)
        driver driver/*driver*]
    (fn [s]
      (->> s
           f
           (driver/escape-alias driver)))))

(mr/def ::desired-alias->escaped
  [:map-of ::lib.schema.metadata/desired-column-alias ::lib.schema.metadata/desired-column-alias])

(mr/def ::resolved-column
  [:merge
   ::lib.schema.metadata/column
   [:map
    [::escaped-source-alias  ::lib.schema.metadata/source-column-alias]
    [::escaped-desired-alias ::lib.schema.metadata/desired-column-alias]
    [::escaped-join-alias    [:maybe ::lib.schema.join/alias]]]])

(mu/defn- add-escaped-join-aliases :- ::lib.schema/stage
  [stage :- ::lib.schema/stage]
  (letfn [(add-escaped-alias [escape join]
            (assoc join ::escaped-alias (escape (:alias join))))
          (add-escaped-aliases [joins]
            (let [escape (escape-fn)]
              (mapv #(add-escaped-alias escape %) joins)))]
    (cond-> stage
      (seq (:joins stage)) (update :joins add-escaped-aliases))))

(mu/defn- add-escaped-desired-aliases :- [:map
                                          [:lib/type keyword?]
                                          [::desired-alias->escaped ::desired-alias->escaped]]
  [query         :- ::lib.schema/query
   path          :- ::lib.walk/path
   stage-or-join :- [:map [:lib/type keyword?]]]
  (let [returned-columns (lib.walk/apply-f-for-stage-at-path lib/returned-columns query path)
        escape-fn        (escape-fn)
        escaped-aliases  (into {}
                               (comp
                                (map :lib/desired-column-alias)
                                (map (fn [k]
                                       [k (escape-fn k)])))
                               returned-columns)]
    (assoc stage-or-join ::desired-alias->escaped escaped-aliases)))

(mu/defn- update-opts :- ::lib.schema.mbql-clause/clause
  [[tag :as clause] :- ::lib.schema.mbql-clause/clause
   resolved         :- ::resolved-column]
  (lib.options/update-options
   clause
   (mu/fn :- ::updated-opts
     [opts :- [:maybe :map]]
     (merge opts
            (u/select-non-nil-keys resolved [::position])
            {::source-alias      ((some-fn ::escaped-source-alias :lib/source-column-alias) resolved)
             ::desired-alias     ((some-fn ::escaped-desired-alias :lib/desired-column-alias) resolved)}
            (if-let [join-alias (:join-alias opts)]
              (if-let [escaped-alias (::escaped-join-alias resolved)]
                {::source-table escaped-alias}
                {::source-table join-alias})
              ;; something not from a join
              (when resolved
                {::source-table (or (when (::first-stage? resolved)
                                      (:table-id resolved))
                                    (when (= tag :field)
                                      ::source)
                                    ::none)}))))))

;;; TODO (Cam 6/27/25) -- might not need this anymore
(defn- cheese-match [a-ref cols]
  (letfn [(same-col? [col]
            (and (= (lib/current-join-alias col) (lib/current-join-alias a-ref))
                 (= (lib/temporal-bucket col) (lib/temporal-bucket a-ref))
                 (= (lib/binning col) (lib/binning a-ref))))]
    (lib.util.match/match-one a-ref
      [:field opts (id :guard pos-int?)]
      (m/find-first (fn [col]
                      (and (= (:id col) id)
                           (same-col? col)))
                    cols)
      [:field opts (col-name :guard string?)]
      (m/find-first (fn [col]
                      (and (= ((some-fn :lib/source-column-alias :lib/original-name :name) col) col-name)
                           (same-col? col)))
                    cols))))

(defn- find-matching-column [a-ref cols]
  (letfn [(find-col [a-ref cols]
            (or (lib.equality/find-matching-column a-ref cols)
                ;; NOCOMMIT
                (cheese-match a-ref cols)))]
    (or (m/find-first #(= (:lib/source-uuid %) (lib.options/uuid a-ref))
                      cols)
        ;; first try all the RETURNED columns
        (find-col a-ref (filter ::position cols))
        ;; if that fails try the VISIBLE columns
        (find-col a-ref (remove ::position cols)))))

(defn- fixed-field-ref [stage-or-join [_field opts id-or-name :as field-ref]]
  (when (= (:lib/type stage-or-join) :mbql.stage/mbql)
    (when-let [join-alias (:join-alias opts)]
      (when-not (some #(= (lib/current-join-alias %) join-alias)
                      (:joins stage-or-join))
        (log/warnf "Ref %s has :join-alias %s, but there is no join with that name at this stage of the query."
                   (pr-str field-ref)
                   (pr-str join-alias))
        (let [field-name (lib.join.util/joined-field-desired-alias
                          join-alias
                          (if (string? id-or-name)
                            id-or-name
                            (or ((some-fn :lib/original-name :name)
                                 (lib.metadata/field (qp.store/metadata-provider) id-or-name))
                                (throw (ex-info (format "Failed to resolve Field %d" id-or-name)
                                                {:ref field-ref})))))]
          (log/warnf "Trying field name = %s" (pr-str field-name))
          [:field
           (-> opts
               (dissoc :join-alias)
               (assoc :base-type (:base-type opts :type/*)))
           field-name])))))

(mu/defn- update-refs
  [x
   potential-cols :- [:sequential ::resolved-column]]
  (lib.util.match/replace x
    ;; don't recurse into the metadata keys, or into the stages of a join or joins of a stage -- [[lib.walk]] will take
    ;; care of that recursion for us.
    (_ :guard (fn [_]
                (some (set &parents)
                      [:source-metadata
                       :lib/stage-metadata
                       :joins
                       :stages])))
    &match

    [:field (opts :guard (complement ::source-alias)) id-or-name]
    (let [[resolved-ref resolved] (or (some (fn [field-ref]
                                              (when field-ref
                                                (when-let [resolved (find-matching-column field-ref potential-cols)]
                                                  [field-ref resolved])))
                                            (let [fixed-ref (fixed-field-ref x &match)]
                                              [fixed-ref
                                               &match
                                               (when fixed-ref
                                                 (when (lib/current-join-alias fixed-ref)
                                                   (find-matching-column (lib/with-join-alias fixed-ref nil) potential-cols)))
                                               (when (lib/current-join-alias &match)
                                                 (find-matching-column (lib/with-join-alias &match nil) potential-cols))]))
                                      (throw (ex-info ":field ref was not resolved" {:ref &match, :cols potential-cols})))]
      (update-opts resolved-ref resolved))

    ;; [[lib.equality/find-matching-column]] gets confused when the expression name matches a field name -- work around
    ;; this (#59590)
    [:expression (opts :guard (complement ::source-alias)) expression-name]
    (let [expression-cols (filter #(= (:lib/source %) :source/expressions)
                                  potential-cols)
          resolved        (or (m/find-first #(= (:lib/expression-name %) expression-name)
                                            expression-cols)
                              (find-matching-column &match expression-cols)
                              (throw (ex-info ":expression ref was not resolved"
                                              {:ref &match, :cols expression-cols})))]

      (update-opts &match resolved))

    ;; TODO
    [:aggregation opts uuid]
    (let [ag-clause      (or (m/find-first #(= (lib.options/uuid %) uuid)
                                           (:aggregation x))
                             (log/errorf "No aggregation matching %s" (pr-str uuid)))
          [_tag ag-opts] (update-refs (lib.options/update-options ag-clause assoc ::recursive-ag-clause-resolution? true)
                                      potential-cols)
          opts'          (merge
                          opts
                          (select-keys ag-opts [::desired-alias ::source-alias]))]
      [:aggregation opts' uuid])

    (ag-clause :guard (fn [clause]
                        (and (vector? clause)
                             (keyword? (first clause))
                             (map? (second clause))
                             (or (::recursive-ag-clause-resolution? (second clause))
                                 (= (last &parents) :aggregation)))))
    (let [[_tag opts]       ag-clause
          ag-cols           (filter #(= (:lib/source %) :source/aggregations)
                                    potential-cols)
          resolved          (or (m/find-first #(= (:lib/source-uuid %) (:lib/uuid opts))
                                              ag-cols)
                                (throw (ex-info "aggregation definition was not resolved"
                                                {:aggregation ag-clause, :cols potential-cols})))
          [tag opts & args] (update-opts &match resolved)]
      ;; recursively update args
      (into [tag opts]
            (map (fn [arg]
                   (update-refs arg potential-cols)))
            args))))

(mu/defn- potential-cols :- [:sequential ::resolved-column]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   x]
  (letfn [(f [query stage-number]
            (let [cols (concat
                        (map-indexed (fn [i col]
                                       (assoc col ::position i))
                                     (lib/returned-columns query stage-number x))
                        (lib/visible-columns query stage-number x
                                             ;; implicit joins should be resolved by now.
                                             {:include-implicitly-joinable? false}))
                  previous-stage (lib/previous-stage query stage-number)
                  stage          (lib/query-stage query stage-number)]
              (map (fn [col]
                     (let [join-alias            (lib/current-join-alias col)
                           join                  (when join-alias
                                                   (or (m/find-first #(= (:alias %) join-alias)
                                                                     (:joins stage))
                                                       (log/warnf "Failed to resolve join %s in stage\n%s"
                                                                  (pr-str join-alias)
                                                                  (u/pprint-to-str stage))))
                           escaped-source-alias  (if join-alias
                                                   (get-in join [::desired-alias->escaped (:lib/source-column-alias col)])
                                                   (get-in previous-stage [::desired-alias->escaped (:lib/source-column-alias col)]))
                           escaped-desired-alias (get-in stage [::desired-alias->escaped (:lib/desired-column-alias col)])
                           escaped-join-alias    (::escaped-alias join)]
                       (assoc col
                              ::first-stage?          (zero? stage-number)
                              ::escaped-source-alias  (or escaped-source-alias (:lib/source-column-alias col))
                              ::escaped-desired-alias (or escaped-desired-alias (:lib/desired-column-alias col))
                              ::escaped-join-alias    escaped-join-alias)))
                   cols)))]
    (lib.walk/apply-f-for-stage-at-path f query path)))

(mu/defn- add-alias-info-to-stage :- [:map
                                      [:lib/type ::lib.schema/stage.type]]
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/path
   stage      :- ::lib.schema/stage]
  (try
    (let [potential-cols (potential-cols query stage-path stage)]
      (update-refs stage potential-cols))
    (catch Throwable e
      (throw (ex-info (format "Error adding alias info to stage: %s" (ex-message e))
                      {:stage-path stage-path, :stage stage}
                      e)))))

(mu/defn- add-alias-info-to-join :- ::lib.schema.join/join
  [query     :- ::lib.schema/query
   join-path :- ::lib.walk/path
   join      :- ::lib.schema.join/join]
  (try
    (let [stage-path   (drop-last 2 join-path)
          potential-cols (potential-cols query stage-path join)]
      (-> join
          (update-refs potential-cols)))
    (catch Throwable e
      (throw (ex-info (format "Error adding alias info to join: %s" (ex-message e))
                      {:join-path join-path, :join join}
                      e)))))

;;; the query returned by this is not necessarily valid anymore; see comments below
(mu/defn- add-alias-info* :- [:map
                              [:lib/type [:= :mbql/query]]]
  [query :- ::lib.schema/query]
  (as-> query query
    ;; first walk all the stages and add escaped join aliases to each join.
    (lib.walk/walk-stages query (fn [_query _path stage]
                                  (add-escaped-join-aliases stage)))
    ;; next walk all stages and JOINs and for all returned columns add a map of lib/desired-column-alias =>
    ;; escaped-desired-alias
    (lib.walk/walk query (fn [query _path-type path stage-or-join]
                           (add-escaped-desired-aliases query path stage-or-join)))
    ;; then walk all the stages AND joins and update the refs
    (lib.walk/walk query (fn [query path-type path stage-or-join]
                           (case path-type
                             :lib.walk/stage
                             (add-alias-info-to-stage query path stage-or-join)

                             :lib.walk/join
                             (add-alias-info-to-join query path stage-or-join))))
    ;; at this point the query becomes invalid since the field refs now have the wrong join aliases. Ok since we're
    ;; immediately converting back to legacy anyway.
    ;;
    ;; TODO (Cam 6/16/25) -- maybe we should just change the key to something like `::add/alias` here and update drivers
    ;; to use that instead.
    (mu/disable-enforcement
      (lib.walk/walk query (fn [_query path-type _path join]
                             (when (= path-type :lib.walk/join)
                               (assoc join
                                      ::original-alias (:alias join)
                                      :alias           (::escaped-alias join))))))))

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
  this alias. This alias is guaranteed to be unique."
  [query-or-inner-query]
  (if (:type query-or-inner-query)
    ;; outer query
    (->> query-or-inner-query
         (lib/query (qp.store/metadata-provider))
         add-alias-info*
         lib/->legacy-MBQL)
    ;; inner query
    (-> query-or-inner-query
        annotate.legacy-helper-fns/legacy-inner-query->mlv2-query
        add-alias-info*
        lib/->legacy-MBQL
        :query)))
