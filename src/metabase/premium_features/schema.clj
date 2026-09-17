(ns metabase.premium-features.schema
  "Malli schemas for the premium-features module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::premium-features-cache
  "A PremiumFeaturesCache as selected from the app DB: every column of `:premium_features_token_cache`."
  [:merge
   ::premium-features-cache.columns
   [:map {:closed true}]])

(mr/def ::premium-features-cache.partial
  "A PremiumFeaturesCache row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::premium-features-cache [:map {:closed true}]])

(mr/def ::premium-features-cache.columns
  "Every column of `:premium_features_token_cache`, all optional."
  [:map {:closed true}
   [:token_hash        {:optional true} [:maybe :string]]
   [:token_status_hash {:optional true} [:maybe :string]]
   [:updated_at        {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::premium-features-cache.create
  "What an insert of a PremiumFeaturesCache accepts."
  (mut/select-keys (mr/schema ::premium-features-cache.columns) [:token_hash :token_status_hash :updated_at]))

(mr/def ::premium-features-cache.update
  "What an update of a PremiumFeaturesCache accepts: no `:token_hash`, the row's identity, which nothing ever
  updates."
  (mut/select-keys (mr/schema ::premium-features-cache.columns) [:token_status_hash :updated_at]))

(mr/def ::premium-features-cache.column
  "A column of `premium_features_token_cache`, for the `:columns` option of the queries in
  [[metabase.premium-features.db]]."
  (into [:enum] (mut/keys (mr/schema ::premium-features-cache.columns))))
