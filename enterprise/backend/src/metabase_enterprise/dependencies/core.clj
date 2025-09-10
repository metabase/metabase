(ns metabase-enterprise.dependencies.core
  "API namespace for the `metabase-enterprise.dependencies` module."
  (:require
   [metabase-enterprise.dependencies.models.dependency :as deps.graph]
   [metabase-enterprise.dependencies.native-validation :as deps.native]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defn- provider-with-updated-cards [base-provider cards]
  (-> base-provider
      lib.metadata.cached-provider/cached-metadata-provider
      (doto (lib.metadata.protocols/store-metadatas! (map #(dissoc % :result-metadata) cards)))))

(mu/defn check-cards-have-sound-refs :- [:map-of ::lib.schema.id/card [:sequential ::lib.schema.mbql-clause/clause]]
  "Given a list `updated-cards` of `:metadata/card`s which may have changes vs. AppDB, and a list `check-cards` of
  cards to check, return any bad clauses found in the `check-cards`.

  May return false positives: that is, if one of the `check-cards` has a bad ref in it, then it will be returned
  even if that bad ref has nothing to do with the `updated-cards`.

  Returns a map `{card-id [bad refs...]}`, which will be empty if there are no bad refs detected."
  [base-provider  :- ::lib.schema.metadata/metadata-provider
   updated-cards  :- [:sequential ::lib.schema.metadata/card]
   check-card-ids :- [:maybe [:set ::lib.schema.id/card]]]
  (let [provider (provider-with-updated-cards base-provider updated-cards)]
    (reduce (fn [errors card-id]
              (let [card     (lib.metadata/card provider card-id)
                    query    (lib/query provider (:dataset-query card))
                    bad-refs (lib/find-bad-refs query)]
                (cond-> errors
                  bad-refs (assoc (:id card) bad-refs))))
            {}
            check-card-ids)))

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

(comment
  ;; This should work on any fresh-ish Metabase instance; these are the built-in example questions.
  (let [card-ids [1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20
                  21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37]
        base-mp  #_{:clj-kondo/ignore [:unresolved-namespace]}
        (lib-be.metadata.jvm/application-database-metadata-provider 1)
        card     (lib.metadata/card base-mp 1)
        card'    (update-in card [:dataset-query :query :expressions]
                            ;; Replacing the expression Age with Duration - this breaks downstream uses!
                            update-keys (constantly "Duration"))]
    (check-cards-have-sound-refs base-mp [card'] card-ids))

  (let [card (toucan2.core/select-one :model/Card :id 121)
        mp   (lib-be.metadata.jvm/application-database-metadata-provider (:database_id card))]
    (upstream-deps:card mp card)))
