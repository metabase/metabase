(ns metabase-enterprise.dependencies.core
  "API namespace for the `metabase-enterprise.dependencies` module.

  Call [[errors-from-proposed-edits]] to find out what things will break downstream of a set of new/updated entities."
  (:require
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.metadata-provider :as deps.provider]
   [metabase-enterprise.dependencies.models.dependency :as deps.graph]
   [metabase-enterprise.dependencies.native-validation :as deps.native]
   [metabase.graph.core :as graph]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
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
   (let [dependents (or dependents (deps.graph/transitive-dependents graph updated-entities))]
     (deps.provider/override-metadata-provider base-provider updated-entities dependents))))

(defmulti check-query-inner
  "Given a `MetadataProvider` and a lib query, find any bad refs in that query."
  (fn [_mp driver query]
    (-> (lib/query-stage query 0)
        :lib/type)))

(defmethod check-query-inner :mbql.stage/mbql
  [mp _driver query]
  (lib/find-bad-refs query))

(defmethod check-query-inner :mbql.stage/native
  [mp driver query]
  (deps.native/validate-native-query driver mp query))

(defn- check-query
  "Given a `MetadataProvider` and a query, find any bad refs in that query."
  [mp driver query]
  (check-query-inner mp driver (lib/query mp query)))

(defmulti check-entity
  "Given a `MetadataProvider`, and entity type, and an entity id, find any bad refs in that entity."
  (fn [_mp entity-type _entity-id]
    entity-type))

(defmethod check-entity :default
  [_mp _entity-type _entity-id]
  nil)

(defmethod check-entity :card
  [mp entity-type entity-id]
  (let [query (:dataset-query (lib.metadata/card mp entity-id))
        driver (:engine (lib.metadata/database mp))]
    (check-query mp driver query)))

(defmethod check-entity :transform
  [mp entity-type entity-id]
  (let [{{target-schema :schema target-name :name} :target
         {:keys [query]} :source
         :as transform} (lib.metadata/transform mp entity-id)
        driver (:engine (lib.metadata/database mp))
        output-table (some #(when (and (= (:schema %) target-schema)
                                       (= (:name %) target-name))
                              %)
                           (lib.metadata/tables mp))
        output-fields (lib.metadata/active-fields mp (:id output-table))
        {:keys [duplicate-fields]} (reduce (fn [{:keys [seen duplicate-fields]}
                                                {name :name :as field}]
                                             (if (seen name)
                                               {:seen seen
                                                :duplicate-fields (conj duplicate-fields field)}
                                               {:seen (conj seen name)
                                                :duplicate-fields duplicate-fields}))
                                           {:seen #{}
                                            :bad nil}
                                           output-fields)]
    (into duplicate-fields (check-query mp driver query))))

(mu/defn- check-query-soundness ;; :- [:map-of ::lib.schema.id/card [:sequential ::lib.schema.mbql-clause/clause]]
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
            :let [bad-refs (check-entity provider entity-type id)]]
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

;; TODO: (Braden 09/22/2025) More precise schemas for the errors this function returns. Currently they're pretty
;; opaque, since the consumers of this function really care about "working/broken" and not the details of what's wrong
;; with any particular card.
(mu/defn errors-from-proposed-edits :- [:map-of ::entity-type [:map-of :int [:or :boolean [:sequential :any]]]]
  "Given a regular `MetadataProvider`, and a map of entity types (`:card`, `:transform`, `:snippet`) to lists of
  updated entities, this returns a map of `{entity-type {entity-id [bad-ref ...]}}`.

  The 1-arity groups all the dependents by which Database they are part of, and runs the analysis for each of them.

  The output is a map: `{entity-type {id [errors...]}}`; an empty map is returned when there are no errors
  detected."
  ([edits :- ::updates-map]
   (let [all-deps (deps.graph/transitive-dependents edits)
         by-db    (group-by-db all-deps)]
     (reduce (fn [errors [db-id deps]]
               (-> (lib-be.metadata.jvm/application-database-metadata-provider db-id)
                   (metadata-provider edits :dependents deps)
                   check-query-soundness
                   (merge errors)))
             {} by-db)))

  ([base-provider :- ::lib.schema.metadata/metadata-provider
    edits         :- ::updates-map]
   (errors-from-proposed-edits base-provider nil edits))

  ([base-provider :- ::lib.schema.metadata/metadata-provider
    graph         :- [:maybe ::graph/graph]
    edits         :- ::updates-map]
   (-> base-provider
       (metadata-provider edits :graph graph)
       check-query-soundness)))

#_{:clj-kondo/ignore [:unresolved-namespace]}
(comment
  ;; This should work on any fresh-ish Metabase instance; these are the built-in example questions.
  (let [base-mp (lib-be.metadata.jvm/application-database-metadata-provider 39)
        transform (lib.metadata/transform base-mp 1)
        transform (-> transform
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
        mp   (lib-be.metadata.jvm/application-database-metadata-provider (:database_id card))]
    (upstream-deps:card mp card)))
