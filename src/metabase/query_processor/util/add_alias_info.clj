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
   [metabase.util.malli.registry :as mr]
   [metabase.lib.equality :as lib.equality]))

(defmulti ^String field-reference-mlv2
  "Generate a reference for the field instance `field-inst` appropriate for the driver `driver`.
  By default this is just the name of the field, but it can be more complicated, e.g., take
  parent fields into account.

  DEPRECATED in 0.56.0, and no longer used."
  {:added "0.48.0", :deprecated "0.56.0, " :arglists '([driver field-inst])}
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

(defn- returned-columns [query path]
  (let [cache-key (into [::returned-columns] path)]
    (or (u/prog1 (get @(::cache query) cache-key)
          (if <>
            (println "<CACHE HIT>" (pr-str cache-key))
            (println "<CACHE MISS>" (pr-str cache-key))))
        #_((requiring-resolve 'metabase.test/set-ns-log-level!) 'metabase.lib.metadata.cache :debug)
        (u/prog1 (u/profile 'returned-columns (lib.walk/apply-f-for-stage-at-path lib/returned-columns (::original query) path))
          #_((requiring-resolve 'metabase.test/set-ns-log-level!) 'metabase.lib.metadata.cache :error)
          (swap! (::cache query) assoc cache-key <>)))))

(defn- visible-columns [query path opts]
  (let [cache-key (into [::visible-columns] [path opts])]
    (or (u/prog1 (get @(::cache query) cache-key)
          (if <>
            (println "<CACHE HIT>" (pr-str cache-key))
            (println "<CACHE MISS>" (pr-str cache-key))))
        (u/prog1 (u/profile 'visible-columns
                   (lib.walk/apply-f-for-stage-at-path
                    (fn [query stage-number]
                      (lib/visible-columns query stage-number (lib.util/query-stage query stage-number) opts))
                    query path))
          (swap! (::cache query) assoc cache-key <>)))))

(mu/defn- add-escaped-desired-aliases :- [:map
                                          [:lib/type keyword?]
                                          [::desired-alias->escaped ::desired-alias->escaped]]
  [query         :- ::lib.schema/query
   path          :- ::lib.walk/path
   stage-or-join :- [:map [:lib/type keyword?]]]
  (let [returned-columns (returned-columns query path)
        escape-fn        (escape-fn)
        escaped-aliases  (into {}
                               (comp
                                (map :lib/desired-column-alias)
                                (map (fn [k]
                                       [k (escape-fn k)])))
                               returned-columns)]
    (assoc stage-or-join ::desired-alias->escaped escaped-aliases)))

(mu/defn- update-opts :- ::lib.schema.mbql-clause/clause
  [[_tag :as clause] :- ::lib.schema.mbql-clause/clause
   resolved          :- ::resolved-column]
  (lib.options/update-options
   clause
   (mu/fn :- ::updated-opts
     [opts :- [:maybe :map]]
     (merge opts
            (u/select-non-nil-keys resolved [::position])
            {::source-alias  (::escaped-source-alias resolved)
             ::desired-alias (::escaped-desired-alias resolved)
             ::source-table  (case (:lib/source resolved)
                               :source/table-defaults        (:table-id resolved)
                               (:source/joins
                                :source/implicitly-joinable) (or (::escaped-join-alias resolved)
                                                                 (throw (ex-info "Resolved metadata is missing ::escaped-join-alias" {:ref clause, :resolved resolved})))
                               (:source/previous-stage
                                :source/card)                ::source
                               (:source/expressions
                                :source/aggregations
                                :source/native)              ::none)}))))

(declare update-refs)

(defn- escaped-source-alias [query stage-path source-column-alias]
  (or (when-let [previous-stage-path (lib.walk/previous-path stage-path)]
        (let [previous-stage (get-in query previous-stage-path)]
          (get-in previous-stage [::desired-alias->escaped source-column-alias])))
      source-column-alias
      "<COLUMN WAS INTRODUCED IN THIS STAGE>"))

(defn- escaped-desired-alias
  [query stage-path desired-column-alias]
  (or (when desired-column-alias
        (or (get-in query (into (vec stage-path) [::desired-alias->escaped desired-column-alias]))
            (throw (ex-info "Missing ::desired-alias->escaped"
                            {:path stage-path, :desired-alias desired-column-alias}))))
      "<COLUMN IS NOT RETURNED>"))

(defn- escaped-join-alias [query stage-path join-alias]
  (when join-alias
    (or (get-in query (into (vec stage-path) [::join-alias->escaped join-alias]))
        (throw (ex-info "Missing ::join-alias->escaped"
                        {:path stage-path, :join-alias join-alias})))))

(mu/defn- add-escaped-aliases :- ::resolved-column
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/path
   col        :- ::lib.schema.metadata/column]
  (assoc col
         ::escaped-source-alias  (escaped-source-alias  query stage-path ((some-fn :lib/source-column-alias :name) col))
         ::escaped-desired-alias (escaped-desired-alias query stage-path (:lib/desired-column-alias col))
         ::escaped-join-alias    (escaped-join-alias    query stage-path (lib/current-join-alias col))))

(mu/defn- update-field-ref :- :mbql.clause/field
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/path
   field-ref  :- :mbql.clause/field
   col        :- ::lib.schema.metadata/column]
  (update-opts field-ref (add-escaped-aliases query stage-path col)))

(mu/defn- update-expression-ref
  [query                                           :- ::lib.schema/query
   stage-path                                      :- ::lib.walk/path
   [_tag _opts expression-name :as expression-ref] :- :mbql.clause/expression]
  (let [find-col (fn [cols]
                   (m/find-first #(and (= (:lib/source %) :source/expressions)
                                       (= (:lib/expression-name %) expression-name))
                                 cols))
        col      (or (find-col (returned-columns query stage-path))
                     (let [opts         {:include-joined?                              false
                                         :include-expressions?                         true
                                         :include-implicitly-joinable?                 false
                                         :include-implicitly-joinable-for-source-card? false}
                           visible-cols (visible-columns query stage-path opts)]
                       (find-col visible-cols)))]
    (update-opts expression-ref (add-escaped-aliases query stage-path col))))

