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

(mr/def ::node [:tuple ::deps.dependency-types/dependency-types ::deps.dependency-types/entity-id])

(mr/def ::child-map [:map-of ::node [:sequential ::node]])

(mu/defn- all-mbql-children :- ::child-map
  [mp         :- ::lib.schema.metadata/metadata-providerable
   start-type :- ::deps.dependency-types/dependency-types
   start-id   :- ::deps.dependency-types/entity-id]
  (let [graph (models.dependency/filtered-graph-dependents
               nil
               (fn [type-field _id-field]
                 [:and
                  [:not= type-field "transform"]
                  [:not= type-field "snippet"]
                  [:not= type-field "dashboard"]
                  [:not= type-field "document"]]))
        start [start-type start-id]]
    (loop [to-traverse #{start}
           child-map {}]
      (let [new-children (->> (graph/children-of graph to-traverse)
                              (m/map-vals (fn [children]
                                            (remove (fn [[type id :as child]]
                                                      (and (= type :card)
                                                           (-> (lib.metadata/card mp id)
                                                               :dataset-query
                                                               lib/any-native-stage?)))
                                                    children))))
            new-traverse (into #{}
                               (comp (remove child-map) cat)
                               (vals new-children))
            new-child-map (into child-map new-children)]
        (if (seq new-traverse)
          (recur new-traverse new-child-map)
          new-child-map)))))

(mu/defn- do-for-card-children
  [thunk
   children   :- ::child-map
   start-type :- ::deps.dependency-types/dependency-types
   start-id   :- ::deps.dependency-types/entity-id]
  (let [all-nodes (-> (into #{}
                            (mapcat (fn [[parent current-children]]
                                      (conj current-children parent)))
                            children)
                      sort)
        full-parent-map (->> children
                             (mapcat (fn [[parent current-children]]
                                       (map (fn [child]
                                              {child #{parent}})
                                            current-children)))
                             (apply merge-with into))
        start [start-type start-id]]
    (loop [nodes-remaining all-nodes
           parent-map full-parent-map
           ignored #{}]
      (when-let [[node-type node-id :as next-node] (some #(when-not (or (seq (parent-map %))
                                                                        (ignored %))
                                                            %)
                                                         nodes-remaining)]
        (let [result (or (not= node-type :card)
                         (= next-node start)
                         (thunk node-id))
              new-nodes-remaining (remove #(= % next-node) nodes-remaining)]
          (if result
            (recur new-nodes-remaining
                   (m/map-vals #(disj % next-node) parent-map)
                   ignored)
            (recur new-nodes-remaining
                   parent-map
                   (conj ignored next-node))))))))

(mu/defn- dependent-mbql-cards :- [:sequential ::lib.schema.id/card]
  [children   :- ::child-map
   start-type :- ::deps.dependency-types/dependency-types
   start-id   :- ::deps.dependency-types/entity-id]
  (let [nodes (atom [])]
    (do-for-card-children #(swap! nodes conj %) children start-type start-id)
    @nodes))

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

  Takes a metadata provider because the queries' existing metadata provider may have an out of date cache.  The parent
  function should be ensuring that the passed-in metadata provider is fully up to date."
  [mp             :- ::lib.schema.metadata/metadata-providerable
   card           :- ::lib.schema.metadata/card
   metadata-edits :- ::card-list-metadata-edits]
  (let [new-metadata (->> card :dataset-query (lib/query mp) queries/infer-metadata)
        card-edits (metadata-edits (:id card))]
    (if (= (:type card) :model)
      (for [{name :lib/deduplicated-name :as column} new-metadata]
        (merge column (when card-edits (card-edits name))))
      new-metadata)))

(defn- fresh-mp
  "Creates a 'fresh' metadata provider for the given database id with no existing cache."
  [db-id]
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
  ;; The key thing here is that lib.metadata/card caches very aggressively (as of 2025/01, at least).  Instead of
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
  ;; Second, we have a "pre-update" metadata provider.  This is an override metadata provider based on a "fresh" metadata provider with no cached data.  This is intended to match the state of the world before whatever update triggered this function call.
  ;;
  ;; Third, we have a "updated" metadata provider.  This a fresh metadata provider with no cached data that is only
  ;; ever used to fetch metadata for cards after they have been updated by this function.  Because of caching, if you
  ;; ever ask it to fetch a card before it was updated, this function will get confused and likely break.
  ;;
  ;; If we ever move to a world where model metadata edits are stored separately, we could and should use those
  ;; calculated edits instead of computing them from scratch.  However, that would probably involve a backfill job and
  ;; so we'd need to keep the existing code around to handle cases where the backfill job hasn't updated a card yet.
  (let [db-id (-> (lib.metadata/database original-mp)
                  :id)
        children (all-mbql-children original-mp start-type start-id)
        cards (dependent-mbql-cards children start-type start-id)
        previous-metadata (lib-be/instance->metadata previous-object metadata-type)
        pre-update-mp (deps.metadata-provider/override-metadata-provider
                       (fresh-mp db-id)
                       {start-type [previous-metadata]}
                       nil)
        ;; compute metadata edits based on the pre-update state of the world
        edits (card-list-metadata-edits pre-update-mp cards)
        updated-mp (fresh-mp db-id)
        editable-keys (editable-model-keys)]
    (do-for-card-children
     (fn [card-id]
       ;; use original-mp to fetch the current card here because we haven't updated it
       (let [card (lib.metadata/card original-mp card-id)
             ;; when computing new metadata, pass in updated-mp so that the qp uses the new versions of updated cards.
             new-metadata (updated-metadata updated-mp card edits)]
         (when-not (= new-metadata (:result-metadata card))
           (t2/update! :model/Card card-id {:result_metadata new-metadata})
           true)))
     children
     start-type
     start-id)))

(derive ::update-card-dependents-metadata :metabase/event)
(derive :event/card-update ::update-card-dependents-metadata)

(methodical/defmethod events/publish-event! ::update-card-dependents-metadata
  [_ {{:keys [id dataset_query]} :object :keys [previous-object]}]
  (when (and (premium-features/has-feature? :dependencies)
             (not (lib/any-native-stage? dataset_query)))
    (update-dependent-mbql-cards-metadata! dataset_query :card id previous-object :metadata/card)))

(comment
  (def mp (metabase.lib-be.core/application-database-metadata-provider 2))
  (let [mp (metabase.lib-be.core/application-database-metadata-provider 1)
        card (lib.metadata/card mp 1750)
        edits (card-list-metadata-edits mp [1749 1750 1751])]
    (updated-metadata mp card edits)))
