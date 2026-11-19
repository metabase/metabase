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
   [metabase-enterprise.replacement.db :as replacement.db]
   [metabase-enterprise.replacement.entity :as replacement.entity]
   [metabase.events.core :as events]
   [metabase.queries.models.query :as queries.query]
   [metabase.replacement.core :as replacement]
   [metabase.replacement.util :as replacement.util]
   [metabase.replacement.walk :as replacement.walk]))

(set! *warn-on-reflection* true)

(defn- transform-swap-source!
  [transform old-source new-source]
  (when-let [query (get-in transform [:source :query])]
    (when (replacement.util/valid-query? query)
      (let [query'  (replacement/swap-source-in-query query old-source new-source)
            changes (cond-> {}
                      (not= query query')
                      (assoc :source (assoc (:source transform) :query query')))]
        (models.dependency/swap-dependency! :transform (:id transform) old-source new-source)
        (when (seq changes)
          (replacement.db/update-transform! (:id transform) changes))))))

(defn- swap-parameter-source-card-id
  "For a parameters collection, replace `values_source_config.card_id` references to `old-source-id` with
  `new-source-id`. Only applies to card-to-card swaps; returns parameters unchanged for any other swap shape
  (e.g. card-to-table)."
  [parameters [old-source-type old-source-id] [new-source-type new-source-id]]
  (letfn [(swap-card-id [card-id]
            (if (and (= :card old-source-type)
                     (= :card new-source-type)
                     (= old-source-id card-id))
              new-source-id
              card-id))]
    (replacement.walk/walk-parameter-source-card-ids (or parameters []) swap-card-id)))

(defn- segment-swap-source!
  [segment old-source new-source]
  (when (replacement.util/valid-query? (:definition segment))
    (let [query     (:definition segment)
          query'    (replacement/swap-source-in-query query old-source new-source)
          table-id  (:table_id segment)
          table-id' (:table-id (queries.query/query->database-and-table-ids query'))
          changes   (cond-> {}
                      (not= query query')
                      (assoc :definition query')
                      (not= table-id table-id')
                      (assoc :table_id table-id'))]
      (models.dependency/swap-dependency! :segment (:id segment) old-source new-source)
      (when (seq changes)
        (replacement.db/update-segment! (:id segment) changes)))))

(defn- measure-swap-source!
  [measure old-source new-source]
  (when (replacement.util/valid-query? (:definition measure))
    (let [query     (:definition measure)
          query'    (replacement/swap-source-in-query query old-source new-source)
          table-id  (:table_id measure)
          table-id' (:table-id (queries.query/query->database-and-table-ids query'))
          changes   (cond-> {}
                      (not= query query')
                      (assoc :definition query')
                      (not= table-id table-id')
                      (assoc :table_id table-id'))]
      (models.dependency/swap-dependency! :measure (:id measure) old-source new-source)
      (when (seq changes)
        (replacement.db/update-measure! (:id measure) changes)))))

(defn- swap-parameter-target
  "Swap field refs in a parameter target to reference the new source."
  [target card-id card-id->card old-source new-source]
  (or (when-some [card (get card-id->card card-id)]
        (let [query (:dataset_query card)]
          (when (replacement.util/valid-query? query)
            (replacement/swap-source-in-parameter-target
             query target old-source new-source))))
      target))

(defn- dashcard-swap-source!
  [dashcard card-id->card old-source new-source]
  (let [update-fn           #(swap-parameter-target %1 %2 card-id->card old-source new-source)
        parameter-mappings  (:parameter_mappings dashcard)
        parameter-mappings' (replacement.walk/walk-parameter-mapping-targets parameter-mappings update-fn)
        viz-settings        (:visualization_settings dashcard)
        viz-settings'       (some-> viz-settings
                                    (replacement.walk/walk-viz-settings-click-behaviors update-fn))
        changes (cond-> {}
                  (not= parameter-mappings parameter-mappings')
                  (assoc :parameter_mappings parameter-mappings')
                  (not= viz-settings viz-settings')
                  (assoc :visualization_settings viz-settings'))]
    (when (seq changes)
      (replacement.db/update-dashboard-card! (:id dashcard) changes))))

(defn- dashboard-swap-source!
  [dashboard old-source new-source]
  (let [dashcards      (replacement.db/dashboard-cards (:id dashboard))
        all-card-ids   (into #{}
                             (mapcat (fn [dashcard]
                                       (concat
                                        (replacement.walk/parameter-mapping-card-ids
                                         (:parameter_mappings dashcard))
                                        (replacement.walk/viz-settings-click-behavior-card-ids
                                         (:visualization_settings dashcard)))))
                             dashcards)
        card-id->card (if (seq all-card-ids)
                        (replacement.db/cards-by-id all-card-ids)
                        {})
        _             (run! #(dashcard-swap-source! % card-id->card old-source new-source) dashcards)
        parameters    (or (:parameters dashboard) [])
        parameters'   (swap-parameter-source-card-id parameters old-source new-source)
        params-changed? (not= parameters parameters')]
    (when params-changed?
      (replacement.db/update-dashboard! (:id dashboard) {:parameters parameters'}))
    nil))

(defn- swap-source-by-spec!
  "Apply the writes of the `:swap-source` of the replacement spec of `entity-type` to `row`, if any, first moving the
  row's dependency on `old-source` to `new-source` when the spec says so."
  [entity-type row old-source new-source]
  (let [spec (replacement.entity/entity-spec entity-type)]
    (when-let [swap (and row (:swap-source spec))]
      (when-some [writes (swap (replacement.entity/hydrated spec row) old-source new-source)]
        (when (:swap-dependency? spec)
          (models.dependency/swap-dependency! entity-type (:id row) old-source new-source))
        (replacement.entity/apply-writes! writes)))))

(defn swap-source!
  "Swap old-source to new-source in an entity.

  `entity-ref` is a [type id] tuple like [:card 123] or [:dashboard 456].
  `entity` is an optional pre-fetched entity.."
  ([[entity-type entity-id :as entity-ref] old-source new-source]
   (swap-source! entity-ref
                 (case entity-type
                   :card      (replacement.entity/row entity-ref)
                   :transform (replacement.db/transform entity-id)
                   :segment   (replacement.db/segment entity-id)
                   :measure   (replacement.db/measure entity-id)
                   :dashboard (replacement.db/dashboard entity-id)
                   nil)
                 old-source new-source))
  ([[entity-type _entity-id] entity old-source new-source]
   (events/with-batched-events
     (case entity-type
       :card      (swap-source-by-spec!   entity-type entity old-source new-source)
       :transform (transform-swap-source! entity old-source new-source)
       :segment   (segment-swap-source!   entity old-source new-source)
       :measure   (measure-swap-source!   entity old-source new-source)
       :dashboard (dashboard-swap-source! entity old-source new-source)
       nil))))
