(ns metabase.models.cache-config
  "A model representing cache configuration."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(doto :model/CacheConfig
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/table-name :model/CacheConfig [_model] :cache_config)

(t2/deftransforms :model/CacheConfig
  {:strategy mi/transform-keyword
   :config   mi/transform-json
   :state    mi/transform-json})
