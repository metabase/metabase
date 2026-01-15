(ns metabase.cache.models.cache-config
  "A model representing cache configuration."
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.app-db.core :as app-db]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
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
  (t2/select-one :model/CacheConfig :model "root" :model_id 0 :strategy :ttl))

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

(defn- sort-column->order-by
  "Convert a sort column to the appropriate SQL order-by expression."
  [sort-column]
  (case sort-column
    :name       [:coalesce :report_card.name :report_dashboard.name]
    :collection [:coalesce :report_card.collection_id :report_dashboard.collection_id]
    :policy     :cache_config.strategy))

(defn- base-query
  "Build the base query for cache configs with JOINs for name/collection access."
  [models collection id]
  (if id
    {:select [:cache_config.*]
     :from   [:cache_config]
     :where  [:and [:in :model models] [:= :model_id id]]}
    {:select    [:cache_config.*
                 [[:coalesce :report_card.name :report_dashboard.name] :item_name]
                 [[:coalesce :report_card.collection_id :report_dashboard.collection_id] :collection_id]
                 [:collection.name :collection_name]
                 [:collection.authority_level :collection_authority_level]
                 [:collection.type :collection_type]]
     :from      [:cache_config]
     :left-join [:report_card      [:and
                                    [:= :model [:inline "question"]]
                                    [:= :model_id :report_card.id]
                                    (when collection
                                      [:= :report_card.collection_id collection])]
                 :report_dashboard [:and
                                    [:= :model [:inline "dashboard"]]
                                    [:= :model_id :report_dashboard.id]
                                    (when collection
                                      [:= :report_dashboard.collection_id collection])]
                 :collection       [:= :collection.id
                                    [:coalesce :report_card.collection_id
                                     :report_dashboard.collection_id]]]
     :where     [:and
                 [:in :model models]
                 [:case
                  [:= :model [:inline "question"]]  [:!= :report_card.id nil]
                  [:= :model [:inline "dashboard"]] [:!= :report_dashboard.id nil]
                  :else                             true]]}))

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
        apply-sorting? (and limit (nil? id))
        query (cond-> (base-query models collection id)
                apply-sorting? (assoc :order-by [[(sort-column->order-by sort_column) sort_direction]])
                limit          (assoc :limit limit)
                offset         (assoc :offset offset))]
    (->> (t2/select :model/CacheConfig query)
         (mapv row->config))))

(mu/defn get-list-total
  "Get the total count of cache configurations for given `models` and a `collection`."
  [models collection id]
  (let [query (-> (base-query models collection id)
                  (dissoc :select)
                  (assoc :select [[[:count :*] :count]]))]
    (:count (t2/query-one query))))

(defn store!
  "Store cache configuration in DB."
  [user-id {:keys [model model_id] :as config}]
  (t2/with-transaction [_tx]
    (let [data    (config->row config)
          current (t2/select-one :model/CacheConfig :model model :model_id model_id {:for :update})]
      (u/prog1 (app-db/update-or-insert! :model/CacheConfig {:model model :model_id model_id}
                                         (constantly data))
        (audit-caching-change! user-id <> current data)))))

(defn delete!
  "Delete cache configuration (possibly multiple), identified by a `model` and a vector of `model-ids`."
  [user-id model model-ids]
  (when-let [current (seq (t2/select :model/CacheConfig :model model :model_id [:in model-ids]))]
    (t2/delete! :model/CacheConfig :model model :model_id [:in model-ids])
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
                    (t2/select-fn-vec :id [:model/Card :id] :database_id [:in databases]))
                  (when (seq dashboards)
                    (t2/select-fn-vec :card_id [:model/DashboardCard :card_id] :dashboard_id [:in dashboards])))]
    (if (empty? card-ids)
      -1
      (t2/update! :model/Card :id [:in card-ids]
                  {:cache_invalidated_at (t/offset-date-time)}))))

(defn- invalidate-cache-configs [databases dashboards questions]
  (let [conditions (for [[k vs] [[:database databases]
                                 [:dashboard dashboards]
                                 [:question questions]]
                         v      vs]
                     [:and [:= :model (name k)] [:= :model_id v]])]
    (if (empty? conditions)
      -1
      ;; using JVM date rather than DB time since it's what are used in cache tasks
      (t2/query-one {:update (t2/table-name :model/CacheConfig)
                     :set    {:invalidated_at (t/offset-date-time)}
                     :where  (into [:or] conditions)}))))

(defn invalidate!
  "Invalidate cache configuration. Accepts lists of ids for different types of models. If `with-overrides?` is passed,
  then invalidates cache on each individual card suitable for criteria."
  [{:keys [databases dashboards questions with-overrides?]}]
  (if with-overrides?
    (invalidate-cards databases dashboards questions)
    (invalidate-cache-configs databases dashboards questions)))
