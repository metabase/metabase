(ns metabase-enterprise.replacement.source-swap
  (:require
   [metabase-enterprise.replacement.swap.mbql :as swap.mbql]
   [metabase-enterprise.replacement.swap.native :as swap.native]
   [metabase-enterprise.replacement.swap.viz :as swap.viz]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [toucan2.core :as t2]))

(defn- ultimate-table-id
  [mp [source-type source-id]]
  (case source-type
    :table
    source-id

    :card
    (:table-id (lib.metadata/card mp source-id))))

(defn- update-query [query old-source new-source id-updates]
  (cond-> query
    (lib/any-native-stage? query)
    (swap.native/update-native-stages old-source new-source id-updates)

    (not (lib/native-only-query? query))
    (swap.mbql/swap-mbql-stages old-source new-source)))

(defn- transform-swap!
  [[entity-type entity-id] old-source new-source]
  (assert (= :transform entity-type))
  (let [transform (t2/select-one :model/Transform :id entity-id)]
    (when-let [query (get-in transform [:source :query])]
      (let [new-query (update-query query old-source new-source {})]
        (when (not= query new-query)
          (t2/update! :model/Transform entity-id
                      {:source (assoc (:source transform) :query new-query)}))))))

(defn- card-swap!
  [[entity-type entity-id] old-source new-source]
  (assert (= :card entity-type))
  (let [card (t2/select-one :model/Card :id entity-id)]
    (assert (some? card))
    (let [query (:dataset_query card)
          query' (update-query query old-source new-source {})
          changes (cond-> {}
                    (not= query query')
                    (assoc :dataset_query query')

                    (= (:table_id card) (ultimate-table-id query old-source))
                    (assoc :table_id    (ultimate-table-id query new-source)))]
      ;; no changes, so don't update
      (when (seq changes)
        (t2/update! :model/Card entity-id changes)
        ;; TODO: not sure we really want this code to have to know about dependency tracking
        ;; TODO: publishing this event twice per update seems bad
        (events/publish-event! :event/card-update
                               {:object (merge card changes)
                                :user-id (:id @api/*current-user*)
                                :previous-object card}))
      (swap.viz/dashboard-card-update-field-refs! entity-id query' old-source new-source))))

(defn- segment-swap!
  [[entity-type entity-id] old-source new-source]
  (assert (= :segment entity-type))
  (let [segment (t2/select-one :model/Segment entity-id)]
    (assert (some? segment))
    (let [query (:definition segment)
          new-query (update-query query old-source new-source {})
          table  (:table_id segment)
          table' (ultimate-table-id query new-source)
          changes (cond-> {}
                    (not= query new-query)
                    (assoc :definition new-query)

                    (= table (ultimate-table-id query old-source))
                    (assoc :table_id table'))]
      ;; no changes, so don't update
      (when (seq changes)
        (t2/update! :model/Segment entity-id changes)
        (events/publish-event! :event/segment-update
                               {:object (merge segment changes) :user-id (:id @api/*current-user*)})))))

(defn- measure-swap!
  [[entity-type entity-id] old-source new-source]
  (assert (= :measure entity-type))
  (let [measure (t2/select-one :model/Measure entity-id)]
    (assert (some? measure))
    (let [query (:definition measure)
          new-query (update-query query old-source new-source {})
          table  (:table_id measure)
          table' (ultimate-table-id query new-source)
          changes (cond-> {}
                    (not= query new-query)
                    (assoc :definition new-query)

                    (= table (ultimate-table-id query old-source))
                    (assoc :table_id table'))]
      ;; no changes, so don't update
      (when (seq changes)
        (t2/update! :model/Measure entity-id changes)
        (events/publish-event! :event/measure-update
                               {:object (merge measure changes) :user-id (:id @api/*current-user*)})))))

(defn swap!
  [[entity-type _entity-id :as entity] old-source new-source]
  (case entity-type
    :card      (card-swap!      entity old-source new-source)
    :transform (transform-swap! entity old-source new-source)
    :segment   (segment-swap!   entity old-source new-source)
    :measure   (measure-swap!   entity old-source new-source)
    :dashboard nil))
