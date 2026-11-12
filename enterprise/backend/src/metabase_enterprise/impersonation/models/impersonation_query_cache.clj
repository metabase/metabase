(ns metabase-enterprise.impersonation.models.impersonation-query-cache
  "Model definition for ImpersonationQueryCaches, the cached validation results of native query stages run on
  impersonated databases."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ImpersonationQueryCache [_model] :impersonation_query_cache)

(doto :model/ImpersonationQueryCache
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/deftransforms :model/ImpersonationQueryCache
  {:input_engine mi/transform-keyword
   :result       mi/transform-keyword})

(mu/defn query-hash :- :string
  "The SHA-256 hex of the native SQL `query`, which looks an ImpersonationQueryCache up."
  [query :- :string]
  (codecs/bytes->hex (buddy-hash/sha256 ^String query)))

(t2/define-before-insert :model/ImpersonationQueryCache
  [row]
  (assoc row :input_query_hash (query-hash (:input_query row))))

(t2/define-before-update :model/ImpersonationQueryCache
  [row]
  (let [changes (t2/changes row)]
    (cond-> row
      (contains? changes :input_query) (assoc :input_query_hash (query-hash (:input_query changes))))))
