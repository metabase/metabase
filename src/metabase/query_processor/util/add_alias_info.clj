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
  (:refer-clojure :exclude [mapv ref select-keys some empty? not-empty get-in])
  (:require
   [medley.core :as m]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.annotate.legacy-helper-fns :as annotate.legacy-helper-fns]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [mapv select-keys some empty? not-empty get-in]]))

(mu/defn- ^:dynamic *escape-alias-fn* :- :string
  [driver :- :keyword
   s      :- :string]
  (driver/escape-alias driver s))

(defmulti ^String field-reference-mlv2
  "Generate a reference for the field instance `field-inst` appropriate for the driver `driver`.
  By default this is just the name of the field, but it can be more complicated, e.g., take
  parent fields into account.

  DEPRECATED in 0.56.0, and no longer used."
  {:added "0.48.0", :deprecated "0.57.0, " :arglists '([driver field-inst])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn- escape-fn []
  {:pre [(keyword? driver/*driver*)]}
  (let [f      (lib/unique-name-generator)
        driver driver/*driver*]
    (fn [s]
      (->> s
           f
           (*escape-alias-fn* driver)))))

(mr/def ::desired-alias->escaped
  [:map-of ::lib.schema.metadata/desired-column-alias ::lib.schema.metadata/desired-column-alias])

;;; we add `::original` to the query so we can consistently hit the cache for things like `returned-columns` regardless
;;; of the kooky extra info we add here... none of it should affect calculated metadata

(mu/defn- returned-columns :- :metabase.lib.metadata.calculation/returned-columns
  [query :- [:merge
             ::lib.schema/query
             [:map
              [::original ::lib.schema/query]]]
   path  :- ::lib.walk/path]
  (lib.walk/apply-f-for-stage-at-path lib/returned-columns (::original query) path))

(mu/defn- resolve-field-ref :- :metabase.lib.metadata.calculation/visible-column
  [query      :- [:merge
                  ::lib.schema/query
                  [:map
                   [::original ::lib.schema/query]]]
   stage-path :- ::lib.walk/path
   field-ref  :- :mbql.clause/field]
  (u/prog1 (lib.walk/apply-f-for-stage-at-path lib/metadata (::original query) stage-path field-ref)
    ;; sanity check
    (when (and (or config/is-dev? config/is-test?)
               (= (:lib/source <>) :source/table-defaults)
               (pos-int? (last stage-path)))
      (throw (ex-info "Column can only come from a source table in the first stage of a query"
                      {:query query, :stage-path stage-path, :col <>})))))

(mu/defn- add-escaped-desired-aliases :- [:or
                                          [:map
                                           [:lib/type [:= :mbql.stage/native]]]
                                          [:map
                                           [:lib/type [:= :mbql.stage/mbql]]
                                           [::desired-alias->escaped ::desired-alias->escaped]]]
  "Add a map if `::desired-alias->escaped` to each stage. This is consumed by subsequent passes and then discarded at
  the end."
  [query  :- ::lib.schema/query
   path   :- ::lib.walk/path
   stage  :- ::lib.schema/stage]
  ;; native stages should not escape/truncate any aliases, we need to use them as-is in the next stage of the
  ;; query; see [[metabase.query-processor.util.add-alias-info-test/respect-crazy-long-native-identifiers-test]].
  ;; If a native query returns a column name we can assume it's legal in the current DB.
  (case (:lib/type stage)
    :mbql.stage/native
    stage

    (:mbql.stage/mbql :mbql/join)
    (let [returned-columns (returned-columns query path)
          escaped-aliases  (into {}
                                 (comp
                                  (map :lib/desired-column-alias)
                                  (map (let [f (escape-fn)]
                                         (fn [k]
                                           [k (f k)]))))
                                 returned-columns)]
      (assoc stage ::desired-alias->escaped escaped-aliases))))

(defn- escaped-source-alias [query stage-path join-alias source-column-alias]
  (or (if join-alias
        (when-let [join (m/find-first #(= (:alias %) join-alias)
                                      (:joins (get-in query stage-path)))]
          (let [join-last-stage (last (:stages join))]
            (get-in join-last-stage [::desired-alias->escaped source-column-alias])))
        (when-let [previous-stage-path (lib.walk/previous-path stage-path)]
          (let [previous-stage (get-in query previous-stage-path)]
            (get-in previous-stage [::desired-alias->escaped source-column-alias]))))
      source-column-alias))

(defn- escaped-desired-alias
  "Return the escaped desired alias using the `::desired-alias->escaped` info added by [[add-escaped-desired-aliases]]
  earlier."
  [query stage-path desired-column-alias]
  (when desired-column-alias
    (case (:lib/type (get-in query stage-path))
      ;; for native stages just return desired-column-alias without escaping (see comment
      ;; in [[add-escaped-desired-aliases]] for more info)
      :mbql.stage/native
      desired-column-alias

      :mbql.stage/mbql
      (let [desired-alias->escaped (or (::desired-alias->escaped (get-in query stage-path))
                                       (throw (ex-info "Stage is missing ::desired-alias->escaped"
                                                       {:stage-path stage-path})))]
        (or (get desired-alias->escaped desired-column-alias)
            (throw (ex-info (format "Missing ::desired-alias->escaped for %s" (pr-str desired-column-alias))
                            {:path                   stage-path
                             :desired-alias          desired-column-alias
                             :desired-alias->escaped desired-alias->escaped})))))))

(defn- escaped-join-alias [query stage-path join-alias]
  (when join-alias
    (let [stage               (get-in query stage-path)
          _                   (when (empty? (:joins stage))
                                (throw (ex-info "Stage has no joins, are you sure this is the right path?"
                                                {:path stage-path, :join-alias join-alias})))
          join-alias->escaped (or (::join-alias->escaped stage)
                                  (throw (ex-info "Stage is missing ::join-alias->escaped"
                                                  {:path stage-path, :join-alias join-alias})))]
      (or (get join-alias->escaped join-alias)
          (throw (ex-info (format "Missing ::join-alias->escaped entry for %s" (pr-str join-alias))
                          {:path stage-path, :join-alias join-alias}))))))

(defn- source-table [query stage-path col]
  (case (:lib/source col)
    :source/table-defaults        (:table-id col)
    (:source/joins
     :source/implicitly-joinable) (let [join-alias (or (:metabase.lib.join/join-alias col)
                                                       (throw (ex-info (format "Column with source %s is missing join alias" (:lib/source col))
                                                                       {:col col})))]
                                    (or (escaped-join-alias query stage-path join-alias)
                                        (throw (ex-info (format "Resolved metadata is missing ::escaped-join-alias for %s" (pr-str (:metabase.lib.join/join-alias col)))
                                                        {:col col}))))
    (:source/previous-stage
     :source/card)                ::source
    (:source/expressions
     :source/aggregations
     :source/native)              ::none))

(defn- add-source-to-field-ref [query path field-ref col]
  (lib/update-options
   field-ref #(-> %
                  (assoc ::source-table (source-table query path col)
                         ::source-alias (escaped-source-alias query path (:metabase.lib.join/join-alias col) (:lib/source-column-alias col)))
                  (m/assoc-some ::nfc-path (not-empty (:nfc-path col))))))

(defn- fix-field-ref-if-it-should-actually-be-an-expression-ref
  "I feel evil about doing this, since generally this namespace otherwise just ADDs info and does not in any other way
  modify the query, but I can't think of any other way to get queries that accidentally use a `:field` ref for an
  `:expression` to work correctly."
  [field-ref col]
  (if (= (:lib/source col) :source/expressions)
    (into [:expression] (rest field-ref))
    field-ref))

(mu/defn- add-source-aliases :- ::lib.schema/stage.mbql
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage.mbql]
  (lib.util.match/replace stage
    ;; don't recurse into the metadata or joins -- [[lib.walk]] will take care of that recursion for us.
    (_ :guard (constantly (some (set &parents) [:lib/stage-metadata :joins])))
    &match

    :field
    (let [col (resolve-field-ref query path &match)]
      (-> (add-source-to-field-ref query path &match col)
          (fix-field-ref-if-it-should-actually-be-an-expression-ref col)
          ;; record the column we resolved it to, so we can use this when we add desired aliases in the next pass.
          (lib/update-options assoc ::resolved col)))

    :expression
    (lib/update-options &match assoc ::source-table ::none)

    :aggregation
    (lib/update-options &match assoc ::source-table ::none)))

(mu/defn- add-desired-aliases-to-aggregations :- ::lib.schema/stage.mbql
  "Update any aggregations FIRST so we can use their aliases when updating aggregation refs"
  [query            :- ::lib.schema/query
   path             :- ::lib.walk/path
   returned-columns :- :metabase.lib.metadata.calculation/returned-columns
   stage            :- ::lib.schema/stage.mbql]
  (letfn [(resolve-aggregation [[_tag opts, :as ag-clause]]
            (or (m/find-first #(and (= (:lib/source %) :source/aggregations)
                                    (= (:lib/source-uuid %) (:lib/uuid opts)))
                              returned-columns)
                (throw (ex-info "aggregation definition was not resolved"
                                {:aggregation ag-clause}))))
          (update-aggregation [ag-clause]
            (let [col           (resolve-aggregation ag-clause)
                  desired-alias (escaped-desired-alias query path (or (:lib/desired-column-alias col)
                                                                      (throw (ex-info "Resolved aggregation is missing :lib/desired-column-alias"
                                                                                      {:ag-clause ag-clause, :col col}))))]
              (lib/update-options ag-clause assoc
                                  ;; TODO (Cam 8/8/25) -- not really convinced it makes sense for an aggregation
                                  ;; definition to have a `::source-table` or `::source-alias` given that it comes from
                                  ;; the current stage, but I don't want to break something that might have been using
                                  ;; it for weird purposes, so I guess we can just keep including it.
                                  ::source-table  ::none
                                  ::source-alias  (:lib/desired-column-alias col)
                                  ::desired-alias desired-alias)))
          (update-aggregations [aggregations]
            (mapv update-aggregation aggregations))]
    (m/update-existing stage :aggregation update-aggregations)))

(mu/defn- add-desired-aliases-to-refs :- ::lib.schema/stage.mbql
  [query              :- ::lib.schema/query
   path               :- ::lib.walk/path
   by-id              :- [:map-of ::lib.schema.id/field [:sequential ::lib.schema.metadata/column]]
   by-source-alias    :- [:map-of :string [:sequential ::lib.schema.metadata/column]]
   by-expression-name :- [:map-of :string ::lib.schema.metadata/column]
   stage              :- ::lib.schema/stage.mbql]
  (lib.util.match/replace stage
    ;; don't recurse into the metadata or joins -- [[lib.walk]] will take care of that recursion for us.
    (_ :guard (constantly (some (set &parents) [:lib/stage-metadata :joins ::resolved])))
    &match

    [:field opts _id-or-name]
    (let [resolved (or (::resolved opts)
                       (throw (ex-info "Missing ::resolved -- should have been added by add-source-aliases"
                                       {:field-ref &match
                                        :path      (concat path &parents)})))
          ;; Sometimes these maps of returned columns by `:id` and `:lib/source-column-alias` are not enough to find a
          ;; match - but in that case no match can be found in the whole `returned-columns` either! So there's no need
          ;; to search it, since we won't find a match for our `::resolved` column.
          col      (or (when (:id resolved)
                         (m/find-first #(lib.equality/= % resolved) (get by-id (:id resolved))))
                       (m/find-first #(lib.equality/= % resolved)
                                     (get by-source-alias (:lib/source-column-alias resolved))))]
      (-> &match
          (lib/update-options (fn [opts]
                                (-> opts
                                    (assoc ::desired-alias (escaped-desired-alias query path (:lib/desired-column-alias col)))
                                    (dissoc ::resolved))))))

    [:expression _opts expression-name]
    (let [col (get by-expression-name expression-name)]
      (lib/update-options &match assoc ::desired-alias (escaped-desired-alias query path (:lib/desired-column-alias col))))

    [:aggregation _opts uuid]
    (let [aggregation (or (m/find-first #(= (lib.options/uuid %) uuid)
                                        (:aggregation stage))
                          (log/errorf "No aggregation matching %s" (pr-str uuid)))]
      (lib/update-options &match merge (select-keys (lib/options aggregation) [::source-table ::source-alias ::desired-alias])))))

(mu/defn- add-desired-aliases :- ::lib.schema/stage.mbql
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage.mbql]
  (let [returned-columns   (returned-columns query path)
        by-id              (u/group-by :id some? identity some? conj [] returned-columns)
        by-source-alias    (u/group-by :lib/source-column-alias some? identity some? conj [] returned-columns)
        by-expression-name (into {} (keep (fn [col]
                                            (when-let [expr-name (:lib/expression-name col)]
                                              [expr-name col])))
                                 returned-columns)]
    (->> stage
         (add-desired-aliases-to-aggregations query path returned-columns)
         (add-desired-aliases-to-refs query path by-id by-source-alias by-expression-name))))

(mu/defn- add-alias-info-to-stage :- ::lib.schema/stage
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/path
   stage      :- ::lib.schema/stage]
  (case (:lib/type stage)
    :mbql.stage/native
    stage

    :mbql.stage/mbql
    (try
      (->> stage
           (add-source-aliases query stage-path)
           (add-desired-aliases query stage-path))
      (catch Throwable e
        (throw (ex-info (format "Error adding alias info to stage: %s" (ex-message e))
                        {:stage-path stage-path, :stage stage}
                        e))))))

(defn- update-ref-from-this-join [query
                                  join-path
                                  join
                                  [_tag opts _id-or-name, :as field-ref]]
  (let [parent-stage-path     (lib.walk/join-parent-stage-path join-path)
        ;; the refs inside a join conditions should use the `:lib/desired-column-alias` from the columns returned by the
        ;; join's last stage. Thus the last stage of a join is effectively a 'previous stage' for purposes of field ref
        ;; resolution. Since there is no actual 'current stage' to use in this case, fake it by adding one more stage to
        ;; the join, which will let [[resolve-field-ref]] work as intended and resolve the ref relative to this extra
        ;; fake stage.
        query'                (-> query
                                  ;; update the cached `::original` query instead of query itself, since this is
                                  ;; what [[resolve-field-ref]] uses.
                                  (update-in (into [::original] join-path)
                                             (fn [join]
                                               (update join :stages (fn [stages]
                                                                      (conj (vec stages) {:lib/type :mbql.stage/mbql}))))))
        ;; e.g. if join has one stage, `join-last-stage-path` could be something like `[:stages 0 :joins 0 :stages 0]`
        ;; and `join-extra-stage-path` would be `[:stages 0 :joins 0 :stages 1]`
        join-last-stage-path  (lib.walk/join-last-stage-path join-path join)
        join-extra-stage-path (-> (vec join-last-stage-path)
                                  pop
                                  (conj (inc (last join-last-stage-path))))
        col                   (resolve-field-ref
                               query'
                               join-extra-stage-path
                               ;; join alias is for use outside the join, a column doesn't have the join alias INSIDE
                               ;; the join itself.
                               (lib/with-join-alias field-ref nil))
        last-stage-alias      (or (:lib/source-column-alias col)
                                  (throw (ex-info "Expected resolved column to have :lib/source-column-alias"
                                                  {:path join-path
                                                   :join join
                                                   :ref  field-ref
                                                   :col  col})))
        source-alias          (escaped-desired-alias query (lib.walk/join-last-stage-path join-path join) last-stage-alias)
        source-table          (escaped-join-alias query parent-stage-path (:join-alias opts))]
    ;; don't need to calculate `::desired-alias` because it may not be returned and even if it is it's not getting
    ;; returned in the join conditions
    (lib/update-options field-ref assoc
                        ::source-alias source-alias
                        ::source-table source-table)))

(mu/defn- add-alias-info-to-join-conditions :- ::lib.schema.join/join
  "Add alias info to refs in join `:conditions`. Join `:fields` do not need to be updated since they are only used to
  update parent stage `:fields` as appropriate (which will have already been done by now) and otherwise do not directly
  affect the resulting SQL (i.e., drivers should not be looking at them anyway)."
  [query     :- ::lib.schema/query
   join-path :- ::lib.walk/path
   join      :- ::lib.schema.join/join]
  (let [parent-stage-path (lib.walk/join-parent-stage-path join-path)
        update-other-ref  (fn [field-ref]
                            (let [col (resolve-field-ref query parent-stage-path field-ref)]
                              (add-source-to-field-ref query parent-stage-path field-ref col)))
        update-conditions (fn [conditions]
                            ;; the only kind of ref join conditions can have is a `:field` ref
                            (lib.util.match/replace conditions
                              ;; a field ref that comes from THIS join needs to get the desired alias returned
                              ;; by the last stage of the join to use as its source alias
                              [:field (_opts :guard #(= (:join-alias %) (:alias join))) _id-or-name]
                              (update-ref-from-this-join query join-path join &match)

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

(defn- add-escaped-alises-to-join [query path join]
  (let [parent-stage-path (-> (vec path) pop pop)
        escaped-alias     (escaped-join-alias query parent-stage-path (:alias join))]
    (assoc join
           ::original-alias (:alias join)
           ::alias         escaped-alias)))

;;; the query returned by this is not necessarily valid anymore; see comments below
(mu/defn- add-alias-info** :- ::lib.schema/query
  [query :- ::lib.schema/query]
  (as-> query query
    ;; next walk all stages and for all returned columns add a map of lib/desired-column-alias => escaped-desired-alias
    (lib.walk/walk-stages query add-escaped-desired-aliases)
    ;; then walk all the stages AND joins and update the refs
    (lib.walk/walk query (fn [query path-type path stage-or-join]
                           (case path-type
                             :lib.walk/stage
                             (add-alias-info-to-stage query path stage-or-join)

                             :lib.walk/join
                             (add-alias-info-to-join-conditions query path stage-or-join))))
    (lib.walk/walk query (fn [query path-type path join]
                           (when (= path-type :lib.walk/join)
                             (add-escaped-alises-to-join query path join))))))

(mr/def ::options
  [:map
   {:closed true}
   [:globally-unique-join-aliases? {:default false} :any]])

(mu/defn- escape-join-aliases :- ::lib.schema/query
  [query                                                                              :- ::lib.schema/query
   {:keys [globally-unique-join-aliases?], :or {globally-unique-join-aliases? false}} :- [:maybe ::options]]
  (let [make-join-alias-unique-name-generator (if globally-unique-join-aliases?
                                                (constantly (lib/unique-name-generator))
                                                lib/unique-name-generator)]
    (lib.walk/walk-stages
     query
     (fn [_query _path stage]
       (if (empty? (:joins stage))
         stage
         (-> stage
             (update :joins (let [unique (comp (partial *escape-alias-fn* driver/*driver*)
                                               (make-join-alias-unique-name-generator))]
                              (fn [joins]
                                (mapv (mu/fn [join :- [:map
                                                       [:alias ::lib.schema.join/alias]]]
                                        (assoc join ::alias (unique (:alias join))))
                                      joins))))
             (as-> $stage (assoc $stage ::join-alias->escaped (into {} (map (juxt :alias ::alias)) (:joins $stage))))))))))

(defn- clean-up-our-mess
  "Walk the query and remove the extra keys we added to stages and joins."
  [query]
  (lib.walk/walk
   query
   (fn [_query _path-type _path stage-or-join]
     (dissoc stage-or-join ::join-alias->escaped ::desired-alias->escaped))))

(mu/defn- add-alias-info* :- ::lib.schema/query
  [query   :- ::lib.schema/query
   options :- [:maybe ::options]]
  (try
    (-> query
        (escape-join-aliases options)
        (assoc ::original query)
        add-alias-info**
        clean-up-our-mess
        (dissoc ::original))
    (catch Throwable e
      (throw (ex-info (format "Error adding alias info to query: %s" (ex-message e))
                      {:query query, :options options}
                      e)))))

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

  ### `::nfc-path`

  If this is a nested column, the path to the column, e.g. for `grandparent.parent.child` this will be `[\"grandparent\"
  \"child\"]."
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

     ;; MBQL 4 inner MBQL query
     ((some-fn :source-table :source-query) query)
     (-> query
         #_{:clj-kondo/ignore [:deprecated-var]}
         annotate.legacy-helper-fns/legacy-inner-query->mlv2-query
         (add-alias-info options)
         lib/->legacy-MBQL
         :query)

     :else
     (throw (ex-info "Don't know what type of query this is, cannot add-alias-info!"
                     {:query query, :type qp.error-type/qp})))))
