(ns metabase-enterprise.replacement.source-swap
  (:require
   [metabase-enterprise.replacement.swap.mbql :as swap.mbql]
   [metabase-enterprise.replacement.swap.native :as swap.native]
   [metabase-enterprise.replacement.swap.viz :as swap.viz]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [toucan2.core :as t2]))

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
          new-query (update-query query old-source new-source {})
          updated   (assoc card :dataset_query new-query)]
      ;; no changes, so don't update
      (when (not= query new-query)
        (t2/update! :model/Card entity-id {:dataset_query new-query})
        ;; TODO: not sure we really want this code to have to know about dependency tracking
        ;; TODO: publishing this event twice per update seems bad
        (events/publish-event! :event/card-dependency-backfill
                               {:object updated}))
      (swap.viz/dashboard-card-update-field-refs! entity-id new-query old-source new-source))))

(defn swap!
  [[entity-type _entity-id :as entity] old-source new-source]
  (case entity-type
    :card      (card-swap!      entity old-source new-source)
    :transform (transform-swap! entity old-source new-source)))
