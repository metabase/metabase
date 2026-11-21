(ns metabase.cache.models.cache-config
  "A model representing cache configuration."
  (:require
   [java-time.api :as t]
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.cache.db :as cache.db]
   [metabase.cache.schema :as cache.schema]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.models.database :as database]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- Definition --------------------------------------------------

(def ^:private available-sort-columns
  "Valid columns for sorting cache configs."
  #{:name :collection :policy})

(def SortParams
  "Schema for sort parameters."
  [:map {:closed true}
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

(defn- row->strategy
  "The cache strategy a CacheConfig `row` stores across its `strategy`, `config` and `refresh_automatically` columns."
  [{:keys [strategy config refresh_automatically]}]
  (let [strategy-type (some-> strategy keyword)]
    (cond-> (assoc config :type strategy-type)
      (#{:duration :schedule} strategy-type) (assoc :refresh_automatically refresh_automatically))))

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

(t2/define-before-update :model/CacheConfig
  [cache-config]
  (let [changes (t2/changes cache-config)]
    (when (or (contains? changes :model) (contains? changes :model_id))
      (throw (ex-info (tru "You cannot change the target of a cache configuration.") {:status-code 400})))
    cache-config))

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn- target-key
  "The `[model model_id]` target of `cache-config`, which identifies it whether it is saved or not."
  [{:keys [model model_id]}]
  [model model_id])

(defn- target-ids
  "The distinct `model_id`s of those of `cache-configs` targeting `model`."
  [cache-configs model]
  (into [] (comp (filter (comp #{model} :model)) (keep :model_id) (distinct)) cache-configs))

(defn- can-write-config?
  "Whether the current user can write the CacheConfig `instance`, given the collection of the dashboard or card it
  targets, the current user's permission on each collection and the database it targets, each looked up only for the
  configs that target one."
  [instance target-collection-id collection-permissions target-database]
  (case (:model instance)
    "root"      (mi/superuser?)
    "database"  (boolean (some-> target-database mi/can-write?))
    ("dashboard" "question")
    (perms/collection-permission-at-least? (get collection-permissions target-collection-id) :read-and-write)))

(methodical/defmethod t2/batched-hydrate [:model/CacheConfig :can_write]
  "Add whether the current user can write each CacheConfig, looking up the dashboards, cards, and databases they
  target at once."
  [_model k cache-configs]
  (let [configs        (remove nil? cache-configs)
        collection-ids {"dashboard" (cache.db/dashboard-collection-ids (target-ids configs "dashboard"))
                        "question"  (cache.db/card-collection-ids (target-ids configs "question"))}
        collection-permissions (perms/collection-permissions-for-user
                                (api/current-user-info)
                                (into [] (comp (filter (comp #{"dashboard" "question"} :model))
                                               (map (fn [{:keys [model model_id]}]
                                                      (get-in collection-ids [model model_id])))
                                               (distinct))
                                      configs)
                                {:root-namespace nil})
        databases      (u/index-by :id (t2/hydrate (cache.db/databases (target-ids configs "database")) :can_write))
        flags          (into {}
                             (map (fn [{:keys [model model_id] :as config}]
                                    [(target-key config)
                                     (can-write-config? config
                                                        (get-in collection-ids [model model_id])
                                                        collection-permissions
                                                        (when (= "database" model) (get databases model_id)))]))
                             configs)]
    (for [config cache-configs]
      (when config
        (assoc config k (get flags (target-key config) false))))))

(defn- readable-ids
  "The ids of those of `targets` the current user can read, their `:can_read` hydrated together."
  [targets]
  (into #{} (map :id) (mi/readable targets)))

(methodical/defmethod t2/batched-hydrate [:model/CacheConfig :can_read]
  "Whether the current user can read each CacheConfig, which they can when they read its target, the targets of each
  model answered together."
  [_model k cache-configs]
  (let [configs  (remove nil? cache-configs)
        readable {"database"  (readable-ids (cache.db/databases (target-ids configs "database")))
                  "dashboard" (readable-ids (cache.db/dashboards (target-ids configs "dashboard")))
                  "question"  (readable-ids (cache.db/cards (target-ids configs "question")))}]
    (for [{:keys [model model_id] :as config} cache-configs]
      (when config
        (vary-meta config assoc k (if (= "root" model)
                                    (boolean (mi/superuser?))
                                    (contains? (get readable model #{}) model_id)))))))

(defmethod mi/can-create? :model/CacheConfig
  [_model cache-config]
  (mi/can-write? (t2/hydrate (t2/instance :model/CacheConfig (select-keys cache-config [:model :model_id]))
                             :can_write)))

(defmethod mi/can-update? :model/CacheConfig
  [cache-config _changes]
  (mi/can-write? cache-config))

;;; -------------------------------------------------- Hydration ---------------------------------------------------

(def ^:private entity-model->caching-model
  "The CacheConfig `model` that targets an entity of each model whose cache policy can be set."
  {:model/Card      "question"
   :model/Dashboard "dashboard"})

(defn- hydrate-can-set-cache-policy
  "Sets `k` on the Cards or Dashboards `models` to whether the current user can set the cache policy of each, the
  CacheConfigs that would target them answered together; it reads collection permissions directly, so a remote-sync
  content lock on the entity does not count."
  [k models]
  (let [configs (t2/hydrate (into []
                                  (comp (remove nil?)
                                        (map (fn [entity]
                                               (t2/instance :model/CacheConfig
                                                            {:model    (entity-model->caching-model (t2/model entity))
                                                             :model_id (:id entity)}))))
                                  models)
                            :can_write)
        flags   (into {} (map (juxt :model_id :can_write)) configs)]
    (for [entity models]
      (when entity
        (assoc entity k (get flags (:id entity) false))))))

(methodical/defmethod t2/batched-hydrate [:model/Card :can_set_cache_policy]
  [_model k models]
  (hydrate-can-set-cache-policy k models))

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :can_set_cache_policy]
  [_model k models]
  (hydrate-can-set-cache-policy k models))

;;; ----------------------------------------------------- API ------------------------------------------------------

(defn- caching-change
  "The details of the change of a cache config from `prev` to `new`, which the audit log records."
  [prev new]
  {:model     (or (:model prev) (:model new))
   :model-id  (or (:model_id prev) (:model_id new))
   :old-value (dissoc prev :model :model_id)
   :new-value (dissoc new :model :model_id)})

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
             :strategy (row->strategy row)}
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
  [models      :- [:sequential :string]
   collection  :- [:maybe ms/PositiveInt]
   id          :- [:maybe ms/IntGreaterThanOrEqualToZero]
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
  [models     :- [:sequential :string]
   collection :- [:maybe ms/PositiveInt]
   id         :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (:count (cache.db/cache-config-count-row models collection id)))

;;; ---------------------------------------------------- Writes -----------------------------------------------------

(defn save-cache-config!
  "Store the cache configuration `config` in the app DB, replacing the one for the same target, and return its id."
  [_user-id {:keys [model model_id] :as config}]
  (events/with-batched-events
    (let [data    (config->row config)
          current (cache.db/lock-cache-config model model_id)
          context {:details (caching-change current data)}]
      (if current
        (let [changes (into {} (remove (fn [[k v]] (= v (get current k)))) data)]
          (when (seq changes)
            (cache.db/update-cache-config-strategy! (:id current) (select-keys changes [:strategy :config :refresh_automatically]))
            (events/publish-lifecycle! [(events/updated :event/cache-config-update
                                                        [current]
                                                        [(events/updated-row current changes)])]
                                       {:context context}))
          (:id current))
        (let [row (cache.db/insert-cache-config! data)]
          (events/publish-lifecycle! [(events/created :event/cache-config-create [row])] {:context context})
          (:id row))))))

(defn delete-cache-configs!
  "Delete the cache configurations of the `model` entities with `model-ids`, recording each for the audit log."
  [_user-id model model-ids]
  (events/with-batched-events
    (doseq [item (cache.db/cache-configs-for model model-ids)]
      (let [event (events/deleted :event/cache-config-delete :model/CacheConfig [item])]
        (cache.db/delete-cache-configs! model [(:model_id item)])
        (events/publish-lifecycle! [event]
                                   {:context {:details (caching-change (select-keys item [:strategy :config :model :model_id]) nil)}})))))

(defn delete-target-configs!
  "Deletes the CacheConfigs targeting the `model` entities with `model-ids`, which are being deleted."
  [model model-ids]
  (when (seq model-ids)
    (events/with-batched-events
      (let [items (cache.db/cache-configs-for model (vec model-ids))
            event (events/deleted :event/cache-config-delete :model/CacheConfig items)]
        (cache.db/delete-cache-configs! model (vec model-ids))
        (events/publish-lifecycle! [event])))))

(defmethod database/delete-for-databases! :model/CacheConfig
  [_model databases]
  (delete-target-configs! "database" (mapv :id databases)))

(mu/defn update-cache-config!
  "Apply `changes` to the cache configuration with `cache-config-id`."
  [cache-config-id :- ms/PositiveInt
   changes         :- (mut/select-keys ::cache.schema/cache-config.update [:next_run_at :invalidated_at])]
  (cache.db/update-cache-config! cache-config-id changes))

(defmulti invalidate-cached-results!
  "Set `cache_invalidated_at` of the rows of `model` with `ids` to `invalidated-at`, returning the number updated. The
  Card model, whose namespace requires this one, implements it with its own write function."
  {:arglists '([model ids invalidated-at])}
  (fn [model _ids _invalidated-at] model))

(defn- invalidate-cards [databases dashboards questions]
  (let [card-ids (concat
                  questions
                  (when (seq databases)
                    (cache.db/card-ids-for-databases databases))
                  (when (seq dashboards)
                    (cache.db/dashboard-card-ids dashboards)))]
    (if (empty? card-ids)
      -1
      (do (t2/resolve-model :model/Card)
          (invalidate-cached-results! :model/Card card-ids (t/offset-date-time))))))

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

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod app-db-copy/spec :model/CacheConfig [_model]
  {:skip? true})

(defmethod audit/spec :model/CacheConfig [_model]
  {:track            []
   :track-redacted   [:config :invalidated_at :model :model_id :next_run_at :refresh_automatically :state :strategy]
   :skip             []
   :context-details? true
   :topics           {:create :cache-config-update
                      :update :cache-config-update
                      :delete :cache-config-update}})