(mu/defn- update-aggregation-ref
  [query                        :- ::lib.schema/query
   path                         :- ::lib.walk/path
   [_tag opts uuid :as _ag-ref] :- :mbql.clause/aggregation]
  (when-let [ag-clause (or (m/find-first #(= (lib.options/uuid %) uuid)
                                         (:aggregation (get-in query path)))
                           (log/errorf "No aggregation matching %s" (pr-str uuid)))]
    (let [[_tag ag-opts] (update-refs query
                                      path
                                      (lib.options/update-options ag-clause assoc ::recursive-ag-clause-resolution? true))
          opts'          (merge
                          opts
                          (select-keys ag-opts [::desired-alias ::source-alias]))]
      [:aggregation opts' uuid])))

(mu/defn- update-ag-clause
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/path
   ag-clause  :- ::lib.schema.mbql-clause/clause]
  (let [[_tag opts]       ag-clause
        ag-cols           (filter #(= (:lib/source %) :source/aggregations)
                                  (returned-columns query stage-path))
        col               (->> (or (m/find-first #(= (:lib/source-uuid %) (:lib/uuid opts))
                                                 ag-cols)
                                   (throw (ex-info "aggregation definition was not resolved" {:aggregation ag-clause})))
                               (add-escaped-aliases query stage-path))
        [tag opts & args] (update-opts ag-clause col)]
    ;; recursively update args
    (into [tag opts]
          (map (fn [arg]
                 (update-refs query stage-path arg)))
          args)))

(mu/defn- resolve-returned-field :- ::lib.schema.metadata/column
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/path
   field-ref  :- :mbql.clause/field]
  (let [col           (lib.walk/apply-f-for-stage-at-path lib/metadata query stage-path field-ref)
        returned-cols (returned-columns query stage-path)]
    (lib.walk/apply-f-for-stage-at-path lib.equality/find-matching-column query stage-path col returned-cols)))

(mu/defn- resolve-visible-field :- ::lib.schema.metadata/column
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/path
   field-ref  :- :mbql.clause/field]
  (let [col          (lib.walk/apply-f-for-stage-at-path lib/metadata query stage-path field-ref)
        opts         {:include-joined?                              true
                      :include-expressions?                         false
                      :include-implicitly-joinable?                 false
                      :include-implicitly-joinable-for-source-card? false}
        visible-cols (visible-columns query stage-path opts)]
    (-> (or (lib.walk/apply-f-for-stage-at-path lib.equality/find-matching-column query stage-path col visible-cols)
            (lib.walk/apply-f-for-stage-at-path lib.equality/find-matching-column query stage-path col visible-cols {:generous? true})
            col
            (throw (ex-info "Failed to resolve ref in visible-cols"
                            {:path stage-path, :ref field-ref, :cols visible-cols})))
        (dissoc :lib/desired-column-alias))))

