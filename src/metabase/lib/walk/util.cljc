(ns metabase.lib.walk.util
  "Utility functions built on top of [[metabase.lib.walk]]."
  (:refer-clojure :exclude [not-empty])
  (:require
   [clojure.set :as set]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [not-empty]]))

(defn- transduce-stages
  ([rf query]
   (transduce-stages rf (rf) query))

  ([rf init query]
   (let [acc (volatile! init)]
     (lib.walk/walk-stages
      query
      (fn [_query _path stage]
        (vswap! acc rf stage)
        nil))
     (rf @acc)))

  ([xform rf init query]
   (transduce-stages (xform rf) init query)))

(defn- stage-values-set [query xform]
  (not-empty
   (transduce-stages
    xform
    (completing conj! persistent!)
    (transient #{})
    query)))

(mu/defn all-source-table-ids :- [:maybe [:set {:min 1} ::lib.schema.id/table]]
  "Return a set of all `:source-table` Table IDs referenced anywhere in the query."
  [query :- ::lib.schema/query]
  (stage-values-set query (keep :source-table)))

(mu/defn all-template-tags-map :- [:maybe ::lib.schema.template-tag/template-tag-map]
  "Return a combined template tags map for all native stages of a `query`."
  [query :- ::lib.schema/query]
  (transduce-stages
   (comp (filter (fn [stage]
                   (= (:lib/type stage) :mbql.stage/native)))
         (mapcat :template-tags))
   (fn rf
     ([m]
      (not-empty (persistent! m)))
     ([m [template-tag-name template-tag]]
      (assoc! m template-tag-name template-tag)))
   (transient {})
   query))

(mu/defn all-template-tags :- [:maybe [:set {:min 1} ::lib.schema.template-tag/template-tag]]
  "Return a set of all template tags in native stages of a `query`."
  [query :- ::lib.schema/query]
  (not-empty
   (into #{}
         (map (fn [[template-tag-name template-tag]]
                (assoc template-tag :lib.walk/template-tag-name template-tag-name)))
         (all-template-tags-map query))))

(defn- all-metric-ids [query]
  (let [metric-ids (volatile! (transient #{}))]
    (lib.walk/walk-clauses
     query
     (fn [_query _path-type _stage-or-join-path clause]
       (lib.util.match/match-lite clause
         [:metric _opts (id :guard pos-int?)]
         (vswap! metric-ids conj! id)

         _ nil)
       nil))
    (not-empty (persistent! @metric-ids))))

(mu/defn all-segment-ids :- [:maybe [:set {:min 1} ::lib.schema.id/segment]]
  "Return a set of all segment IDs anywhere in the query."
  [query]
  (let [segment-ids (volatile! (transient #{}))]
    (lib.walk/walk-clauses
     query
     (fn [_query _path-type _stage-or-join-path clause]
       (lib.util.match/match-lite clause
         [:segment _opts (id :guard pos-int?)]
         (vswap! segment-ids conj! id)

         _ nil)
       nil))
    (not-empty (persistent! @segment-ids))))

(mu/defn all-measure-ids :- [:maybe [:set {:min 1} ::lib.schema.id/measure]]
  "Return a set of all measure IDs anywhere in the query."
  [query]
  (let [measure-ids (volatile! (transient #{}))]
    (lib.walk/walk-clauses
     query
     (fn [_query _path-type _stage-or-join-path clause]
       (lib.util.match/match-lite clause
         [:measure _opts (id :guard pos-int?)]
         (vswap! measure-ids conj! id)

         _ nil)
       nil))
    (not-empty (persistent! @measure-ids))))

(defn- all-template-tag-card-ids [query]
  (not-empty
   (into #{}
         (keep :card-id)
         (all-template-tags query))))

(mu/defn all-source-card-ids :- [:maybe [:set {:min 1} ::lib.schema.id/card]]
  "Return a set of all `:source-card` Card IDs anywhere in the query, as well as all `:card-id`s in template tags and
  in `:metric` references."
  [query :- ::lib.schema/query]
  (not-empty
   (set/union
    (stage-values-set query (keep :source-card))
    (all-metric-ids query)
    (all-template-tag-card-ids query))))

(mu/defn any-native-stage?
  "Returns true if any stage of this query is native."
  [query :- ::lib.schema/query]
  (let [has-native-stage? (volatile! false)]
    (lib.walk/walk-stages
     query
     (fn [_query _path stage]
       (when (and (not @has-native-stage?)
                  (= (:lib/type stage) :mbql.stage/native))
         (vreset! has-native-stage? true))
       nil))
    @has-native-stage?))

(mu/defn any-native-stage-not-introduced-by-sandbox?
  "Sandboxing can introduce native stages to a query, because, for example, a table can be replaced with a Question that
  is based on a native query.

  Sometimes we need to check whether the query has a native stage that was introduced at the 'user level' (this could
  be the user's question itself, or one of the sources of their question, e.g. if the user makes Card A -> Card B ->
  Card C where Card C is a native question), rather than a native stage that was introduced by a sandbox (e.g. Card A
  -> Table B, which is swapped by a sandbox for Card C where Card C is a native question)."
  [query :- ::lib.schema/query]
  (let [has-native-stage? (volatile! false)]
    (lib.walk/walk-stages
     query
     (fn [_query _path stage]
       (when (and (not @has-native-stage?)
                  (not (:query-permissions/sandboxed-table stage))
                  (= (:lib/type stage) :mbql.stage/native))
         (vreset! has-native-stage? true))
       nil))
    @has-native-stage?))

(mu/defn all-field-ids :- [:set ::lib.schema.id/field]
  "Set of all Field IDs referenced in `:field` refs in a query or MBQL clause."
  [query-or-clause :- [:or
                       ::lib.schema/query
                       ::lib.schema.mbql-clause/clause]]
  (let [field-ids (volatile! (transient #{}))
        walk-clause (fn [clause]
                      (lib.util.match/match-lite clause
                        [:field _opts (id :guard pos-int?)]
                        (vswap! field-ids conj! id)

                        _ nil)
                      nil)]
    (if (map? query-or-clause)
      (lib.walk/walk-clauses query-or-clause (fn [_query _path-type _stage-or-join-path clause]
                                               (walk-clause clause)))
      (lib.walk/walk-clause query-or-clause walk-clause))
    (persistent! @field-ids)))

(mu/defn all-implicitly-joined-field-ids :- [:set ::lib.schema.id/field]
  "Set of all Field IDs from implicitly joined tables."
  [query-or-clause :- [:or ::lib.schema/query ::lib.schema.mbql-clause/clause]]
  (let [joined-field-ids (volatile! (transient #{}))
        implicit-join-field-opt? #(and (:source-field %) (not (:join-alias %)))
        walk-clause (fn [clause]
                      (lib.util.match/match-lite clause
                        [:field (opts :guard implicit-join-field-opt?) id]
                        (vswap! joined-field-ids conj! id)

                        _ nil)
                      nil)]
    (if (map? query-or-clause)
      (lib.walk/walk-clauses query-or-clause (fn [_query _path-type _path clause]
                                               (walk-clause clause)))
      (lib.walk/walk-clause query-or-clause walk-clause))
    (persistent! @joined-field-ids)))

(mu/defn all-implicitly-joined-table-ids :- [:maybe [:set {:min 1} ::lib.schema.id/table]]
  "Set of all Table IDs referenced via implicit joins in `query` or nil if no such IDs can be found."
  [query :- ::lib.schema/query]
  (->> (all-implicitly-joined-field-ids query)
       (lib.metadata/bulk-metadata query :metadata/column)
       (into #{} (keep :table-id))
       not-empty))

(mu/defn all-template-tags-id->field-ids :- [:maybe
                                             [:map-of
                                              ::lib.schema.template-tag/id
                                              [:set ::lib.schema.id/field]]]
  "Return a map of

    template-tag-id -> template-tag-field-ids-set

  For all template tags in `query`."
  [query :- ::lib.schema/query]
  (not-empty
   (into {}
         (comp (filter :dimension)
               (filter :id)
               (map (fn [template-tag]
                      [(:id template-tag) (all-field-ids (:dimension template-tag))])))
         (all-template-tags query))))

(mu/defn all-template-tag-field-ids :- [:maybe [:set {:min 1} ::lib.schema.id/field]]
  "Set of all `:field` IDs used in template tags."
  [query :- ::lib.schema/query]
  (not-empty
   (into #{}
         (comp (keep :dimension)
               (mapcat all-field-ids))
         (all-template-tags query))))

;;; TODO (Cam 10/1/25) -- overlapping responsibilities with [[metabase.lib.template-tags/template-tags->snippet-ids]]
(mu/defn all-template-tag-snippet-ids :- [:maybe [:set {:min 1} ::lib.schema.id/snippet]]
  "Set of all Native Query Snippet IDs used in template tags."
  [query :- ::lib.schema/query]
  (not-empty
   (into #{}
         (comp (filter #(= (:type %) :snippet))
               (keep :snippet-id))
         (all-template-tags query))))
