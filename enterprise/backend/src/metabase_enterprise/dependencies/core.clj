(ns metabase-enterprise.dependencies.core
  "API namespace for the `metabase-enterprise.dependencies` module.

  Call [[errors-from-proposed-edits]] to find out what things will break downstream of a set of new/updated entities."
  (:require
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.metadata-provider :as deps.provider]
   [metabase-enterprise.dependencies.models.dependency :as deps.graph]
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

(mr/def ::updates-map
  ;; TODO: Make this more specific.
  [:map-of ::entity-type [:sequential [:map [:id {:optional true} :int]]]])

(defn- transitive-dependents
  [& {:keys [graph updated-entities include-native?]}]
  (if include-native?
    (deps.graph/transitive-dependents graph updated-entities)
    (deps.graph/transitive-mbql-dependents graph updated-entities)))

(mu/defn- metadata-provider :- ::lib.schema.metadata/metadata-provider
  "Constructs a `MetadataProvider` with some pending edits applied.

  The edits are *transitive*! Since a card's output columns can depend on its (possibly updated) inputs, all dependents
  of editing things are considered edited too.

  Note that if `:result-metadata` is present on an updated Card, it **will be used!** The only case where that is
  actually useful is with a native query which has been executed, so the caller has driver metadata to give us. Any
  old, pre-update `:result-metadata` should be dropped from any other cards in `updated-entities`.

  Also note that `include-native?` is only relevant if you don't pass in `dependents`.  If you pass in `dependents`,
  those will be included in the metadata provider whether or not they are native.  If you don't pass in `dependents`,
  `include-native` will determine whether native dependents are included in the metadata provider."
  ([base-provider    :- ::lib.schema.metadata/metadata-provider
    updated-entities :- ::updates-map
    & {:keys [graph dependents include-native?]}]
   ;; Reusing the cache with different overrides breaks the caching of [[lib.metadata/card]] calls.
   (lib.metadata.protocols/clear-cache! base-provider)
   (let [dependents (or dependents (transitive-dependents :graph            graph
                                                          :updated-entities updated-entities
                                                          :include-native?  include-native?))]
     (deps.provider/override-metadata-provider
      {:base-provider base-provider
       :updated-entities updated-entities
       :dependent-ids dependents}))))

(mu/defn- check-query-soundness :- [:map-of ::entity-type [:map-of :int [:set [:ref ::lib.schema.validate/error]]]]
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

(mu/defn errors-from-proposed-edits :- [:map-of ::entity-type [:map-of :int [:set [:ref ::lib.schema.validate/error]]]]
  "Given a regular `MetadataProvider`, and a map of entity types (`:card`, `:transform`, `:snippet`) to lists of
  updated entities, this returns a map of `{entity-type {entity-id [bad-ref ...]}}`.

  The 1-arity groups all the dependents by which Database they are part of, and runs the analysis for each of them.

  The output is a map: `{entity-type {id [errors...]}}`; an empty map is returned when there are no errors
  detected.

  When `include-native?` is false, this function will ignore any entities using native sql and their children."
  ([edits :- ::updates-map
    & {:keys [base-provider graph include-native?]}]
   (let [valid-edits (if include-native?
                       edits
                       (into {}
                             (map (fn [[entity-type instances]]
                                    [entity-type (remove #(deps.graph/is-native-entity? entity-type %)
                                                         instances)]))
                             edits))]
     (cond
       (not (some seq (vals valid-edits)))
       {}

       base-provider
       (-> base-provider
           (metadata-provider valid-edits :graph graph :include-native? include-native?)
           check-query-soundness)

       :else
       (let [all-deps (transitive-dependents :updated-entities valid-edits :include-native? include-native?)
             by-db    (group-by-db all-deps)]
         (reduce (fn [errors [db-id deps]]
                   (-> (lib-be/application-database-metadata-provider db-id)
                       (metadata-provider valid-edits :dependents deps)
                       check-query-soundness
                       (merge errors)))
                 {} by-db))))))

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
