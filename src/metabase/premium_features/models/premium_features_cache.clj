(ns metabase.premium-features.models.premium-features-cache
  "Model for the `premium_features_token_cache` table, which stores hashes of premium features token check
  results for cross-instance cache coordination. The actual token status is only held in memory."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/PremiumFeaturesCache [_model] :premium_features_token_cache)

(doto :model/PremiumFeaturesCache
  (derive :metabase/model))
