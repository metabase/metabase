(ns metabase-enterprise.dependencies.core
  "API namespace for the `metabase-enterprise.dependencies` module."
  (:require
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
   [metabase.util.malli.registry :as mr]))

(mr/def ::entity-type
  [:enum :card :transform :snippet])

(mr/def ::updates-map
  ;; TODO: Make this more specific.
  [:map-of ::entity-type [:sequential [:map [:id {:optional true} :int]]]])

(mr/def ::dependents-map
  [:map-of ::entity-type [:or [:sequential :int] [:set :int]]])

(mu/defn metadata-provider :- ::lib.schema.metadata/metadata-provider
  "Constructs a `MetadataProvider` with some pending edits applied.

  The edits are *transitive*! Since a card's output columns can depend on its (possibly updated) inputs, all dependents
  of editing things are considered edited too.

  Note that if `:result-metadata` is present on an updated Card, it **will be used!** The only case where that is
  actually useful is with a native query which has been executed, so the caller has driver metadata to give us. Any
  old, pre-update `:result-metadata` should be dropped from any other cards in `updated-entities`."
  [base-provider    :- ::lib.schema.metadata/metadata-provider
   updated-entities :- ::updates-map
   dependent-ids    :- ::dependents-map]
  (deps.provider/override-metadata-provider base-provider updated-entities dependent-ids))

(mu/defn check-cards-have-sound-refs ;; :- [:map-of ::lib.schema.id/card [:sequential ::lib.schema.mbql-clause/clause]]
  "Given a `MetadataProvider` as returned by [[metadata-provider]], scan all its updated entities and their dependents
  to check that all cards are still valid. In particular, we're looking for bad clauses with refs to columns which no
  longer exist, since those queries fail to compile.

  May return false positives: that is, if one of the `check-cards` has a bad ref in it, then it will be returned
  even if that bad ref has nothing to do with the `updated-cards`.

  Returns a map `{:cards {card-id [bad-ref ...]}, :transforms {...}}`. It will be empty, if there are no bad refs
  detected."
  [provider  :- ::lib.schema.metadata/metadata-provider]
  (let [{check-card-ids :card, check-transform-ids :transform} (deps.provider/all-overrides provider)]
    (reduce (fn [errors [error-type id query]]
              (let [query    (lib/query provider query)
                    query-type (:lib/type (lib/query-stage query 0))
                    driver (:engine (lib.metadata/database provider))
                    bad-refs (case query-type
                               :mbql.stage/mbql (lib/find-bad-refs query)
                               :mbql.stage/native (not (deps.native/validate-native-query driver provider query)))]
                (cond-> errors
                  bad-refs (assoc-in [error-type id] bad-refs))))
            {}
            (concat (map (fn [card-id]
                           [:cards card-id (:dataset-query (lib.metadata/card provider card-id))])
                         check-card-ids)
                    (map (fn [transform-id]
                           [:transforms transform-id (get-in (lib.metadata/transform provider transform-id)
                                                             [:source :query])])
                         check-transform-ids)))))

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
        mp       (metadata-provider base-mp {:card [card']} {:card card-ids})]
    #_(deps.provider/all-overrides mp)
    #_(lib.metadata/card mp 1)
    #_(lib.metadata/card mp 36)
    (check-cards-have-sound-refs mp))

  (let [card (toucan2.core/select-one :model/Card :id 121)
        mp   (lib-be.metadata.jvm/application-database-metadata-provider (:database_id card))]
    (upstream-deps:card mp card)))
