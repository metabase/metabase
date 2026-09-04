(ns metabase.cache.models.cache-config
  "A model representing cache configuration."
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.app-db.core :as app-db]
   [metabase.cache.db :as cache.db]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; TODO (Cam 10/3/25) -- change these to keywords and let API coercion convert them for us automatically
(def CachingModel "Caching is configurable for those models" [:enum "root" "database" "dashboard" "question"])

(def ^:private available-sort-columns
  "Valid columns for sorting cache configs."
  #{:name :collection :policy})

(def SortParams
  "Schema for sort parameters."
  [:map
   [:sort_column    {:default :name} (into [:enum] available-sort-columns)]
   [:sort_direction {:default :asc}  [:enum :asc :desc]]])

(doto :model/CacheConfig
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/table-name :model/CacheConfig [_model] :cache_config)

(t2/deftransforms :model/CacheConfig
  {:strategy mi/transform-keyword
   :config   mi/transform-json
   :state    mi/transform-json})

(defn- target-collection-id
  "Get the collection_id for the target entity of a CacheConfig."
  [{:keys [model model_id]}]
  (case model
    "dashboard" (:collection_id (cache.db/dashboard-collection-id model_id))
    "question"  (:collection_id (cache.db/card-collection-id model_id))
    nil))

(defmethod mi/can-write? :model/CacheConfig
  ([instance]
   (case (:model instance)
     "root"      (mi/superuser?)
     "database"  (mi/can-write? :model/Database (:model_id instance))
     ("dashboard" "question")
     (mi/current-user-has-full-permissions?
      (perms/perms-objects-set-for-parent-collection
       {:collection_id (target-collection-id instance)}
       :write))))
  ([_model pk]
   (mi/can-write? (cache.db/cache-config pk))))

(defmethod mi/can-read? :model/CacheConfig
  ([instance]
   (case (:model instance)
     "root"      (mi/superuser?)
     "database"  (mi/can-read? :model/Database (:model_id instance))
     "dashboard" (mi/can-read? :model/Dashboard (:model_id instance))
     "question"  (mi/can-read? :model/Card (:model_id instance))))
  ([_model pk]
   (mi/can-read? (cache.db/cache-config pk))))

(defn- can-set-cache-policy?
  "Check if the current user can set a cache policy for an entity.
   Uses collection permissions directly, bypassing remote-sync content lock."
  [{model-id :id :as instance}]
  (mi/can-write? (t2/instance :model/CacheConfig {:model (-> (t2/model instance)
                                                             name
                                                             u/lower-case-en)
                                                  :model_id model-id})))

(methodical/defmethod t2/batched-hydrate [:perms/use-parent-collection-perms :can_set_cache_policy]
  [_model k models]
  (mi/instances-with-hydrated-data
   models k
   #(into {}
          (map (juxt :id can-set-cache-policy?))
          (t2/hydrate (remove nil? models) :collection))
   :id
   {:default false}))

(defn- audit-caching-change! [user-id id prev new]
  (events/publish-event!
   :event/cache-config-update
   {:user-id  user-id
    :model    :model/CacheConfig
    :model-id id
    :details  {:model     (or (:model prev) (:model new))
               :model-id  (or (:model_id prev) (:model_id new))
               :old-value (dissoc prev :model :model_id)
               :new-value (dissoc new :model :model_id)}}))

;;; API

(defn root-strategy
  "Returns root strategy, if it's defined."
  []
  (cache.db/root-ttl-cache-config))

