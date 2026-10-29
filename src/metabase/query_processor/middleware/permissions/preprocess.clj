(ns metabase.query-processor.middleware.permissions.preprocess
  "Pre-processing middleware that prepares an incoming query for the permission checks that run later.

  Separate from [[metabase.query-processor.middleware.permissions]] because that namespace needs the
  `query-permissions` module to do the checking, and `query-permissions` in turn
  needs [[metabase.query-processor.preprocess]] to resolve the sources of a query."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn remove-internal-keys :- ::lib.schema/query
  "Pre-processing middleware. Strip internal query-processor keys from the incoming `query` so that they can only ever
  be set by the query processor itself, not supplied by a client. Skipped while re-running pivot sub-queries, which
  legitimately carry these keys."
  [query :- ::lib.schema/query]
  (cond-> query
    (not qp.pipeline/*pivot?*) lib/prepare-after-deserialization))

(mu/defn record-referenced-card-ids :- ::lib.schema/query
  "Pre-processing middleware. Record the source-card IDs referenced by `query` under the
  `:query-permissions/referenced-card-ids` key."
  [query :- ::lib.schema/query]
  (u/assoc-dissoc query :query-permissions/referenced-card-ids (lib/all-source-card-ids-recursive query)))
