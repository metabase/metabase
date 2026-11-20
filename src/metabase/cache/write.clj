(ns metabase.cache.write
  "The write functions of CacheConfigs, through which every writer creates, updates and deletes them."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.cache.db :as cache.db]
   [metabase.cache.schema :as cache.schema]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- changed
  "The columns of `changes` whose values differ from those of `cache-config`."
  [cache-config changes]
  (into {} (remove (fn [[k v]] (= v (get cache-config k)))) changes))

(mu/defn create-cache-config! :- ms/PositiveInt
  "Insert `cache-config`, whose after-insert hook publishes its create event, returning its id; for `store-cache-config!`
  and the REST API."
  [cache-config :- ::cache.schema/cache-config.create]
  (events/with-batched-events
    (cache.db/insert-cache-config! cache-config)))

(mu/defn update-cache-config! :- :int
  "Apply `changes` to `cache-config-or-id`, a CacheConfig the caller already loaded or the id of one, and publish its
  update event, returning the number of CacheConfigs updated; for `store-cache-config!`, the cache refresh task and the
  SerDes import."
  [cache-config-or-id :- [:or ms/PositiveInt :map]
   changes            :- ::cache.schema/cache-config.update
   _opts              :- ::cache.schema/write-opts]
  (let [cache-config (if (map? cache-config-or-id) cache-config-or-id (cache.db/cache-config cache-config-or-id))
        changes      (when cache-config (changed cache-config changes))]
    (if (empty? changes)
      0
      (do
        (when (or (contains? changes :model) (contains? changes :model_id))
          (throw (ex-info (tru "You cannot change the target of a cache configuration.") {:status-code 400})))
        (let [changes (cond-> changes
                        (not (contains? changes :updated_at)) (assoc :updated_at (mi/now)))]
          (events/with-batched-events
            (u/prog1 (cache.db/update-cache-config! (:id cache-config) changes)
              (events/updated! :model/CacheConfig (merge cache-config changes) cache-config))))))))

(mu/defn delete-cache-configs! :- :int
  "Delete the CacheConfigs with `ids` and publish their delete events, returning the number deleted; for the REST API and
  the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::cache.schema/write-opts]
  (let [cache-configs (when (seq ids) (cache.db/cache-configs-by-ids ids))]
    (if (empty? cache-configs)
      0
      (events/with-batched-events
        (events/deleting! :model/CacheConfig cache-configs
                          #(cache.db/delete-cache-configs! (mapv :id cache-configs)))))))

(mu/defn delete-target-configs! :- :int
  "Delete the CacheConfigs targeting the `model` entities with `model-ids`, which are being deleted; for the delete of
  a Database, Dashboard or Card."
  [model     :- ::cache.schema/cache-config.model
   model-ids :- [:sequential ms/IntGreaterThanOrEqualToZero]]
  (if (seq model-ids)
    (delete-cache-configs! (mapv :id (cache.db/cache-configs-for model (vec model-ids))) {})
    0))

(mu/defn store-cache-config! :- ms/PositiveInt
  "Update the CacheConfig for `model` and `model-id` to `data`, or create it when there is none, returning its id; for
  the REST API."
  [model    :- ::cache.schema/cache-config.model
   model-id :- ms/IntGreaterThanOrEqualToZero
   data     :- ::cache.schema/cache-config.update]
  (mdb/with-conflict-retry
    (if-let [existing (first (cache.db/cache-configs-for model [model-id]))]
      (do (update-cache-config! existing data {})
          (:id existing))
      (t2/with-transaction [_conn]
        (create-cache-config! (merge data {:model model :model_id model-id}))))))

(defmethod mi/write-fns :model/CacheConfig
  [_model]
  {:update! update-cache-config!
   :delete! delete-cache-configs!})
