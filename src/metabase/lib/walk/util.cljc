(ns metabase.lib.walk.util
  "Utility functions built on top of [[metabase.lib.walk]]."
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

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

(mu/defn all-source-card-ids :- [:maybe [:set {:min 1} ::lib.schema.id/card]]
  "Return a set of all `:source-card` Card IDs anywhere in the query, as well as all `:card-id`s in template tags."
  [query :- ::lib.schema/query]
  (not-empty
   (into (set (stage-values-set query (keep :source-card)))
         (keep :card-id)
         (all-template-tags query))))

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

(mu/defn all-field-ids :- [:set ::lib.schema.id/field]
  "Set of all Field IDs referenced in `:field` refs in a query or MBQL clause."
  [query-or-clause :- [:or
                       ::lib.schema/query
                       ::lib.schema.mbql-clause/clause]]
  (let [field-ids   (volatile! (transient #{}))
        walk-clause (fn [clause]
                      (lib.util.match/match-lite clause
                        [:field _opts (id :guard pos-int?)]
                        (vswap! field-ids conj! id))
                      nil)]
    (if (map? query-or-clause)
      (lib.walk/walk-clauses query-or-clause (fn [_query _path-type _stage-or-join-path clause]
                                               (walk-clause clause)))
      (lib.walk/walk-clause query-or-clause walk-clause))
    (persistent! @field-ids)))

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

(mu/defn all-template-tag-snippet-ids :- [:maybe [:set {:min 1} ::lib.schema.id/snippet]]
  "Set of all Native Query Snippet IDs used in template tags."
  [query :- ::lib.schema/query]
  (not-empty
   (into #{}
         (comp (filter #(= (:type %) :snippet))
               (keep :snippet-id))
         (all-template-tags query))))
