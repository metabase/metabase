(ns metabase.premium-features.models.premium-features-cache
  "Model for the `premium_features_token_cache` table, which stores hashes of premium features token check
  results for cross-instance cache coordination. The actual token status is only held in memory."
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/PremiumFeaturesCache [_model] :premium_features_token_cache)

(doto :model/PremiumFeaturesCache
  (derive :metabase/model))
