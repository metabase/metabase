(ns metabase-enterprise.dependencies.core
  "API namespace for the `metabase-enterprise.dependencies` module.

  Call [[errors-from-proposed-edits]] to find out what things will break downstream of a set of new/updated entities."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.metadata-provider :as deps.provider]
   [metabase-enterprise.dependencies.models.dependency :as deps.graph]
   [metabase.graph.core :as graph]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::entity-type
  [:enum :card :transform :snippet :table])

(mr/def ::errors-map
  "A map of entity-type -> entity-id -> set of validation errors."
  [:map-of ::entity-type [:map-of :int [:set [:ref ::lib.schema.validate/error]]]])

(mr/def ::updates-map
  ;; TODO: Make this more specific.
  [:map-of ::entity-type [:sequential [:map [:id {:optional true} :int]]]])

(mu/defn- metadata-provider :- ::lib.schema.metadata/metadata-provider
  "Constructs a `MetadataProvider` with some pending edits applied.

  The edits are *transitive*! Since a card's output columns can depend on its (possibly updated) inputs, all dependents
  of editing things are considered edited too.

  Note that if `:result-metadata` is present on an updated Card, it **will be used!** The only case where that is
  actually useful is with a native query which has been executed, so the caller has driver metadata to give us. Any
  old, pre-update `:result-metadata` should be dropped from any other cards in `updated-entities`."
  ([base-provider    :- ::lib.schema.metadata/metadata-provider
    updated-entities :- ::updates-map
    & {:keys [graph dependents]}]
   ;; Reusing the cache with different overrides breaks the caching of [[lib.metadata/card]] calls.
   (lib.metadata.protocols/clear-cache! base-provider)
   (let [dependents (or dependents (deps.graph/transitive-dependents graph updated-entities))]
     (deps.provider/override-metadata-provider base-provider updated-entities dependents))))

(mu/defn- check-query-soundness :- ::errors-map
  "Given a `MetadataProvider` as returned by [[metadata-provider]], scan all its updated entities and their dependents
  to check that everything is still sound.

  In particular, we're looking for bad clauses with refs to columns which no longer exist, since those queries fail
  to compile.

  May return false positives: if a card already has a bad ref in it, then it will be returned even if that bad ref has
  nothing to do with the updates in the `provider`.

  Returns a map `{:card {card-id [bad-ref ...]}, :transform {...}}`. It will be empty, if there are no bad refs
  detected."
  [provider :- ::lib.schema.metadata/metadata-provider]
  (let [overrides (deps.provider/all-overrides provider)
        errors    (volatile! {})]
    (doseq [[entity-type ids] overrides
            id ids
            :let [bad-refs (deps.analysis/check-entity provider entity-type id)]]
      (when (seq bad-refs)
        (vswap! errors assoc-in [entity-type id] bad-refs)))
    @errors))

