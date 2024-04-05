(ns metabase.api.cache
  (:require
   [clojure.walk :as walk]
   [compojure.core :refer [GET]]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.db.query :as mdb.query]
   [metabase.events :as events]
   [metabase.models :refer [CacheConfig Card]]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; Data shape

(defn row->config
  "Transform from how cache config is stored to how it's used/exposed in the API"
  [row]
  {:model    (:model row)
   :model_id (:model_id row)
   :strategy (assoc (:config row) :type (:strategy row))})

(defn config->row
  "Transform cache config from API form into db storage from"
  [{:keys [model model_id strategy]}]
  {:model    model
   :model_id model_id
   :strategy (:type strategy)
   :config   (dissoc strategy :type)})

(defn- drop-internal-fields
  "See `metabase-enterprise.cache.strategies/CacheStrategy`"
  [schema]
  (walk/prewalk
   (fn [x]
     (if (and (vector? x) (= (first x) :map))
       (into [] (remove #(:internal (meta %))) x)
       x))
   schema))

;; TODO: figure out how to combine `defenterprise` and `defendpoint` - right now OpenAPI only "sees" OSS version of
;; the schema, so docs for enterprise version won't be correct until we figure out the way to support this
(defenterprise CacheStrategy
  "Schema for a caching strategy"
  metabase-enterprise.cache.strategies
  []
  [:and
   [:map
    [:type [:enum :nocache :ttl]]]
   [:multi {:dispatch :type}
    [:nocache  [:map ;; not closed due to a way it's used in tests for clarity
                [:type keyword?]]]
    [:ttl      [:map {:closed true}
                [:type [:= :ttl]]
                [:multiplier ms/PositiveInt]
                [:min_duration_ms ms/IntGreaterThanOrEqualToZero]]]]])

(defn CacheStrategyAPI
  "Schema for a caching strategy for the API"
  []
  (drop-internal-fields (CacheStrategy)))

(def ^:private CachingModel [:enum "root" "database" "dashboard" "question"])

(defn- assert-valid-models [model ids premium?]
  (cond
    (= model "root")
    (when-not (some zero? ids)
      (throw (ex-info (tru "Root configuration is only valid with model_id = 0") {:status-code 404
                                                                                  :model_id    (first ids)})))

    (not premium?)
    (throw (premium-features/ee-feature-error (tru "Granular Caching")))

    :else
    (api/check-404 (t2/select-one (case model
                                    "database"  :model/Database
                                    "dashboard" :model/Dashboard
                                    "question"  :model/Card)
                                  :id [:in ids]))))

(defn- audit-caching-change! [id prev new]
  (events/publish-event!
   :event/cache-config-update
   {:user-id  api/*current-user-id*
    :model    :model/CacheConfig
    :model-id id
    :details  {:model     (or (:model prev) (:model new))
               :model-id  (or (:model_id prev) (:model_id new))
               :old-value (dissoc prev :model :model_id)
               :new-value (dissoc new :model :model_id)}}))

(api/defendpoint GET "/"
  "Return cache configuration."
  [:as {{:strs [model collection]
         :or   {model "root"}}
        :query-params}]
  {model      (ms/QueryVectorOf CachingModel)
   ;; note that `nil` in `collection` means all configurations not scoped to any particular collection
   collection [:maybe ms/PositiveInt]}
  (validation/check-has-application-permission :setting)
  (let [items (if (premium-features/enable-cache-granular-controls?)
                (t2/select :model/CacheConfig
                           :model [:in model]
                           {:left-join [:report_card      [:and
                                                           [:= :model [:inline "question"]]
                                                           [:= :model_id :report_card.id]
                                                           [:= :report_card.collection_id collection]]
                                        :report_dashboard [:and
                                                           [:= :model [:inline "dashboard"]]
                                                           [:= :model_id :report_dashboard.id]
                                                           [:= :report_dashboard.collection_id collection]]]
                            :where     [:case
                                        [:= :model [:inline "question"]]  [:!= :report_card.id nil]
                                        [:= :model [:inline "dashboard"]] [:!= :report_dashboard.id nil]
                                        :else                             true]})
                (t2/select :model/CacheConfig :model "root"))]
    {:data (mapv row->config items)}))

(api/defendpoint PUT "/"
  "Store cache configuration."
  [:as {{:keys [model model_id strategy] :as config} :body}]
  {model    CachingModel
   model_id ms/IntGreaterThanOrEqualToZero
   strategy (CacheStrategyAPI)}
  (validation/check-has-application-permission :setting)
  (assert-valid-models model [model_id] (premium-features/enable-cache-granular-controls?))
  (t2/with-transaction [_tx]
    (let [data    (config->row config)
          current (t2/select-one :model/CacheConfig :model model :model_id model_id {:for :update})]
      {:id (u/prog1 (mdb.query/update-or-insert! :model/CacheConfig {:model model :model_id model_id}
                                                 (constantly data))
             (audit-caching-change! <> current data))})))

(api/defendpoint DELETE "/"
  "Delete cache configuration."
  [:as {{:keys [model model_id]} :body}]
  {model    CachingModel
   model_id (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)}
  (validation/check-has-application-permission :setting)
  (assert-valid-models model model_id (premium-features/enable-cache-granular-controls?))
  (when-let [current (seq (t2/select :model/CacheConfig :model model :model_id [:in model_id]))]
    (t2/delete! :model/CacheConfig :model model :model_id [:in model_id])
    (doseq [item current]
      (audit-caching-change! (:id item)
                             (select-keys item [:strategy :config :model :model_id])
                             nil)))
  nil)

(defn- invalidate-cache-configs [database dashboard question]
  (let [conditions (for [[k vs] [[:database database]
                                 [:dashboard dashboard]
                                 [:question question]]
                         v      vs]
                     [:and [:= :model (name k)] [:= :model_id v]])]
    (if (empty? conditions)
      0
      ;; using JVM date rather than DB time since it's what are used in cache tasks
      (t2/query-one {:update (t2/table-name CacheConfig)
                     :set    {:invalidated_at (t/offset-date-time)}
                     :where  (into [:or] conditions)}))))

(defn- invalidate-cards [database dashboard question]
  (let [card-ids (concat
                  question
                  (when (seq database)
                    (t2/select-fn-vec :id [:model/Card :id] :database_id [:in database]))
                  (when (seq dashboard)
                    (t2/select-fn-vec :card_id [:model/DashboardCard :card_id] :dashboard_id [:in dashboard])))]
    (if (empty? card-ids)
      0
      (t2/update! Card :id [:in card-ids]
                  {:cache_invalidated_at (t/offset-date-time)}))))

(api/defendpoint POST "/invalidate"
  "Invalidate cache entries.

  Use it like `/api/cache/invalidate?database=1&dashboard=15` (any number of database/dashboard/question can be
  supplied).

  `&include=overrides` controls whenever you want to invalidate cache for a specific cache configuration without
  touching all nested configurations, or you want your invalidation to trickle down to every card."
  [include database dashboard question]
  {include   [:maybe {:description "All cache configuration overrides should invalidate cache too"} [:= :overrides]]
   database  [:maybe {:description "A database id"} (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]
   dashboard [:maybe {:description "A dashboard id"} (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]
   question  [:maybe {:description "A question id"} (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]}

  (when-not (premium-features/enable-cache-granular-controls?)
    (throw (premium-features/ee-feature-error (tru "Granular Caching"))))

  (let [cnt (if (= include :overrides)
              (invalidate-cards database dashboard question)
              (invalidate-cache-configs database dashboard question))]
    (case [(= include :overrides) (pos? cnt)]
      [true false]  {:status 404
                     :body   {:message (tru "Could not find any cached questions for the given database, dashboard, or questions ids.")}}
      [true true]   {:status 200
                     :body   {:message (tru "Invalidated cache for {0} question(s)." cnt)
                              :count   cnt}}
      [false false] {:status 404
                     :body   {:message (tru "Could not find a cache configuration to invalidate.")}}
      [false true]  {:status 200
                     :body   {:message (tru "Invalidated {0} cache configuration(s)." cnt)
                              :count   cnt}})))

(api/define-routes)
