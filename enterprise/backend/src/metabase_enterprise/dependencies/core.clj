(ns metabase-enterprise.dependencies.core
  "API namespace for the `metabase-enterprise.dependencies` module."
  (:require
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.metadata-provider :as deps.provider]
   [metabase-enterprise.dependencies.models.dependency :as deps.graph]
   [metabase-enterprise.dependencies.native-validation :as deps.native]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::entity-type
  [:enum :card :transform :snippet :table])

(mr/def ::updates-map
  ;; TODO: Make this more specific.
  [:map-of ::entity-type [:sequential [:map [:id {:optional true} :int]]]])

(mu/defn metadata-provider :- ::lib.schema.metadata/metadata-provider
  "Constructs a `MetadataProvider` with some pending edits applied.

  The edits are *transitive*! Since a card's output columns can depend on its (possibly updated) inputs, all dependents
  of editing things are considered edited too.

  Note that if `:result-metadata` is present on an updated Card, it **will be used!** The only case where that is
  actually useful is with a native query which has been executed, so the caller has driver metadata to give us. Any
  old, pre-update `:result-metadata` should be dropped from any other cards in `updated-entities`."
  [base-provider    :- ::lib.schema.metadata/metadata-provider
   updated-entities :- ::updates-map]
  (let [deps (deps.graph/transitive-dependents updated-entities)]
    (deps.provider/override-metadata-provider base-provider updated-entities deps)))

(mu/defn check-query-soundness ;; :- [:map-of ::lib.schema.id/card [:sequential ::lib.schema.mbql-clause/clause]]
  "Given a `MetadataProvider` as returned by [[metadata-provider]], scan all its updated entities and their dependents
  to check that everything is still sound.

  In particular, we're looking for bad clauses with refs to columns which no longer exist, since those queries fail
  to compile.

  May return false positives: if a card already has a bad ref in it, then it will be returned even if that bad ref has
  nothing to do with the updates in the `provider`.

  Returns a map `{:card {card-id [bad-ref ...]}, :transform {...}}`. It will be empty, if there are no bad refs
  detected."
  [provider  :- ::lib.schema.metadata/metadata-provider]
  (let [overrides (deps.provider/all-overrides provider)
        errors    (volatile! {})]
    (doseq [[entity-type ->query] [[:card      (fn [card-id]
                                                 (:dataset-query (lib.metadata/card provider card-id)))]
                                   [:transform (fn [transform-id]
                                                 (get-in (lib.metadata/transform provider transform-id)
                                                         [:source :query]))]]
            id                    (get overrides entity-type)
            :let [raw-query  (->query id)
                  query      (lib/query provider raw-query)
                  query-type (:lib/type (lib/query-stage query 0))
                  driver     (:engine (lib.metadata/database provider))
                  bad-refs   (case query-type
                               :mbql.stage/mbql   (lib/find-bad-refs query)
                               :mbql.stage/native (not (deps.native/validate-native-query driver provider query)))]]
      (when bad-refs
        (vswap! errors assoc-in [entity-type id] bad-refs)))
    @errors))

(defn errors-from-proposed-edits
  "Given a regular `MetadataProvider`, and a map of entity types (`:card`, `:transform`, `:snippet`) to lists of
  updated entities, this returns a map of `{entity-type {entity-id [bad-ref ...]}}`.

  See [[check-query-soundness]] for more details."
  [base-provider edits]
  (-> base-provider
      (metadata-provider edits)
      check-query-soundness))

;; TODO: Replace this with `events/publish-event!` listeners.
(defenterprise replace-upstream-deps:card!
  "Enterprise version.

  Given a Toucan `:model/Card`, compute its upstream dependencies and update the deps graph to reflect it.

  Should be called from post-insert or post-update; the card must already have an ID.

  Returns nil."
  :feature :dependencies
  [toucan-card]
  (log/infof "Updating deps for card %d" (:id toucan-card))
  (let [metadata-provider (lib-be.metadata.jvm/application-database-metadata-provider (:database_id toucan-card))]
    (deps.graph/replace-dependencies :card (:id toucan-card)
                                     (deps.calculation/upstream-deps:card metadata-provider toucan-card))))

(defenterprise delete-deps!
  "Enterprise version. Deletes all dependencies for the given entity."
  :feature :dependencies
  [entity-type id]
  (log/infof "Deleting deps for deleted %s %d" entity-type id)
  (deps.graph/replace-dependencies entity-type id {}))

#_{:clj-kondo/ignore [:unresolved-namespace]}
(comment
  ;; This should work on any fresh-ish Metabase instance; these are the built-in example questions.
  (let [card-ids [1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20
                  21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37]
        base-mp  #_{:clj-kondo/ignore [:unresolved-namespace]}
        (lib-be.metadata.jvm/application-database-metadata-provider 39)
        transform (lib.metadata/transform base-mp 1)
        transform (-> transform
                      (update-in [:source :query :query :expressions]
                                 ;; Replacing the expression Age with Duration - this breaks downstream uses!
                                 update-keys (constantly "Fair Die"))
                      #_(dissoc :result-metadata))
        mp       (metadata-provider base-mp {:transform [transform]})]
    #_(deps.provider/all-overrides mp)
    (check-query-soundness mp))

  (t2/select-fn-vec (juxt :id :name :active :table_id) :model/Field :id [:in [1065 1066 1067 1068 1069]])

  (t2/select-one :model/Card :id 124)
  (deps.graph/transitive-dependents {:transform [{:id 1}]})
  (deps.graph/transitive-dependents {:table [{:id 155}]})
  (metabase.premium-features.core/token-features)

  (let [card (toucan2.core/select-one :model/Card :id 121)
        mp   (lib-be.metadata.jvm/application-database-metadata-provider (:database_id card))]
    (upstream-deps:card mp card)))
