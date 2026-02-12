(ns metabase.premium-features.task.clear-token-cache
  "Clears the premium features token cache on startup so the first token check always hits MetaStore fresh.
  Without this, the cache table (which survives restarts) could serve stale feature data."
  (:require
   [metabase.premium-features.token-check :as token-check]
   [metabase.startup.core :as startup]))

(defmethod startup/def-startup-logic! ::clear-token-cache [_]
  (token-check/clear-cache!))