(defn- group-by-db [deps]
  (let [by-db (volatile! {})]
    (when (seq (:card deps))
      (doseq [[db-id card-ids] (->> (t2/select [:model/Card :id :database_id :card_schema] :id [:in (:card deps)])
                                    (u/group-by :database_id :id conj #{}))]
        (vswap! by-db assoc-in [db-id :card] card-ids)))
    (when (seq (:table deps))
      (doseq [[db-id table-ids] (->> (t2/select [:model/Table :id :db_id] :id [:in (:table deps)])
                                     (u/group-by :db_id :id conj #{}))]
        (vswap! by-db assoc-in [db-id :table] table-ids)))
    (when (seq (:transform deps))
      (doseq [[db-id transform-ids] (->> (t2/select [:model/Transform :id :source] :id [:in (:transform deps)])
                                         (u/group-by #(get-in % [:source :query :database]) :id conj #{}))]
        (if db-id
          (vswap! by-db assoc-in [db-id :transform] transform-ids)
          (log/warnf "Unable to infer database from transforms %s" transform-ids))))
    (when (seq (:snippet deps))
      ;; Copy any snippet deps to each database, since they span them all.
      (vswap! by-db update-vals #(assoc % :snippet (:snippet deps))))

    @by-db))

(mu/defn- baseline-provider :- ::lib.schema.metadata/metadata-provider
  "Creates a metadata provider for baseline checking.

  For transforms being edited, we need to create an OverridingMetadataProvider with the original (unmodified)
  transforms to properly compute output table columns via `setup-transforms!`. Without this,
  the raw base-provider won't have proper column information for transform output tables.

  Takes the `edits` map to determine which transforms were originally edited, since those are the ones
  whose output tables need proper column setup for baseline validation."
  [base-provider :- ::lib.schema.metadata/metadata-provider
   edits         :- ::updates-map]
  (let [edited-transform-ids (keep :id (:transform edits))]
    (if (seq edited-transform-ids)
      ;; Create an overriding provider with original transforms to trigger setup-transforms!
      (let [original-transforms (keep #(lib.metadata/transform base-provider %) edited-transform-ids)]
        (deps.provider/override-metadata-provider
         base-provider
         {:transform original-transforms}
         {}))  ; Empty dependents - we just need transform setup
      base-provider)))

(mu/defn- diff-with-baseline :- ::errors-map
  "Given proposed errors and a base metadata provider, computes which errors are NEW.

  For each entity with proposed errors, checks what errors existed in the baseline (unmodified) state.
  Returns only errors that are new (not present in baseline).

  Takes `edits` to properly set up the baseline provider with original transforms."
  [base-provider   :- ::lib.schema.metadata/metadata-provider
   edits           :- ::updates-map
   proposed-errors :- ::errors-map]
  (let [baseline-mp (baseline-provider base-provider edits)]
    (reduce-kv
     (fn [result entity-type entity-errors]
       (let [new-entity-errors
             (reduce-kv
              (fn [acc entity-id errors]
                (let [baseline (deps.analysis/check-entity baseline-mp entity-type entity-id)
                      new-errors (set/difference errors baseline)]
                  (if (seq new-errors)
                    (assoc acc entity-id new-errors)
                    acc)))
              {}
              entity-errors)]
         (if (seq new-entity-errors)
           (assoc result entity-type new-entity-errors)
           result)))
     {}
     proposed-errors)))

(mu/defn errors-from-proposed-edits :- ::errors-map
  "Given a regular `MetadataProvider`, and a map of entity types (`:card`, `:transform`, `:snippet`) to lists of
  updated entities, this returns a map of `{entity-type {entity-id [bad-ref ...]}}`.

  The 1-arity groups all the dependents by which Database they are part of, and runs the analysis for each of them.

  Only NEW errors are returned - errors that existed before the proposed edits are filtered out by diffing
  against the baseline state.

  The output is a map: `{entity-type {id [errors...]}}`; an empty map is returned when there are no errors
  detected."
  ([edits :- ::updates-map]
   (let [all-deps (deps.graph/transitive-dependents edits)
         by-db    (group-by-db all-deps)]
     (reduce (fn [errors [db-id deps]]
               (let [base-provider (lib-be/application-database-metadata-provider db-id)
                     proposed-errors (-> base-provider
                                         (metadata-provider edits :dependents deps)
                                         check-query-soundness)
                     ;; Clear the cache before baseline check to avoid pollution from the proposed check.
                     _ (lib.metadata.protocols/clear-cache! base-provider)
                     new-errors (diff-with-baseline base-provider edits proposed-errors)]
                 (merge errors new-errors)))
             {} by-db)))

  ([base-provider :- ::lib.schema.metadata/metadata-provider
    edits         :- ::updates-map]
   (errors-from-proposed-edits base-provider nil edits))

  ([base-provider :- ::lib.schema.metadata/metadata-provider
    graph         :- [:maybe ::graph/graph]
    edits         :- ::updates-map]
   (let [proposed-errors (-> base-provider
                             (metadata-provider edits :graph graph)
                             check-query-soundness)]
     ;; Clear the cache before baseline check to avoid pollution from the proposed check.
     ;; The overriding provider delegates cache operations to base-provider, so cached values
     ;; from the proposed check could affect the baseline check.
     (lib.metadata.protocols/clear-cache! base-provider)
     (diff-with-baseline base-provider edits proposed-errors))))

(mu/defn downstream-errors-from-proposed-edits :- ::errors-map
  "Like [[errors-from-proposed-edits]], but excludes errors for the entity being edited.

  This is the appropriate function to call when checking proposed edits from a user interface,
  where we don't want to show users errors about the entity they're currently editing."
  [base-provider :- ::lib.schema.metadata/metadata-provider
   graph         :- [:maybe ::graph/graph]
   entity-type   :- ::entity-type
   entity-id     :- :int
   edits         :- ::updates-map]
  (-> (errors-from-proposed-edits base-provider graph edits)
      (m/dissoc-in [entity-type entity-id])))

#_{:clj-kondo/ignore [:unresolved-namespace]}
(comment
  ;; This should work on any fresh-ish Metabase instance; these are the built-in example questions.
  (let [base-mp (lib-be/application-database-metadata-provider 39)
        transform (lib.metadata/transform base-mp 1)
        transform (-> transform
                      ;; NOTE: NO RAW MANIPULATION OUTSIDE OF LIB! DO NOT EVER DO THIS PLEASE <3
                      (update-in [:source :query :query :expressions]
                                 ;; Replacing the expression Age with Duration - this breaks downstream uses!
                                 update-keys (constantly "Fair Die"))
                      #_(dissoc :result-metadata))
        mp       (metadata-provider base-mp {:transform [transform]})]
    #_(deps.provider/all-overrides mp)
    (check-query-soundness mp))

  ;; Checking that we can properly group everything by database. Surprisingly fast even fetching everything.
  (let [deps {:card      (t2/select-fn-set :id :model/Card)
              :transform (t2/select-fn-set :id :model/Transform)
              :table     (t2/select-fn-set :id :model/Table)}]
    (group-by-db deps))

  (t2/select-fn-vec (juxt :id :name :active :table_id) :model/Field :id [:in [1065 1066 1067 1068 1069]])

  (t2/select-one :model/Card :id 124)
  (deps.graph/transitive-dependents {:transform [{:id 1}]})
  (deps.graph/transitive-dependents {:table [{:id 155}]})
  (metabase.premium-features.core/token-features)

  (let [card (t2/select-one :model/Card :id 121)
        mp   (lib-be/application-database-metadata-provider (:database_id card))]
    (upstream-deps:card mp card)))
