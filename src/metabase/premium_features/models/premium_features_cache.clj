(ns metabase.premium-features.models.premium-features-cache
  "Model for the `premium_features_token_cache` table, which caches premium features token check results
  across instances."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/PremiumFeaturesCache [_model] :premium_features_token_cache)

(doto :model/PremiumFeaturesCache
  (derive :metabase/model))

(t2/deftransforms :model/PremiumFeaturesCache
  {:token_status mi/transform-json})
