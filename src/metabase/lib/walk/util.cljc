(ns metabase.lib.walk.util
  "Utility functions built on top of [[metabase.lib.walk]]."
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.util :as lib.util]
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
  [query :- ::lib.schema/query]
  (stage-values-set query (keep :source-table)))

(mu/defn all-source-card-ids :- [:maybe [:set {:min 1} ::lib.schema.id/table]]
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

(mu/defn- collect-field-ids :- [:maybe [:set {:min 1} ::lib.schema.id/field]]
  "Walk `clause` and collect all Field IDS in `:field` clauses."
  [clause]
  (let [acc (volatile! (transient #{}))]
    (lib.walk/walk-clause
     clause
     (fn [clause]
       (when (lib.util/clause-of-type? clause :field)
         (when-let [field-id (lib.util.match/match-one clause
                               [:field _opts (id :guard pos-int?)]
                               id)]
           (vswap! acc conj! field-id)))))
    (not-empty (persistent! @acc))))

(mu/defn all-template-tags-id->field-ids :- [:maybe
                                             [:map-of
                                              ::lib.schema.common/non-blank-string
                                              [:set ::lib.schema.id/field]]]
  [query :- ::lib.schema/query]
  (not-empty
   (into {}
         (comp (filter :dimension)
               (map (fn [template-tag]
                      [(:id template-tag) (collect-field-ids (:dimension template-tag))])))
         (all-template-tags query))))
