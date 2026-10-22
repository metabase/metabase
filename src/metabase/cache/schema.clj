(ns metabase.cache.schema
  "Malli schemas for the cache module."
  (:require
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
   ::cache-config.update
   [:map {:closed true}
    [:id                    ms/PositiveInt]]])

(mr/def ::cache-config.update
  "What an update (or insert) of a CacheConfig accepts: every column of `:cache_config` except `id`, all optional."
  [:map {:closed true}
   [:model                 {:optional true} [:maybe [:or :keyword :string]]]
   [:model_id              {:optional true} [:maybe :int]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:strategy              {:optional true} [:maybe [:or :keyword :string]]]
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
