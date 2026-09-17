(ns metabase.cache.schema
  "Malli schemas for the cache module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

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

(mr/def ::cache-config
  "A CacheConfig as selected from the app DB: every column of `:cache_config`."
  [:merge
   ::cache-config.columns
   [:map {:closed true}
    [:id                    ms/PositiveInt]]])

(mr/def ::cache-config.partial
  "A CacheConfig row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::cache-config [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::cache-config.columns
  "Every column of `:cache_config` except `id`, all optional."
  [:map {:closed true}
   [:model                 {:optional true} [:maybe [:or :keyword :string]]]
   [:model_id              {:optional true} [:maybe :int]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:strategy              {:optional true} [:maybe [:or :keyword :string]]]
   [:config                {:optional true} [:maybe ::cache-config.config]]
   [:state                 {:optional true} [:maybe ::cache-config.state]]
   [:invalidated_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:next_run_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:refresh_automatically {:optional true} [:maybe :boolean]]])

(mr/def ::cache-config.create
  "What an insert of a CacheConfig accepts."
  (mut/select-keys (mr/schema ::cache-config.columns)
                   [:model :model_id :created_at :updated_at :strategy :config :state :invalidated_at :next_run_at
                    :refresh_automatically]))

(mr/def ::cache-config.update
  "What an update of a CacheConfig accepts: every column but `:created_at`, which nothing ever updates."
  (mut/select-keys (mr/schema ::cache-config.columns)
                   [:model :model_id :updated_at :strategy :config :state :invalidated_at :next_run_at
                    :refresh_automatically]))

(mr/def ::cache-config.column
  "A column of `cache_config`, for the `:columns` option of the queries in [[metabase.cache.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::cache-config.columns))))

(mr/def ::query-cache
  "A QueryCache as selected from the app DB: every column of `:query_cache`."
  [:merge
   ::query-cache.columns
   [:map {:closed true}]])

(mr/def ::query-cache.partial
  "A QueryCache row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::query-cache [:map {:closed true}]])

(mr/def ::query-cache.columns
  "Every column of `:query_cache`, all optional."
  [:map {:closed true}
   [:query_hash         {:optional true} [:maybe [:or bytes? :string]]]
   [:updated_at         {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:results            {:optional true} [:maybe [:or bytes? :string]]]
   [:refresh_started_at {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::query-cache.create
  "What an insert of a QueryCache accepts."
  (mut/select-keys (mr/schema ::query-cache.columns) [:query_hash :updated_at :results :refresh_started_at]))

(mr/def ::query-cache.column
  "A column of `query_cache`, for the `:columns` option of the queries in [[metabase.cache.db]]."
  (into [:enum] (mut/keys (mr/schema ::query-cache.columns))))
