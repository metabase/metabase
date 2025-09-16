(ns metabase-enterprise.dependencies.core
  "API namespace for the `metabase-enterprise.dependencies` module."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.dependencies.metadata-provider :as deps.provider]
   [metabase-enterprise.dependencies.models.dependency :as deps.graph]
   [metabase-enterprise.dependencies.native-validation :as deps.native]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::entity-type
  [:enum :card :transform :snippet])

(mr/def ::updates-map
  ;; TODO: Make this more specific.
  [:map-of ::entity-type [:sequential [:map [:id {:optional true} :int]]]])

(mr/def ::dependents-map
  [:map-of ::entity-type [:or [:sequential :int] [:set :int]]])

(defn- merge-deps [deps-maps]
  (reduce (partial merge-with set/union) {} deps-maps))

(mu/defn all-dependents
  "Returns a single map of deps, taking the union of all the deps of the `updated-entities`."
  [updated-entities :- ::updates-map]
  (->> (for [[entity-type updates] updated-entities
             {:keys [id]}          updates]
         (deps.graph/id-dependents entity-type id))
       merge-deps))

(mu/defn metadata-provider :- ::lib.schema.metadata/metadata-provider
  "Constructs a `MetadataProvider` with some pending edits applied.

  The edits are *transitive*! Since a card's output columns can depend on its (possibly updated) inputs, all dependents
  of editing things are considered edited too.

  Note that if `:result-metadata` is present on an updated Card, it **will be used!** The only case where that is
  actually useful is with a native query which has been executed, so the caller has driver metadata to give us. Any
  old, pre-update `:result-metadata` should be dropped from any other cards in `updated-entities`."
  [base-provider    :- ::lib.schema.metadata/metadata-provider
   updated-entities :- ::updates-map
   #_#_#_dependent-ids    :- ::dependents-map]
  (let [deps (all-dependents updated-entities)]
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

#_(defn dependents-of
    "Given a map of entity types to a list of updated entities (such as one would pass to [[metadata-provider]]),
  returns all their downstream dependents, in a map suitable for the other argument to [[metadata-provider]]."
    [updated-entities]
  ;; HACK: This should not be calling appdb directly! Long term, it should call the deps graph to get the downstream
  ;; entities.
    (let [card-dbs      (into #{} (keep :database-id)
                              (:card updated-entities))
          transform-dbs (into #{} (keep #(-> % :source :query :database))
                              (:transform updated-entities))
          dbs           (set/union card-dbs transform-dbs)]
      (if (empty? dbs)
        {}
        {:card      (t2/select-fn-set :id :model/Card :database_id [:in dbs] :archived false)
         :transform (t2/select-fn-set :id :model/Transform)})))

(defn errors-from-proposed-edits
  "Given a regular `MetadataProvider`, and a map of entity types (`:card`, `:transform`, `:snippet`) to lists of
  updated entities, this returns a map of `{entity-type {entity-id [bad-ref ...]}}`.

  See [[check-query-soundness]] for more details."
  [base-provider edits]
  (-> base-provider
      (metadata-provider edits)
      check-query-soundness))

(defn- upstream-deps:mbql-card [legacy-query]
  (lib.util/source-tables-and-cards [legacy-query]))

(defn- upstream-deps:native-card [metadata-provider card]
  (let [engine (:engine (lib.metadata/database metadata-provider))
        deps   (deps.native/native-query-deps engine metadata-provider (:dataset_query card))]
    ;; The deps are in #{{:table 7} ...} form and need conversion to ::upstream-deps form.
    (u/group-by ffirst (comp second first) conj #{} deps)))

(mr/def ::upstream-deps
  [:map
   [:card    {:optional true} [:set ::lib.schema.id/card]]
   [:table   {:optional true} [:set ::lib.schema.id/table]]
   [:snippet {:optional true} [:set ::lib.schema.id/snippet]]])

(mu/defn upstream-deps:card :- ::upstream-deps
  "Given a Toucan `:model/Card`, return its upstream dependencies as a map from the kind to a set of IDs."
  [metadata-provider                      :- ::lib.schema.metadata/metadata-provider
   {query :dataset_query :as toucan-card}]
  (case (:type query)
    :query  (upstream-deps:mbql-card query)
    :native (upstream-deps:native-card metadata-provider toucan-card)
    (throw (ex-info "Unhandled kind of card query" {:card toucan-card}))))

(defenterprise replace-upstream-deps:card!
  "Enterprise version.

  Given a Toucan `:model/Card`, compute its upstream dependencies and update the deps graph to reflect it.

  Should be called from post-insert or post-update; the card must already have an ID.

  Returns nil."
  :feature :dependencies
  [toucan-card]
  (log/infof "Updating deps for card %d" (:id toucan-card))
  (let [metadata-provider (lib-be.metadata.jvm/application-database-metadata-provider (:database_id toucan-card))]
    (deps.graph/replace-dependencies :card (:id toucan-card) (upstream-deps:card metadata-provider toucan-card))))

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
        (lib-be.metadata.jvm/application-database-metadata-provider 1)
        card     (lib.metadata/card base-mp 1)
        card'    (-> card
                     (update-in [:dataset-query :query :expressions]
                                ;; Replacing the expression Age with Duration - this breaks downstream uses!
                                update-keys (constantly "Duration"))
                     (dissoc :result-metadata))
        mp       (metadata-provider base-mp {:card [card']})]
    #_(doseq [id card-ids]
        (replace-upstream-deps:card! (t2/select-one :model/Card :id id)))
    #_(deps.provider/all-overrides mp)
    #_(lib.metadata/card mp 1)
    #_(lib.metadata/card mp 36)
    (check-query-soundness mp)
    #_(deps.graph/id-dependents :card 1))

  (metabase.premium-features.core/token-features)

  (let [card (toucan2.core/select-one :model/Card :id 121)
        mp   (lib-be.metadata.jvm/application-database-metadata-provider (:database_id card))]
    (upstream-deps:card mp card)))
