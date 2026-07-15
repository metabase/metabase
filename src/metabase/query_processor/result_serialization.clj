(ns metabase.query-processor.result-serialization
  "Public entry point for the QP's compressed result-blob format (gzipped nippy frames), used to
  write and read `stored_result` snapshots outside the QP module. Thin re-exports over
  [[metabase.query-processor.middleware.cache.impl]], which stays module-internal.

  Prefer [[metabase.query-processor.core]], which re-exports these too; require this namespace
  directly only when your namespace sits below the qp.core facade in the load graph (e.g.
  `metabase.queries.*`, which qp.core transitively loads — requiring the facade there would be
  a load cycle)."
  (:require
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.util.namespaces :as shared.ns]))

(shared.ns/import-fns
 [cache.impl
  do-with-serialization])

(shared.ns/import-macro cache.impl/with-reducible-deserialized-results)
