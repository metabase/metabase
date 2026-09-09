(ns metabase.premium-features.schema
  "Malli schemas for the premium-features module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::premium-features-cache
  "A PremiumFeaturesCache as selected from the app DB: every column of `:premium_features_token_cache`."
  [:map {:closed true}
   [:token_hash        :string]
   [:token_status_hash :string]
   [:updated_at        ms/TemporalInstant]])

(mr/def ::premium-features-cache.update
  "What an update (or insert) of a PremiumFeaturesCache accepts: every column of `:premium_features_token_cache` except `id`, all optional."
  [:map {:closed true}
   [:token_hash        {:optional true} [:maybe :string]]
   [:token_status_hash {:optional true} [:maybe :string]]
   [:updated_at        {:optional true} [:maybe ms/TemporalInstant]]])