(defn row->config
  "Transform from how cache config is stored to how it's used/exposed in the API."
  [row]
  (when row
    (cond-> {:model    (:model row)
             :model_id (:model_id row)
             :strategy (-> (:config row)
                           (assoc :type (:strategy row))
                           (cond->
                            (#{:duration :schedule} (:strategy row))
                             (assoc :refresh_automatically (:refresh_automatically row))))}
      ;; Include name if present (from JOINed query)
      (:item_name row)
      (assoc :name (:item_name row))
      ;; Include collection if present (from JOINed query)
      (:collection_id row)
      (assoc :collection {:id              (:collection_id row)
                          :name            (:collection_name row)
                          :authority_level (:collection_authority_level row)
                          :type            (:collection_type row)}))))

(defn card-strategy
  "Shapes `row` into strategy for a given `card`."
  [row card]
  (some-> (:strategy (row->config row))
          (m/assoc-some :invalidated-at (t/max (:invalidated_at row)
                                               (:cache_invalidated_at card)))))

(defn config->row
  "Transform cache config from API form into db storage form."
  [{:keys [model model_id strategy]}]
  {:model                 model
   :model_id              model_id
   :strategy              (:type strategy)
   :config                (dissoc strategy :type :refresh_automatically)
   :refresh_automatically (:refresh_automatically strategy)})

(mu/defn get-list
  "Get a list of cache configurations for given `models` and a `collection`.
   Supports pagination via `limit` and `offset`, and sorting via `sort-params`."
  [models collection id
   limit       :- [:maybe ms/PositiveInt]
   offset      :- [:maybe ms/IntGreaterThanOrEqualToZero]
   sort-params :- [:maybe SortParams]]
  (let [{:keys [sort_column sort_direction]
         :or   {sort_column :name sort_direction :asc}} sort-params
        ;; Only apply sorting when paginating (limit provided) and not querying by id
        apply-sorting? (and limit (nil? id))]
    (->> (cache.db/cache-configs-page models collection id (when apply-sorting? sort_column) sort_direction limit offset)
         (mapv row->config))))

(mu/defn get-list-total
  "Get the total count of cache configurations for given `models` and a `collection`."
  [models collection id]
  (:count (cache.db/cache-config-count-row models collection id)))

(defn store!
  "Store cache configuration in DB."
  [user-id {:keys [model model_id] :as config}]
  (t2/with-transaction [_tx]
    (let [data    (config->row config)
          current (cache.db/lock-cache-config model model_id)]
      (u/prog1 (app-db/update-or-insert! :model/CacheConfig {:model model :model_id model_id}
                                         (constantly data))
        (audit-caching-change! user-id <> current data)))))

(defn delete!
  "Delete cache configuration (possibly multiple), identified by a `model` and a vector of `model-ids`."
  [user-id model model-ids]
  (when-let [current (seq (cache.db/cache-configs-for model model-ids))]
    (cache.db/delete-cache-configs! model model-ids)
    (doseq [item current]
      (audit-caching-change! user-id
                             (:id item)
                             (select-keys item [:strategy :config :model :model_id])
                             nil))))

;;; Invalidation

(defn- invalidate-cards [databases dashboards questions]
  (let [card-ids (concat
                  questions
                  (when (seq databases)
                    (cache.db/card-ids-for-databases databases))
                  (when (seq dashboards)
                    (cache.db/dashboard-card-ids dashboards)))]
    (if (empty? card-ids)
      -1
      (cache.db/invalidate-cards! card-ids (t/offset-date-time)))))

(defn- invalidate-cache-configs [databases dashboards questions]
  (let [model+ids (for [[k vs] [[:database databases]
                                [:dashboard dashboards]
                                [:question questions]]
                        v      vs]
                    [(name k) v])]
    (if (empty? model+ids)
      -1
      ;; using JVM date rather than DB time since it's what are used in cache tasks
      (cache.db/invalidate-cache-configs! model+ids (t/offset-date-time)))))

(defn invalidate!
  "Invalidate cache configuration. Accepts lists of ids for different types of models. If `with-overrides?` is passed,
  then invalidates cache on each individual card suitable for criteria."
  [{:keys [databases dashboards questions with-overrides?]}]
  (if with-overrides?
    (invalidate-cards databases dashboards questions)
    (invalidate-cache-configs databases dashboards questions)))
