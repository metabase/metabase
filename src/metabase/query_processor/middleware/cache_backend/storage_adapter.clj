(ns metabase.query-processor.middleware.cache-backend.storage-adapter
  "Adapts a [[metabase.query-processor.middleware.cache-backend.interface/CacheBackend]] to the op-cache
  [[metabase.op-cache-impl.storage/Storage]] protocol, so the QP cache middleware can run any configured cache
  backend through the op cache. Values are the serialized results byte arrays; keys are query-hash byte arrays.

  Failures of the storage medium degrade rather than propagate: a failed read counts as no entry and a failed claim
  counts as won (every caller computes, matching the backend-less behavior), so cache trouble never fails the
  query itself."
  (:require
   [metabase.op-cache-impl.storage :as op-cache.storage]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.util.log :as log])
  (:import
   (java.io InputStream)))

(set! *warn-on-reflection* true)

(defn storage
  "An op-cache Storage over CacheBackend `backend`."
  [backend]
  (reify op-cache.storage/Storage
    (read-entry [_ query-hash]
      (try
        (i/with-cached-results backend query-hash [is written-at]
                               (when is
                                 {:value      (.readAllBytes ^InputStream is)
                                  :written-at written-at}))
        (catch Throwable e
          (log/errorf e "Error reading cached results: %s" (ex-message e))
          nil)))
    (write-entry! [_ query-hash value]
      ;; backends are responsible for stamping the entry timestamp and releasing the refresh lease on save
      (try
        (i/save-results! backend query-hash value)
        (catch Throwable e
          (log/errorf e "Error saving results to cache: %s" (ex-message e))))
      nil)
    (delete-entry! [_ query-hash]
      (i/delete-entry! backend query-hash)
      nil)
    (try-claim! [_ query-hash claim-ttl-ms]
      (try
        (boolean (i/try-acquire-refresh-lease! backend query-hash claim-ttl-ms))
        (catch Throwable e
          (log/errorf e "Error acquiring cache refresh lease: %s" (ex-message e))
          true)))
    (release-claim! [_ query-hash]
      (when (satisfies? i/LeaseControl backend)
        (i/release-refresh-lease! backend query-hash))
      nil)))
