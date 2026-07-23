(ns metabase.query-processor.middleware.cache-test-util
  "Utilities for testing against the QP op cache without touching its storage implementation."
  (:require
   [metabase.op-cache-impl.test-util :as op-cache.tu]
   [metabase.op-cache.core :as op-cache]
   [metabase.query-processor.middleware.cache :as qp.cache]))

(defn do-with-in-memory-op-cache
  "Impl for [[with-in-memory-op-cache]]."
  [thunk]
  (binding [qp.cache/*storage* (op-cache.tu/in-memory-storage)]
    (thunk)))

(defmacro with-in-memory-op-cache
  "Run `body` with the QP op cache backed by a fresh in-memory storage, isolating its cache state from other tests
  with no cleanup needed. The storage is carried by a dynamic binding, so this only works when the queries in `body`
  run on the calling thread (e.g. via `process-query`) -- for queries run through the HTTP server use
  [[with-empty-op-cache!]] instead."
  [& body]
  `(do-with-in-memory-op-cache (fn [] ~@body)))

(defn do-with-empty-op-cache!
  "Impl for [[with-empty-op-cache!]]."
  [thunk]
  (let [cache (qp.cache/op-cache)]
    (op-cache/evict-all! cache)
    (try
      (thunk)
      (finally
        (op-cache/evict-all! cache)))))

(defmacro with-empty-op-cache!
  "Run `body` with the current (shared) QP op cache emptied before and after, for tests whose queries run on other
  threads (e.g. through the HTTP server) where [[with-in-memory-op-cache]]'s dynamic binding can't reach."
  [& body]
  `(do-with-empty-op-cache! (fn [] ~@body)))
