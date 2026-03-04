(ns metabase-enterprise.dependencies.metadata-update
  (:require
   [clojure.core.cache :as cache]
   [medley.core :as m]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.metadata-provider :as deps.metadata-provider]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.events.core :as events]
   [metabase.graph.core :as graph]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.premium-features.core :as premium-features]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(defn- mbql-graph
  "Returns a graph that is limited to sandboxes, segments, measures, and mbql cards.

  All other types of nodes are ignored and are neither included in the graph or traversed to find transitive
  dependents."
  [mp]
  (-> (models.dependency/filtered-graph-dependents
       nil
       (fn [type-field _id-field]
         [:or
          [:= type-field "card"]
          [:= type-field "sandbox"]
          [:= type-field "segment"]
          [:= type-field "measure"]]))
      (graph/filtered-graph (fn [[type id]]
                              (not (and (= type :card)
                                        (->> (lib.metadata/card mp id)
                                             (models.dependency/is-native-entity? :card))))))
      graph/cached-graph))

(mu/defn- dependent-mbql-cards :- [:sequential ::lib.schema.id/card]
  "Returns a list of all card dependencies in the transitive children of `[start-type start-id]` using `graph`."
  [graph
   start-type :- ::deps.dependency-types/dependency-types
   start-id   :- ::deps.dependency-types/entity-id]
  (let [start [start-type start-id]]
    (->> (graph/transitive graph [[start-type start-id]])
         (keep (fn [[node-type node-id :as node]]
                 (when (and (= node-type :card)
                            (not= node start))
                   node-id))))))

(mr/def ::column-metadata-edits [:map-of :keyword :any])
(mr/def ::card-metadata-edits [:map-of :string ::column-metadata-edits])
(mr/def ::card-list-metadata-edits [:map-of ::lib.schema.id/card ::card-metadata-edits])

(mu/defn- column-metadata-edits :- [:maybe ::column-metadata-edits]
  [editable-keys :- [:sequential :keyword]
   original      :- [:maybe :metabase.query-processor.middleware.annotate/qp-results-cased-col]
   calculated    :- [:maybe :metabase.query-processor.middleware.annotate/qp-results-cased-col]]
  (when (and original calculated)
    (-> (into {}
              (keep (fn [key]
                      (let [calculated-value (calculated key)
                            original-value (original key)]
                        (when (and calculated-value original-value
                                   (not= calculated-value original-value))
                          [key original-value]))))
              editable-keys)
        not-empty)))

(mu/defn- card-metadata-edits :- [:maybe ::card-metadata-edits]
  [mp      :- ::lib.schema.metadata/metadata-providerable
   card-id :- ::lib.schema.id/card]
  (let [card (lib.metadata/card mp card-id)
        original-metadata (:result-metadata card)
        ;; Replace the metadata provider here to ensure that it is using the correct one.
        calculated-metadata (->> card :dataset-query (lib/query mp) queries/infer-metadata)
        calculated-by-name (m/index-by :lib/deduplicated-name calculated-metadata)
        editable-keys (->> (lib/model-preserved-keys false)
                           (map u/->snake_case_en))]
    (-> (into {}
              (keep (fn [{name :lib/deduplicated-name :as original}]
                      (let [calculated (calculated-by-name name)]
                        (when-let [edits (column-metadata-edits editable-keys original calculated)]
                          [name edits]))))
              original-metadata)
        not-empty)))

(mu/defn- card-list-metadata-edits :- ::card-list-metadata-edits
  "Takes a metadata provider and a list of card ids, and finds the differences between the actual metadata in the db
  and the computed metadata we would expect to see."
  [mp       :- ::lib.schema.metadata/metadata-providerable
   card-ids :- [:sequential ::lib.schema.id/card]]
  (into {}
        (keep (fn [card-id]
                (when-let [edit-map (card-metadata-edits mp card-id)]
                  [card-id edit-map])))
        card-ids))

(mu/defn- updated-metadata
  "Given a metadata provider, card, and metadata edit map, calculate new metadata with the appropriate metadata edits.

  Takes a metadata provider because the queries' existing metadata provider may not be the one we want to use.  The
  parent function should be ensuring that the passed-in metadata provider is correct."
  [mp             :- ::lib.schema.metadata/metadata-providerable
   card           :- ::lib.schema.metadata/card
   metadata-edits :- ::card-list-metadata-edits]
  (let [new-metadata (->> card :dataset-query (lib/query mp) queries/infer-metadata)
        card-edits (metadata-edits (:id card))]
    (if (= (:type card) :model)
      (for [{name :lib/deduplicated-name :as column} new-metadata]
        (merge column (when card-edits (card-edits name))))
      new-metadata)))