(mu/defn- update-refs
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   x]
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

    [:field (_opts :guard (complement ::source-alias)) _id-or-name]
    (let [resolved (try
                     (resolve-returned-field query path &match)
                     (catch Throwable _
                       (resolve-visible-field query path &match)))]
      (update-field-ref query path &match resolved))

    ;; [[lib.equality/find-matching-column]] gets confused when the expression name matches a field name -- work around
    ;; this (#59590)
    [:expression (_opts :guard (complement ::source-alias)) _expression-name]
    (update-expression-ref query path &match)

    [:aggregation (_opts :guard (complement ::source-alias)) _uuid]
    (update-aggregation-ref query path &match)

    (ag-clause :guard (fn [clause]
                        (and (vector? clause)
                             (keyword? (first clause))
                             (map? (second clause))
                             (or (::recursive-ag-clause-resolution? (second clause))
                                 (= (last &parents) :aggregation)))))
    (update-ag-clause query path &match)))

(mu/defn- add-alias-info-to-stage :- [:map
                                      [:lib/type ::lib.schema/stage.type]]
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/path
   stage      :- ::lib.schema/stage]
  (try
    (update-refs query stage-path stage)
    (catch Throwable e
      (throw (ex-info (format "Error adding alias info to stage: %s" (ex-message e))
                      {:stage-path stage-path, :stage stage}
                      e)))))

