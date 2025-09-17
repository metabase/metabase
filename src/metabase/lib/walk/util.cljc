(ns metabase.lib.walk.util
  "Utility functions built on top of [[metabase.lib.walk]]."
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(defn- transduce-stages
  ([query rf]
   (transduce-stages query (rf) rf))

  ([query init rf]
   (let [acc (volatile! init)]
     (lib.walk/walk-stages
      query
      (fn [_query _path stage]
        (vswap! acc rf stage)
        nil))
     (rf @acc))))

(defn- stage-values-set [query xform]
  (not-empty
   (transduce-stages query (transient #{}) (-> conj!
                                               xform
                                               (completing persistent!)))))

(mu/defn all-source-table-ids :- [:maybe [:set {:min 1} ::lib.schema.id/table]]
  "Return a set of all `:source-table` Table IDs referenced anywhere in the query."
  [query :- ::lib.schema/query]
  (stage-values-set query (keep :source-table)))

(mu/defn all-source-card-ids :- [:maybe [:set {:min 1} ::lib.schema.id/card]]
  "Return a set of all `:source-card` Card IDs referenced anywhere in the query."
  [query :- ::lib.schema/query]
  (stage-values-set query (keep :source-card)))

(mu/defn all-template-tags :- [:maybe [:set {:min 1} ::lib.schema.template-tag/template-tag]]
  "Return a map of Param IDs to sets of Field IDs referenced by each template tag parameter in this `card`.

  Mostly used for determining Fields referenced by Cards for purposes other than processing queries. Filters out
  `:field` clauses which use names."
  [query :- ::lib.schema/query]
  (stage-values-set query (comp (filter (fn [stage]
                                          (= (:lib/type stage) :mbql.stage/native)))
                                (mapcat :template-tags)
                                (map (fn [[template-tag-name template-tag]]
                                       (assoc template-tag :lib.walk/template-tag-name template-tag-name))))))

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
  "Set of all Field IDs referenced in `:field` refs in `query`."
  [query :- ::lib.schema/query]
  (let [field-ids (volatile! (transient #{}))]
    (lib.walk/walk-clauses
     query
     (fn [_query _path-type _stage-or-join-path clause]
       (lib.util.match/match-lite clause
         [:field _opts (id :guard pos-int?)]
         (vswap! field-ids conj! id))
       nil))
    (persistent! @field-ids)))
