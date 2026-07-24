(ns metabase.cache.models.op-cache-entry
  "Storage rows for the op cache. Deliberately hook-free: `written_at` must come from the JVM clock (freshness
  decisions compare it against boundaries computed from that clock), and claim operations must compile to single
  atomic conditional UPDATEs, so no timestamp or select-then-update model behaviors may apply."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/OpCacheEntry [_model] :op_cache)
(methodical/defmethod t2/primary-keys :model/OpCacheEntry [_model] [:cache_key])

(derive :model/OpCacheEntry :metabase/model)
