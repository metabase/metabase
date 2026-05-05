(ns metabase-enterprise.replacement.source-swap
  "Swap sources namespace. Entrypoint is [[swap-source!]]. Internally, we rely on the field references having been
  already upgraded. Then we only have to swap concrete usages.

  We also need to update dependencies, which we do in two ways. We explicitly
  call [[models.dependency/swap-dependency!]] regardless of whether the query actually changed (dependency edges may
  shift even without query text changes). Then we fire the entity's update event only when actual changes occurred;
  the event handler will redo dependency calculation, but also triggers other necessary side-effects like revisions.
  This means dependency analysis runs twice when there are changes, which is intentional: suppressing the event
  handler's dependency work would be complicated and could risk the dep graph getting out of sync. If we measure a
  performance problem here, that would be a good optimization step. In practice most swaps don't change queries
  (the table was already upgraded and the query references are the same), so this is rarely an issue."
  (:require
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.replacement.util :as replacement.util]
   [metabase-enterprise.replacement.walk :as replacement.walk]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.models.visualization-settings :as vs]
   [metabase.queries.models.query :as queries.query]
   [metabase.source-swap.core :as source-swap]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- transform-swap-source!
  [transform old-source new-source]
  (when-let [query (get-in transform [:source :query])]
    (when (replacement.util/valid-query? query)
      (let [query'  (source-swap/swap-source-in-query query old-source new-source)
            changes (cond-> {}
                      (not= query query')
                      (assoc :source (assoc (:source transform) :query query')))]
        (models.dependency/swap-dependency! :transform (:id transform) old-source new-source)
        (when (seq changes)
          (t2/update! :model/Transform (:id transform) changes)
          (events/publish-event! :event/transform-update
                                 {:object (merge transform changes) :user-id api/*current-user-id*}))))))

(defn- card-swap-source!
  [card old-source new-source]
  (when (replacement.util/valid-query? (:dataset_query card))
    (let [query     (:dataset_query card)
          query'    (source-swap/swap-source-in-query query old-source new-source)
          table-id  (:table_id card)
          table-id' (:table-id (queries.query/query->database-and-table-ids query'))
          changes   (cond-> {}
                      (not= query query')
                      (assoc :dataset_query query')

                      (not= table-id table-id')
                      (assoc :table_id table-id'))
          ;; `:result_metadata` is set to nil for native queries if not present in changes.
          ;; `verified-result-metadata?` prevents the Card model hooks from clearing it.
          changes   (cond-> changes
                      (and (seq changes)
                           (lib/native-only-query? query'))
                      (assoc :result_metadata (:result_metadata card)
                             :verified-result-metadata? true))]
      (models.dependency/swap-dependency! :card (:id card) old-source new-source)
      (when (seq changes)
        (t2/update! :model/Card (:id card) changes)
        (events/publish-event! :event/card-update
                               {:object (merge card changes)
                                :user-id api/*current-user-id*
                                :previous-object card})))))

(defn- segment-swap-source!
  [segment old-source new-source]
  (when (replacement.util/valid-query? (:definition segment))
    (let [query     (:definition segment)
          query'    (source-swap/swap-source-in-query query old-source new-source)
          table-id  (:table_id segment)
          table-id' (:table-id (queries.query/query->database-and-table-ids query'))
          changes   (cond-> {}
                      (not= query query')
                      (assoc :definition query')
                      (not= table-id table-id')
                      (assoc :table_id table-id'))]
      (models.dependency/swap-dependency! :segment (:id segment) old-source new-source)
      (when (seq changes)
        (t2/update! :model/Segment (:id segment) changes)
        (events/publish-event! :event/segment-update
                               {:object (merge segment changes) :user-id api/*current-user-id*})))))

(defn- measure-swap-source!
  [measure old-source new-source]
  (when (replacement.util/valid-query? (:definition measure))
    (let [query     (:definition measure)
          query'    (source-swap/swap-source-in-query query old-source new-source)
          table-id  (:table_id measure)
          table-id' (:table-id (queries.query/query->database-and-table-ids query'))
          changes   (cond-> {}
                      (not= query query')
                      (assoc :definition query')
                      (not= table-id table-id')
                      (assoc :table_id table-id'))]
      (models.dependency/swap-dependency! :measure (:id measure) old-source new-source)
      (when (seq changes)
        (t2/update! :model/Measure (:id measure) changes)
        (events/publish-event! :event/measure-update
                               {:object (merge measure changes) :user-id api/*current-user-id*})))))

(defn- swap-parameter-target
  "Swap field refs in a parameter target to reference the new source."
  [target card-id card-id->card old-source new-source]
  (or (when-some [card (get card-id->card card-id)]
        (let [query (:dataset_query card)]
          (when (replacement.util/valid-query? query)
            (source-swap/swap-source-in-parameter-target
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
  [dashboard old-source new-source]
  (let [dashcards      (t2/select :model/DashboardCard :dashboard_id (:id dashboard))
        all-card-ids   (into #{}
                             (mapcat (fn [dashcard]
                                       (concat
                                        (replacement.walk/parameter-mapping-card-ids
                                         (:parameter_mappings dashcard))
                                        (replacement.walk/viz-settings-click-behavior-card-ids
                                         (-> dashcard :visualization_settings vs/db->norm)))))
                             dashcards)
        card-id->card (if (seq all-card-ids)
                        (t2/select-pk->fn identity :model/Card :id [:in all-card-ids])
                        {})
        any-changed? (reduce (fn [changed? dashcard]
                               (or
                                (dashcard-swap-source! dashcard card-id->card old-source new-source)
                                changed?))
                             false
                             dashcards)]
    (when any-changed?
      (events/publish-event!
       :event/dashboard-update {:object  (t2/select-one :model/Dashboard :id (:id dashboard))
                                :user-id api/*current-user-id*}))))

(defn swap-source!
  "Swap old-source to new-source in an entity.

  `entity-ref` is a [type id] tuple like [:card 123] or [:dashboard 456].
  `entity` is an optional pre-fetched entity.."
  ([[entity-type entity-id :as entity-ref] old-source new-source]
   (swap-source! entity-ref
                 (case entity-type
                   :card      (t2/select-one :model/Card :id entity-id)
                   :transform (t2/select-one :model/Transform :id entity-id)
                   :segment   (t2/select-one :model/Segment :id entity-id)
                   :measure   (t2/select-one :model/Measure :id entity-id)
                   :dashboard (t2/select-one :model/Dashboard :id entity-id)
                   nil)
                 old-source new-source))
  ([[entity-type _entity-id] entity old-source new-source]
   (case entity-type
     :card      (card-swap-source!      entity old-source new-source)
     :transform (transform-swap-source! entity old-source new-source)
     :segment   (segment-swap-source!   entity old-source new-source)
     :measure   (measure-swap-source!   entity old-source new-source)
     :dashboard (dashboard-swap-source! entity old-source new-source)
     nil)))