(mu/defn- fresh-mp :- ::lib.schema.metadata/metadata-provider
  "Creates a 'fresh' metadata provider for the given database id with no existing cache."
  [db-id :- ::lib.schema.id/database]
  (lib-be/with-existing-metadata-provider-cache (atom (cache/basic-cache-factory {}))
    (lib-be/application-database-metadata-provider db-id)))

(mu/defn- update-dependent-mbql-cards-metadata!
  [original-mp     :- ::lib.schema.metadata/metadata-providerable
   start-type      :- ::deps.dependency-types/dependency-types
   start-id        :- ::deps.dependency-types/entity-id
   previous-object :- :any
   metadata-type   :- :keyword]
  ;; Notes on metadata providers:
  ;;
  ;; The key thing here is that lib.metadata/card caches very aggressively (as of 2026/01, at least).  Instead of
  ;; going through the normal cache mechanism, it grabs the card normally, normalizes the query, and then caches the
  ;; result using a special key.  The next time it gets called, it will check for that key first and never actually
  ;; hit the standard card fetch flow at all.  Meanwhile, override metadata providers delegate all caching to their
  ;; underlying metadata provider.  As a result, an override metadata provider and its underlying metadata provider
  ;; effectively use the same card cache.  Overriding the card doesn't affect that cache, because lib.metadata/card
  ;; will effectively ask the underlying metadata provider for the card (using that special key) without ever talking
  ;; to the override metadata provider.  Both the override metadata provider and the underlying metadata provider will
  ;; always return whichever version of that card was requested and cached first.
  ;;
  ;; The solution here is three different metadata providers.  First, we have the original metadata provider (or
  ;; really, metadata-providerable -- a query is fine here).  This doesn't have any special overrides and is used to
  ;; fetch the current state of the world before any updates that happen in this function.
  ;;
  ;; Second, we have a "pre-update" metadata provider.  This is an override metadata provider based on a "fresh"
  ;; metadata provider with no cached data.  This has overrides intended to match the state of the world before
  ;; whatever update triggered this function call.
  ;;
  ;; Third, we have a "updated" metadata provider.  This another override metadata provider based on a fresh metadata
  ;; provider, but this one has no initial overrides.  Instead, it is set to use our returned-columns logic and asked
  ;; to re-calculate all of the child cards' result metadata.  In this case, caching actually works in our favor --
  ;; the override metadata provider does ask its base provider for the original card, and this would cache the old
  ;; version of the card.  However, the override metadata provider does this during a call lib.metadata/card.  When
  ;; that "parent" call finishes, it stores the updated version of the card in the cache, and that overwrites the old
  ;; version that was previously cached.
  ;;
  ;; If we ever move to a world where model metadata edits are stored separately, we could and should use those
  ;; calculated edits instead of computing them from scratch.  However, existing models still wouldn't have edits, so
  ;; we'd need to keep the existing code around for those existing cards.  A backfill job could help here, but we'd
  ;; still need to account for cases where we just upgraded an instance and the backfill job hasn't finished yet.
  (let [db-id (-> (lib.metadata/database original-mp)
                  :id)
        graph (mbql-graph original-mp)
        cards (dependent-mbql-cards graph start-type start-id)
        previous-metadata (lib-be/instance->metadata previous-object metadata-type)
        pre-update-mp (deps.metadata-provider/override-metadata-provider
                       {:base-provider (fresh-mp db-id)
                        :updated-entities {start-type [previous-metadata]}})
        edits (card-list-metadata-edits pre-update-mp cards)
        updated-mp (deps.metadata-provider/override-metadata-provider
                    {:base-provider (fresh-mp db-id)
                     :returned-columns-fn (fn [mp card]
                                            (updated-metadata mp card edits))
                     :dependent-ids {:card cards}})
        start [start-type start-id]
        updates (->> (graph/transitive-children-of graph [start])
                     (graph/keep-children
                      (fn [[node-type node-id :as node]]
                        (when (and (= node-type :card)
                                   (not= node start))
                          (let [new-metadata (-> (lib.metadata/card updated-mp node-id)
                                                 :result-metadata)
                                old-metadata (-> (lib.metadata/card original-mp node-id)
                                                 :result-metadata)]
                            (if (= new-metadata old-metadata)
                              ::graph/stop
                              [node-id new-metadata]))))))]

    (doseq [[card-id new-metadata] updates]
      (t2/update! :model/Card card-id {:result_metadata new-metadata}))))

(derive ::update-card-dependents-metadata :metabase/event)
(derive :event/card-update ::update-card-dependents-metadata)

(methodical/defmethod events/publish-event! ::update-card-dependents-metadata
  [_ {{:keys [id dataset_query]} :object :keys [previous-object]}]
  (when (and (premium-features/has-feature? :dependencies)
             (not (lib/any-native-stage? dataset_query)))
    (update-dependent-mbql-cards-metadata! dataset_query :card id previous-object :metadata/card)))
