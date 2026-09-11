(ns metabase.cache.schema
  "Malli schemas for the cache module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::cache-config.config
  "The `:config` column of a CacheConfig, decoded."
  :map)

(mr/def ::cache-config.state
  "The `:state` column of a CacheConfig, decoded."
  :map)

(mr/def ::cache-config
  "A CacheConfig as selected from the app DB: every column of `:cache_config`."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:model                 [:or :keyword :string]]
   [:model_id              [:maybe :int]]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]
   [:strategy              [:or :keyword :string]]
   [:config                ::cache-config.config]
   [:state                 [:maybe ::cache-config.state]]
   [:invalidated_at        [:maybe ms/TemporalInstant]]
   [:next_run_at           [:maybe ms/TemporalInstant]]
   [:refresh_automatically [:maybe :boolean]]])

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
  [:map {:closed true}
   [:query_hash         [:or bytes? :string]]
   [:updated_at         ms/TemporalInstant]
   [:results            [:or bytes? :string]]
   [:refresh_started_at [:maybe ms/TemporalInstant]]])

(mr/def ::query-cache.update
  "What an update (or insert) of a QueryCache accepts: every column of `:query_cache` except `id`, all optional."
  [:map {:closed true}
   [:query_hash         {:optional true} [:maybe [:or bytes? :string]]]
   [:updated_at         {:optional true} [:maybe ms/TemporalInstant]]
   [:results            {:optional true} [:maybe [:or bytes? :string]]]
   [:refresh_started_at {:optional true} [:maybe ms/TemporalInstant]]])
