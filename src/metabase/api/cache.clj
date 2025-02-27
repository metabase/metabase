(ns metabase.api.cache
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.config :as config]
   [metabase.models.cache-config :as cache-config]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.cron :as u.cron]
   [metabase.util.i18n :refer [tru trun]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; Data shape

(mr/def ::cache-strategy.base
  [:map
   [:type [:enum :nocache :ttl :duration :schedule]]])

(mr/def ::cache-strategy.nocache
  [:map ; not closed due to a way it's used in tests for clarity
   [:type [:= :nocache]]])

(mr/def ::cache-strategy.ttl
  [:map {:closed true}
   [:type            [:= :ttl]]
   [:multiplier      ms/PositiveInt]
   [:min_duration_ms ms/IntGreaterThanOrEqualToZero]])

(mr/def ::cache-strategy.oss
  "Schema for a caching strategy (OSS)"
  [:and
   ::cache-strategy.base
   [:multi {:dispatch :type}
    [:nocache ::cache-strategy.nocache]
    [:ttl     ::cache-strategy.ttl]]])

(mr/def ::cache-strategy.ee.duration
  [:map {:closed true}
   [:type                  [:= :duration]]
   [:duration              ms/PositiveInt]
   [:unit                  [:enum "hours" "minutes" "seconds" "days"]]
   [:refresh_automatically {:optional true} [:maybe :boolean]]])

(mr/def ::cache-strategy.ee.schedule
  [:map {:closed true}
   [:type                  [:= :schedule]]
   [:schedule              u.cron/CronScheduleString]
   [:refresh_automatically {:optional true} [:maybe :boolean]]])

(mr/def ::cache-strategy.ee
  "Schema for a caching strategy in EE when we have an premium token with `:cache-granular-controls`."
  [:and
   ::cache-strategy.base
   [:multi {:dispatch :type}
    [:nocache  ::cache-strategy.nocache]
    [:ttl      ::cache-strategy.ttl]
    [:duration ::cache-strategy.ee.duration]
    [:schedule ::cache-strategy.ee.schedule]]])

(mr/def ::cache-strategy
  (if config/ee-available?
    [:multi
     {:dispatch (fn [_value]
                  (if (premium-features/has-feature? :cache-granular-controls)
                    :ee
                    :oss))}
     [:ee  ::cache-strategy.ee]
     [:oss ::cache-strategy.oss]]
    ::cache-strategy.oss))

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
    ;; if you're not accessing a concrete entity, you have to be an admin
    (api/check-superuser)
    (api/write-check (case model
                       "database" :model/Database
                       "dashboard" :model/Dashboard
                       "question" :model/Card)
                     id)))

(api.macros/defendpoint :get "/"
  "Return cache configuration."
  [_route-params
   {:keys [model collection id]}
   :- [:map
       [:model      {:default ["root"]} (mu/with (ms/QueryVectorOf cache-config/CachingModel)
                                                 {:description "Type of model"})]
       [:collection {:optional true} (mu/with [:maybe ms/PositiveInt]
                                              {:description "Collection id to filter results. Returns everything if not supplied."})]
       [:id         {:optional true} (mu/with [:maybe ms/PositiveInt]
                                              {:description "Model id to get configuration for."})]]]
  (when (and (not (premium-features/enable-cache-granular-controls?))
             (not= model ["root"]))
    (throw (premium-features/ee-feature-error (tru "Granular Caching"))))
  (check-cache-access (first model) id)
  {:data (cache-config/get-list model collection id)})

(api.macros/defendpoint :put "/"
  "Store cache configuration."
  [_route-params
   _query-params
   {:keys [model model_id] :as config} :- [:map
                                           [:model    cache-config/CachingModel]
                                           [:model_id ms/IntGreaterThanOrEqualToZero]
                                           [:strategy ::cache-strategy]]]
  (assert-valid-models model [model_id] (premium-features/enable-cache-granular-controls?))
  (check-cache-access model model_id)
  {:id (cache-config/store! api/*current-user-id* config)})

(api.macros/defendpoint :delete "/"
  "Delete cache configurations."
  [_route-params
   _query-params
   {:keys [model model_id]} :- [:map
                                [:model    cache-config/CachingModel]
                                [:model_id (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]]
  (assert-valid-models model model_id (premium-features/enable-cache-granular-controls?))
  (doseq [id model_id] (check-cache-access model id))
  (cache-config/delete! api/*current-user-id* model model_id)
  nil)

(api.macros/defendpoint :post "/invalidate"
  "Invalidate cache entries.

  Use it like `/api/cache/invalidate?database=1&dashboard=15` (any number of database/dashboard/question can be
  supplied).

  `&include=overrides` controls whenever you want to invalidate cache for a specific cache configuration without
  touching all nested configurations, or you want your invalidation to trickle down to every card."
  [_route-params
   {:keys [include database dashboard question]}
   :- [:map
       [:include   {:optional true} [:maybe {:description "All cache configuration overrides should invalidate cache too"}
                                     [:= :overrides]]]
       [:database  {:optional true} [:maybe {:description "A list of database ids"}
                                     (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
       [:dashboard {:optional true} [:maybe {:description "A list of dashboard ids"}
                                     (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
       [:question  {:optional true} [:maybe {:description "A list of question ids"}
                                     (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]]]
  (when-not (premium-features/enable-cache-granular-controls?)
    (throw (premium-features/ee-feature-error (tru "Granular Caching"))))

  (doseq [db-id database] (api/write-check :model/Database db-id))
  (doseq [dashboard-id dashboard] (api/write-check :model/Dashboard dashboard-id))
  (doseq [question-id question] (api/write-check :model/Card question-id))

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
