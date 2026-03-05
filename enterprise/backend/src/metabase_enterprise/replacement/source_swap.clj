(ns metabase-enterprise.replacement.source-swap
  (:require
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.replacement.swap.mbql :as swap.mbql]
   [metabase-enterprise.replacement.swap.native :as swap.native]
   [metabase-enterprise.replacement.util :as replacement.util]
   [metabase-enterprise.replacement.walk :as replacement.walk]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.visualization-settings :as vs]
   [metabase.queries.models.query :as queries.query]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- update-query [query old-source new-source id-updates]
  (cond-> query
    (lib/any-native-stage? query)
    (swap.native/update-native-stages old-source new-source id-updates)

    (not (lib/native-only-query? query))
    (swap.mbql/swap-mbql-stages old-source new-source)))

(defn- transform-swap-source!
  [transform old-source new-source]
  (when-let [query (get-in transform [:source :query])]
    (when (replacement.util/valid-query? query)
      (models.dependency/swap-dependency! :transform (:id transform) old-source new-source)
      (let [new-query (update-query query old-source new-source {})]
        (when (not= query new-query)
          (t2/update! :model/Transform (:id transform)
                      {:source (assoc (:source transform) :query new-query)}))))))

(defn- card-swap-source!
  [card old-source new-source]
  (when (replacement.util/valid-query? (:dataset_query card))
    (let [query  (:dataset_query card)
          query' (update-query query old-source new-source {})
          old-table-id (:table-id (queries.query/query->database-and-table-ids query))
          new-table-id (:table-id (queries.query/query->database-and-table-ids query'))
          changes (cond-> {}
                    (not= query query')
                    (assoc :dataset_query query')

                    ;; result_metadata is set to nil for native queries if not present in changes
                    (and (not= query query') (lib/native-only-query? query'))
                    (assoc :result_metadata (:result_metadata card))

                    (= (:table_id card) old-table-id)
                    (assoc :table_id new-table-id))]
      ;; no changes, so don't update
      (models.dependency/swap-dependency! :card (:id card) old-source new-source)
      (when (seq changes)
        (t2/update! :model/Card (:id card) changes)
        ;; TODO: not sure we really want this code to have to know about dependency tracking
        ;; TODO: publishing this event twice per update seems bad
        #_(events/publish-event! :event/card-update
                                 {:object (merge card changes)
                                  :user-id (:id @api/*current-user*)
                                  :previous-object card})
        ;; todo: we still want to publish the card changed event here, but we should suppress the depdency analysis
        ;; and do it ourselves. This probably should be moved higher up so it's a bit more generic than this
        ;; paritcular spot
        ))))

(defn- segment-swap-source!
  [segment old-source new-source]
  (when (replacement.util/valid-query? (:definition segment))
    (let [query     (:definition segment)
          new-query (update-query query old-source new-source {})
          old-table-id (:table-id (queries.query/query->database-and-table-ids query))
          new-table-id (:table-id (queries.query/query->database-and-table-ids new-query))
          changes (cond-> {}
                    (not= query new-query)
                    (assoc :definition new-query)

                    (= (:table_id segment) old-table-id)
                    (assoc :table_id new-table-id))]
      ;; no changes, so don't update
      (models.dependency/swap-dependency! :segment (:id segment) old-source new-source)
      (when (seq changes)
        (t2/update! :model/Segment (:id segment) changes)
        (events/publish-event! :event/segment-update
                               {:object (merge segment changes) :user-id (:id @api/*current-user*)})))))

(defn- measure-swap-source!
  [measure old-source new-source]
  (when (replacement.util/valid-query? (:definition measure))
    (let [query     (:definition measure)
          new-query (update-query query old-source new-source {})
          old-table-id (:table-id (queries.query/query->database-and-table-ids query))
          new-table-id (:table-id (queries.query/query->database-and-table-ids new-query))
          changes (cond-> {}
                    (not= query new-query)
                    (assoc :definition new-query)

                    (= (:table_id measure) old-table-id)
                    (assoc :table_id new-table-id))]
      (models.dependency/swap-dependency! :measure (:id measure) old-source new-source)
      ;; no changes, so don't update
      (when (seq changes)
        (t2/update! :model/Measure (:id measure) changes)
        (events/publish-event! :event/measure-update
                               {:object (merge measure changes) :user-id (:id @api/*current-user*)})))))

(defn- swap-parameter-target
  "Swap field refs in a parameter target to reference the new source."
  [target card-id card-id->card old-source new-source]
  (or (when-some [card (get card-id->card card-id)]
        (let [query (:dataset_query card)]
          (when (replacement.util/valid-query? query)
            (lib-be/swap-source-in-parameter-target
             query target old-source new-source))))
      target))

(defn- dashcard-swap-source!
  [dashcard card-id->card old-source new-source]
  (let [update-fn           #(swap-parameter-target %1 %2 card-id->card old-source new-source)
        parameter-mappings  (:parameter_mappings dashcard)
        parameter-mappings' (replacement.walk/walk-parameter-mapping-targets parameter-mappings update-fn)
        viz-settings        (:visualization_settings dashcard)
        viz-settings'       (some-> viz-settings
                                    vs/db->norm
                                    (replacement.walk/walk-viz-settings-click-behaviors update-fn)
                                    vs/norm->db)
        changes (cond-> {}
                  (not= parameter-mappings parameter-mappings')
                  (assoc :parameter_mappings parameter-mappings')
                  (not= viz-settings viz-settings')
                  (assoc :visualization_settings viz-settings'))]
    (when (seq changes)
      (t2/update! :model/DashboardCard (:id dashcard) changes))))

(defn- dashboard-swap-source!
  [dashboard-id old-source new-source]
  (let [dashcards      (t2/select :model/DashboardCard :dashboard_id dashboard-id)
        all-card-ids   (into #{}
                             (mapcat (fn [dashcard]
                                       (concat
                                        (replacement.walk/parameter-mapping-card-ids (:parameter_mappings dashcard))
                                        (replacement.walk/viz-settings-click-behavior-card-ids (-> dashcard :visualization_settings vs/db->norm)))))
                             dashcards)
        card-id->card (if (seq all-card-ids)
                        (t2/select-pk->fn identity :model/Card :id [:in all-card-ids])
                        {})]
    (doseq [dashcard dashcards]
      (dashcard-swap-source! dashcard card-id->card old-source new-source))
    (events/publish-event! :event/dashboard-update {:object  (t2/select-one :model/Dashboard
                                                                            :id dashboard-id)
                                                    :user-id (:id @api/*current-user*)})))

(defn swap-source!
  "Swap old-source to new-source in an entity.

  `entity-ref` is a [type id] tuple like [:card 123] or [:dashboard 456].
  `entity` is an optional pre-fetched entity. Dashboards don't use `entity`."
  ([entity-ref old-source new-source]
   (let [[entity-type entity-id] entity-ref]
     (swap-source! entity-ref
                   (case entity-type
                     :card      (t2/select-one :model/Card :id entity-id)
                     :transform (t2/select-one :model/Transform :id entity-id)
                     :segment   (t2/select-one :model/Segment :id entity-id)
                     :measure   (t2/select-one :model/Measure :id entity-id)
                     nil)
                   old-source new-source)))
  ([[entity-type entity-id] entity old-source new-source]
   (case entity-type
     :card      (card-swap-source!      entity old-source new-source)
     :transform (transform-swap-source! entity old-source new-source)
     :segment   (segment-swap-source!   entity old-source new-source)
     :measure   (measure-swap-source!   entity old-source new-source)
     :dashboard (dashboard-swap-source! entity-id old-source new-source)
     nil)))
