(ns metabase.api.cache
  (:require
   [clojure.walk :as walk]
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.models.cache-config :as cache-config]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.util.i18n :refer [tru trun]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; Data shape

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

(defn- check-cache-access [model id]
  (if (or (nil? id)
          ;; sometimes its a sequence and we're going to check for settings access anyway
          (not (number? id))
          (zero? id))
    ;; if you're not accessing a concrete entity, you should be able to access settings
    (validation/check-has-application-permission :setting)
    (api/write-check (case model
                       "database" :model/Database
                       "dashboard" :model/Dashboard
                       "question" :model/Card)
        id)))

(api/defendpoint GET "/"
  "Return cache configuration."
  [:as {{:strs [model collection id]
         :or   {model "root"}}
        :query-params}]
  {model      (mu/with (ms/QueryVectorOf cache-config/CachingModel)
                       {:description "Type of model"})
   collection (mu/with [:maybe ms/PositiveInt]
                       {:description "Collection id to filter results. Returns everything if not supplied."})
   id         (mu/with [:maybe ms/PositiveInt]
                       {:description "Model id to get configuration for."})}
  (when (and (not (premium-features/enable-cache-granular-controls?))
             (not= model ["root"]))
    (throw (premium-features/ee-feature-error (tru "Granular Caching"))))
  (check-cache-access (first model) id)
  {:data (cache-config/get-list model collection id)})

(api/defendpoint PUT "/"
  "Store cache configuration."
  [:as {{:keys [model model_id strategy] :as config} :body}]
  {model    cache-config/CachingModel
   model_id ms/IntGreaterThanOrEqualToZero
   strategy (CacheStrategyAPI)}
  (validation/check-has-application-permission :setting)
  (assert-valid-models model [model_id] (premium-features/enable-cache-granular-controls?))
  (check-cache-access model model_id)
  {:id (cache-config/store! api/*current-user-id* config)})

(api/defendpoint DELETE "/"
  "Delete cache configurations."
  [:as {{:keys [model model_id]} :body}]
  {model    cache-config/CachingModel
   model_id (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)}
  (validation/check-has-application-permission :setting)
  (assert-valid-models model model_id (premium-features/enable-cache-granular-controls?))
  (check-cache-access model model_id)
  (cache-config/delete! api/*current-user-id* model model_id)
  nil)


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

  (let [cnt (cache-config/invalidate! {:databases       database
                                       :dashboards      dashboard
                                       :questions       question
                                       :with-overrides? (= include :overrides)})]
    {:status (if (= cnt -1) 404 200)
     :body   {:count   cnt
              :message (case [(= include :overrides) (if (pos? cnt) 1 cnt)]
                         [true -1]  (tru "Could not find any questions for the criteria you specified.")
                         [true 0]   (tru "No cached results to clear.")
                         [true 1]   (trun "Cleared a cached result." "Cleared {0} cached results." cnt)
                         [false -1] (tru "Nothing to invalidate.")
                         [false 0]  (tru "No cache configuration to invalidate.")
                         [false 1]  (trun "Invalidated cache configuration." "Invalidated {0} cache configurations." cnt))}}))

(api/define-routes)
