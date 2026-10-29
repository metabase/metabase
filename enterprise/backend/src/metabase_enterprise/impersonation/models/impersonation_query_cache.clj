(ns metabase-enterprise.impersonation.models.impersonation-query-cache
  "Model definition for ImpersonationQueryCaches, the cached validation results of native query stages run on
  impersonated databases."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ImpersonationQueryCache [_model] :impersonation_query_cache)

(doto :model/ImpersonationQueryCache
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/deftransforms :model/ImpersonationQueryCache
  {:input_engine mi/transform-keyword
   :result       mi/transform-keyword})
