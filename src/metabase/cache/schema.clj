(ns metabase.cache.schema
  "Malli schemas for the cache module."
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.cron :as u.cron]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(defn- cache-strategy-dispatch
  "`:multi` dispatch for a cache strategy.

  `:type` arrives from JSON as a string, and `:multi` dispatches before the branch that would coerce it to a keyword
  runs, so the dispatch has to do the coercion itself. A sibling `[:map [:type [:enum ...]]]` guard can't do it for
  us: request decoding would then strip every key the guard doesn't name, emptying out the strategy."
  [strategy]
  (let [strategy-type (:type strategy)]
    (when (or (keyword? strategy-type) (string? strategy-type))
      (keyword strategy-type))))

(mr/def ::cache-strategy.nocache
  ::lib.schema/cache-strategy.nocache)

(mr/def ::cache-strategy.ttl
  "[[::lib.schema/cache-strategy.ttl]] as it may be configured: whole numbers."
  [:merge
   ::lib.schema/cache-strategy.ttl
   [:map {:closed true}
    [:multiplier      ms/PositiveInt]
    [:min_duration_ms ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::cache-strategy.oss
  "Schema for a caching strategy (OSS)"
  [:multi {:description      (deferred-tru "cache strategy :type must be one of :nocache, :ttl")
           :decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         cache-strategy-dispatch
           :error/fn    (fn [{:keys [value]} _]
                          (tru "invalid cache strategy :type {0}, must be one of :nocache, :ttl"
                               (pr-str (:type value))))}
   [:nocache ::cache-strategy.nocache]
   [:ttl     ::cache-strategy.ttl]])

(mr/def ::cache-strategy.ee.duration
  "[[::lib.schema/cache-strategy.duration]] as it may be configured: a whole number of units."
  [:merge
   ::lib.schema/cache-strategy.duration
   [:map {:closed true}
    [:duration ms/PositiveInt]]])

(mr/def ::cache-strategy.ee.schedule
  "[[::lib.schema/cache-strategy.schedule]] as it may be configured: a valid cron schedule."
  [:merge
   ::lib.schema/cache-strategy.schedule
   [:map {:closed true}
    [:schedule u.cron/CronScheduleString]]])

;;; This is basically the same schema as `:metabase-enterprise.cache.strategies/cache-strategy` except it doesn't have
;;; the optional `:invalidated-at` keys
(mr/def ::cache-strategy.ee
  "Schema for a caching strategy in EE when we have an premium token with `:cache-granular-controls`."
  [:multi {:description      (deferred-tru "cache strategy :type must be one of :nocache, :ttl, :duration, :schedule")
           :decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         cache-strategy-dispatch
           :error/fn    (fn [{:keys [value]} _]
                          (tru "invalid cache strategy :type {0}, must be one of :nocache, :ttl, :duration, :schedule"
                               (pr-str (:type value))))}
   [:nocache     ::cache-strategy.nocache]
   [:ttl         ::cache-strategy.ttl]
   [:duration    ::cache-strategy.ee.duration]
   [:schedule    ::cache-strategy.ee.schedule]])

(mr/def ::cache-config.model
  "The `:model` column of a CacheConfig: the kind of entity caching is configured for."
  [:enum "root" "database" "dashboard" "question"])

(mr/def ::cache-config.model-id
  "The `:model_id` column of a CacheConfig: 0 for the root config, the id of its target otherwise."
  ms/IntGreaterThanOrEqualToZero)

(mr/def ::cache-config.strategy
  "The `:strategy` column of a CacheConfig: the type of its cache strategy."
  [:enum {:decode/normalize keyword} :nocache :ttl :duration :schedule])

(mr/def ::cache-config.config
  "The `:config` column of a CacheConfig, decoded: a cache strategy body with `:type` and `:refresh_automatically`
  stripped off, so it's whichever subset of these fields the strategy in the `:strategy` column calls for."
  [:map {:closed true}
   [:name             {:optional true} [:maybe :string]]
   [:multiplier       {:optional true} number?]
   [:min_duration_ms  {:optional true} number?]
   [:duration         {:optional true} number?]
   [:unit             {:optional true} [:enum "hours" "minutes" "seconds" "days"]]
   [:schedule         {:optional true} :string]])

(mr/def ::cache-config.state
  "The `:state` column of a CacheConfig, decoded."
  [:map {:closed true}])

(defn- check-target
  "Returns `row`, a CacheConfig, or throws a 400 when it holds a `model_id` that does not fit its `model`: 0 for the root
  config, a positive id otherwise."
  [{:keys [model model_id] :as row}]
  (when (and (contains? row :model) (contains? row :model_id)
             (not (if (= "root" model) (= 0 model_id) (pos-int? model_id))))
    (throw (ex-info (tru "model_id must be 0 for the root config and positive otherwise.") {:status-code 400})))
  row)

(defn- check-strategy
  "Returns `row`, a CacheConfig, or throws a 400 when it holds a `strategy` and a `config` that, with its
  `refresh_automatically`, do not form a valid strategy."
  [{:keys [strategy config] :as row}]
  (let [strategy-type (some-> strategy keyword)]
    (when (and (contains? row :strategy) (contains? row :config)
               (not (mr/validate ::cache-strategy.ee
                                 (cond-> (assoc config :type strategy-type)
                                   (and (#{:duration :schedule} strategy-type) (contains? row :refresh_automatically))
                                   (assoc :refresh_automatically (:refresh_automatically row))))))
      (throw (ex-info (tru "strategy, config and refresh_automatically must form a valid cache strategy.")
                      {:status-code 400}))))
  row)

(defn- check-row
  "Returns `row`, a CacheConfig, after [[check-target]] and [[check-strategy]]."
  [row]
  (cond-> row
    (map? row) (-> check-target check-strategy)))

(mr/def ::cache-config
  "A CacheConfig as selected from the app DB: every column of `:cache_config`."
  [:merge
   ::cache-config.update
   [:map {:closed true}
    [:id                    ms/PositiveInt]]])

(mr/def ::cache-config.update
  "What an update (or insert) of a CacheConfig accepts: every column of `:cache_config` except `id`, all optional, its
  `model_id` fitting its `model` and its strategy columns forming a valid strategy when it holds them."
  [:map {:closed           true
         :decode/normalize {:leave check-row}}
   [:model                 {:optional true} [:maybe ::cache-config.model]]
   [:model_id              {:optional true} [:maybe ::cache-config.model-id]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:strategy              {:optional true} [:maybe ::cache-config.strategy]]
   [:config                {:optional true} [:maybe ::cache-config.config]]
   [:state                 {:optional true} [:maybe ::cache-config.state]]
   [:invalidated_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:next_run_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:refresh_automatically {:optional true} [:maybe :boolean]]])

(mr/def ::query-cache
  "A QueryCache as selected from the app DB: every column of `:query_cache`."
  [:merge
   ::query-cache.update
   [:map {:closed true}]])

(mr/def ::query-cache.update
  "What an update (or insert) of a QueryCache accepts: every column of `:query_cache` except `id`, all optional."
  [:map {:closed true}
   [:query_hash         {:optional true} [:maybe [:or bytes? :string]]]
   [:updated_at         {:optional true} [:maybe ms/TemporalInstant]]
   [:results            {:optional true} [:maybe [:or bytes? :string]]]
   [:refresh_started_at {:optional true} [:maybe ms/TemporalInstant]]])