(mu/defn- add-alias-info-to-join :- ::lib.schema.join/join
  "Add alias info to refs in join `:conditions`. Join `:fields` do not need to be updated since they are only used to
  update parent stage `:fields` as appropriate (which will have already been done by now) and otherwise do not directly
  affect the resulting SQL (i.e., drivers should not be looking at them anyway)."
  [query     :- ::lib.schema/query
   join-path :- ::lib.walk/path
   join      :- ::lib.schema.join/join]
  (let [parent-stage-path         (-> (vec join-path) pop pop)
        join-last-stage-path      (into (vec join-path) [:stages (dec (count (:stages join)))])
        update-ref-from-this-join (fn [[_tag opts _id-or-name, :as field-ref]]
                                    (let [col              (resolve-returned-field
                                                            query join-last-stage-path
                                                            ;; join alias is for use outside the join, a column doesn't
                                                            ;; have the join alias INSIDE the join itself.
                                                            (lib/with-join-alias field-ref nil))
                                          last-stage-alias (or (:lib/desired-column-alias col)
                                                               (throw (ex-info "Expected col column to have :lib/desired-column-alias"
                                                                               {:path join-path
                                                                                :join join
                                                                                :ref  field-ref
                                                                                :col  col})))
                                          source-alias     (escaped-desired-alias query join-last-stage-path last-stage-alias)
                                          source-table     (escaped-join-alias query parent-stage-path (:join-alias opts))]
                                      ;; don't need to add `::desired-alias` because it may not be returned and even if
                                      ;; it is it's not getting returned in the join conditions
                                      (lib/update-options field-ref assoc
                                                          ::source-alias  source-alias
                                                          ::desired-alias "<IRRELEVANT>"
                                                          ::source-table  source-table)))
        update-other-ref          (fn [field-ref]
                                    (let [resolved (resolve-visible-field query parent-stage-path field-ref)]
                                      (update-field-ref query parent-stage-path field-ref resolved)))
        update-conditions         (fn [conditions]
                                    ;; the only kind of ref join conditions can have is a `:field` ref
                                    (lib.util.match/replace conditions
                                      ;; a field ref that comes from THIS join needs to get the desired alias returned
                                      ;; by the last stage of the join to use as its source alias
                                      [:field (_opts :guard #(= (:join-alias %) (:alias join))) _id-or-name]
                                      (update-ref-from-this-join &match)


                                      ;; a field ref that DOES NOT come from this join should get resolved relative to
                                      ;; the parent stage.
                                      [:field (_opts :guard #(not= (:join-alias %) (:alias join))) _id-or-name]
                                      (update-other-ref &match)))]
    (try
      (update join :conditions update-conditions)
      (catch Throwable e
        (throw (ex-info (format "Error adding alias info to join: %s" (ex-message e))
                        {:join-path join-path, :join join}
                        e))))))

;;; the query returned by this is not necessarily valid anymore; see comments below
(mu/defn- add-alias-info** :- ::lib.schema/query
  [query :- ::lib.schema/query]
  (as-> query query
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
    (lib.walk/walk query (fn [query path-type path join]
                           (when (= path-type :lib.walk/join)
                             (let [parent-stage-path (-> (vec path) pop pop)
                                   stage             (get-in query parent-stage-path)
                                   escaped-alias     (or (get-in stage [::join-alias->escaped (:alias join)])
                                                         (throw (ex-info "Missing ::join-alias->escaped"
                                                                         {:path parent-stage-path, :alias (:alias join)})))]
                               (assoc join
                                      ::original-alias (:alias join)
                                      ::add/alias      escaped-alias)))))))

(mr/def ::options
  [:map
   {:closed true}
   [:globally-unique-join-aliases? {:default false} :any]])

(mu/defn- escape-join-aliases :- ::lib.schema/query
  [query                                                                              :- ::lib.schema/query
   {:keys [globally-unique-join-aliases?], :or {globally-unique-join-aliases? false}} :- [:maybe ::options]]
  (u/profile 'escape-join-aliases
    (let [make-join-alias-unique-name-generator (if globally-unique-join-aliases?
                                                  (constantly (lib.util/unique-name-generator))
                                                  lib.util/unique-name-generator)]
      (lib.walk/walk-stages
       query
       (fn [_query _path stage]
         (if (empty? (:joins stage))
           stage
           (-> stage
               (update :joins (let [unique (comp (partial driver/escape-alias driver/*driver*)
                                                 (make-join-alias-unique-name-generator))]
                                (fn [joins]
                                  (mapv (mu/fn [join :- [:map
                                                         [:alias ::lib.schema.join/alias]]]
                                          (assoc join ::alias (unique (:alias join))))
                                        joins))))
               (as-> $stage (assoc $stage ::join-alias->escaped (into {} (map (juxt :alias ::alias)) (:joins $stage)))))))))))

(mu/defn- add-alias-info* :- ::lib.schema/query
  [query   :- ::lib.schema/query
   options :- [:maybe ::options]]
  (-> query
      (escape-join-aliases options)
      (assoc ::cache (atom {}), ::original query)
      add-alias-info**
      (dissoc ::cache ::original)))

(mu/defn add-alias-info :- :map
  "Add extra info to `:field` clauses, `:expression` references, and `:aggregation` references in `query`. `query` must
  be fully preprocessed.

  Works on MBQL 5 queries, MBQL 4 (legacy) outer queries, or MBQL 4 inner queries.

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
  ([query]
   (add-alias-info query nil))

  ([query   :- :map
    options :- [:maybe ::options]]
   (cond
     ;; MBQL 5 query
     (= (:lib/type query) :mbql/query)
     (add-alias-info* query options)

     ;; MBQL 4 outer query
     (:type query)
     (-> (lib/query (qp.store/metadata-provider) query)
         (add-alias-info* options)
         lib/->legacy-MBQL)

     ;; MBQL 4 inner query
     :else
     (-> query
         annotate.legacy-helper-fns/legacy-inner-query->mlv2-query
         (add-alias-info options)
         :query))))
