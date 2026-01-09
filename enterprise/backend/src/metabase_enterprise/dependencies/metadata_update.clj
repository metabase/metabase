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

(mu/defn- all-children :- ::child-map
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

(mu/defn- order-children :- [:sequential ::node]
  [children :- ::child-map]
  (let [all-nodes (into #{}
                        (mapcat (fn [[parent current-children]]
                                  (conj current-children parent)))
                        children)
        full-parent-map (->> children
                             (mapcat (fn [[parent current-children]]
                                       (map (fn [child]
                                              {child #{parent}})
                                            current-children)))
                             (apply merge-with into))]
    (loop [nodes-remaining all-nodes
           parent-map full-parent-map
           nodes-list []]
      (let [next-nodes (->> nodes-remaining
                            (remove (comp seq parent-map))
                            vec
                            sort)]
        (if (seq next-nodes)
          (recur (apply disj nodes-remaining next-nodes)
                 (m/map-vals #(apply disj % next-nodes) parent-map)
                 (into nodes-list next-nodes))
          nodes-list)))))

(mu/defn- dependent-mbql-cards :- [:sequential ::lib.schema.id/card]
  [mp         :- ::lib.schema.metadata/metadata-providerable
   start-type :- ::deps.dependency-types/dependency-types
   start-id   :- ::deps.dependency-types/entity-id]
  (let [children (all-children mp start-type start-id)
        nodes-in-order (order-children children)
        start [start-type start-id]]
    (keep (fn [[type id :as child]]
            (when (and (= type :card)
                       (not= child start))
              id))
          nodes-in-order)))

(mr/def ::column-overrides [:map-of :keyword :any])
(mr/def ::card-overrides [:map-of :string ::column-overrides])
(mr/def ::card-list-overrides [:map-of ::lib.schema.id/card ::card-overrides])

(mu/defn- column-overrides :- [:maybe ::column-overrides]
  [overrideable-keys :- [:sequential :keyword]
   original          :- [:maybe :metabase.query-processor.middleware.annotate/qp-results-cased-col]
   calculated        :- [:maybe :metabase.query-processor.middleware.annotate/qp-results-cased-col]]
  (when (and original calculated)
    (-> (into {}
              (keep (fn [key]
                      (let [calculated-value (calculated key)
                            original-value (original key)]
                        (when (and calculated-value original-value
                                   (not= calculated-value original-value))
                          [key original-value]))))
              overrideable-keys)
        not-empty)))

(mu/defn- card-overrides :- [:maybe ::card-overrides]
  [mp      :- ::lib.schema.metadata/metadata-providerable
   card-id :- ::lib.schema.id/card]
  (let [card (lib.metadata/card mp card-id)
        original-metadata (:result-metadata card)
        calculated-metadata (->> card :dataset-query (lib/query mp) queries/infer-metadata)
        calculated-by-name (m/index-by :lib/deduplicated-name calculated-metadata)
        overrideable-keys (->> (lib/model-preserved-keys false)
                               (map u/->snake_case_en))]
    (-> (into {}
              (keep (fn [{name :lib/deduplicated-name :as original}]
                      (let [calculated (calculated-by-name name)]
                        (when-let [overrides (column-overrides overrideable-keys original calculated)]
                          [name overrides]))))
              original-metadata)
        not-empty)))

(mu/defn- card-list-overrides :- ::card-list-overrides
  [mp       :- ::lib.schema.metadata/metadata-providerable
   card-ids :- [:sequential ::lib.schema.id/card]]
  (into {}
        (keep (fn [card-id]
                (when-let [override-map (card-overrides mp card-id)]
                  [card-id override-map])))
        card-ids))

(mu/defn- updated-metadata
  "Given a metadata provider, card, and override map, calculate new metadata with the appropriate overrides.

  Takes a metadata provider because the queries' existing metadata provider may have an out of date cache.  The parent
  function should be ensuring that the passed-in metadata provider is correct."
  [mp        :- ::lib.schema.metadata/metadata-providerable
   card
   overrides :- ::card-list-overrides]
  (let [new-metadata (->> card :dataset_query (lib/query mp) queries/infer-metadata)
        card-overrides (overrides (:id card))]
    (if (= (:type card) :model)
      (for [{name :lib/deduplicated-name :as column} new-metadata]
        (merge column (when card-overrides (card-overrides name))))
      new-metadata)))

(defn- fresh-mp [db-id]
  (lib-be/with-existing-metadata-provider-cache (atom (cache/basic-cache-factory {}))
    (lib-be/application-database-metadata-provider db-id)))

(mu/defn- update-dependent-mbql-cards-metadata!
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   start-type            :- ::deps.dependency-types/dependency-types
   start-id              :- ::deps.dependency-types/entity-id
   previous-object       :- :any
   metadata-type         :- :keyword]
  ;; Use an empty metadata provider cache to ensure we get a fresh metadata provider with no old data cached
  (lib-be/with-existing-metadata-provider-cache (atom (cache/basic-cache-factory {}))
    (let [db-id (-> (lib.metadata/database metadata-providerable)
                    :id)
          previous-metadata (lib-be/instance->metadata previous-object metadata-type)
          old-mp (deps.metadata-provider/override-metadata-provider
                  (fresh-mp db-id)
                  {:card [previous-metadata]}
                  nil)
          cards (dependent-mbql-cards old-mp start-type start-id)
          overrides (card-list-overrides old-mp cards)
          new-mp (deps.metadata-provider/override-metadata-provider (fresh-mp db-id))]
      (doseq [card-id cards]
        (let [card (t2/select-one [:model/Card :id :type :dataset_query :card_schema] :id card-id)
              new-metadata (updated-metadata new-mp card overrides)]
          (t2/update! :model/Card card-id {:result_metadata new-metadata})
          (deps.metadata-provider/add-override new-mp :card card-id
                                               (assoc card :result-metadata new-metadata)))))))

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
        overrides (card-list-overrides mp [1749 1750 1751])]
    (updated-metadata mp card overrides)))
