(ns metabase.util.methodical.null-cache
  (:require
   [methodical.interface])
  (:import
   (methodical.interface Cache)))

(set! *warn-on-reflection* true)

(comment methodical.interface/keep-me)

(declare null-cache)

(deftype ^:private NullCache []
  Cache
  (cached-method [_cache _dispatch-value] nil)
  (cache-method! [_cache _dispatch-value _method] nil)
  (clear-cache! [_cache] nil)
  (empty-copy [_cache] (null-cache)))

(defn null-cache
  "A cache implementation that doesn't actually cache anything. To work around upstream bug
  https://github.com/camsaul/methodical/issues/98"
  []
  (->NullCache))
