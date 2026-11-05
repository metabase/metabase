(ns metabase.query-processor.middleware.workspace-remapping
  "On a workspace sidecar, a transform's output lands in a scratch namespace while content keeps naming the main
  table. This namespace makes every query that names a remapped main table read its scratch table instead, at
  execution only: MBQL compiles against the main tables' metadata (sync gives a remapped table its scratch columns),
  so compile-only paths (Convert to SQL, `POST /api/dataset/native`, `native_form`) show main names.

  QP setup reads the remappings once per query ([[metabase.workspaces.core/table-remappings]], which looks only in
  workspace mode) and carries them on the metadata provider it binds ([[carry-remappings]]). Two execution
  middlewares read them from there, so they agree for the whole query:

  - [[bypass-cache-when-remapped]] keeps the result cache out of the way, since its key ignores remappings.
  - [[apply-workspace-sql-remapping]] rewrites the SQL that runs, native or compiled from MBQL, with SQLGlot. It fails
    closed: SQL it can't parse does not run."
  (:require
   [metabase.driver :as driver]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.invocation-tracker :as lib.metadata.invocation-tracker]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util.performance :refer [mapv]]
   [metabase.workspaces.core :as ws]))

(set! *warn-on-reflection* true)

(defn carry-remappings
  "`metadata-provider` under a fresh cache layer holding `remappings`, for [[query-remappings]]. Tables are reported as
  they are, under their main names: compiling, and everything that shows compiled SQL, keep the main names, and only
  the SQL that runs is rewritten. A fresh layer, so the value never lands in a provider another query shares."
  [metadata-provider remappings]
  ;; the QP reads which metadata a query used (for permission checks), so the layer tracks invocations too
  (doto (lib.metadata.invocation-tracker/invocation-tracker-provider
         (lib.metadata.cached-provider/cached-metadata-provider metadata-provider))
    (lib.metadata.protocols/cache-value! ::remappings remappings)))

(defn- query-remappings
  "The remappings QP setup read for `query`, or nil: setup reads them once per query and carries them on the metadata
  provider it binds, so every later step agrees on them."
  [query]
  (when-let [metadata-provider (:lib/metadata query)]
    (lib.metadata.protocols/cached-value metadata-provider ::remappings nil)))

(defn rewrite-query
  "`query` with every reference to a remapped table rewritten to the scratch table, in the SQL that will run: each
  native stage (what the driver runs for a native query) and `:qp/compiled` (what it runs for any other query, compiled
  against main names). `:qp/compiled-inline` and
  the stages of joins are not rewritten: they only feed what is shown, never what runs. `query` unchanged when setup
  found no remappings."
  [query]
  (if-let [remappings (query-remappings query)]
    (let [rewrite (partial ws/rewrite-sql driver/*driver* remappings)]
      (cond-> query
        (:stages query)
        (update :stages (partial mapv #(cond-> %
                                         (and (= :mbql.stage/native (:lib/type %)) (string? (:native %)))
                                         (update :native rewrite))))

        (:qp/compiled query)
        (update-in [:qp/compiled :query] rewrite)))
    query))

(defn apply-workspace-sql-remapping
  "Execution middleware: [[rewrite-query]] the query about to run."
  [qp]
  (fn [query rff]
    (qp (rewrite-query query) rff)))

(defn bypass-cache-when-remapped
  "Execution middleware, outside the cache: a query that setup found remappings for is never served from or saved to
  the result cache, since a cached result does not say whether it read the main table or its scratch copy."
  [qp]
  (fn [query rff]
    (qp (cond-> query
          (and (:cache-strategy query) (query-remappings query)) (dissoc :cache-strategy))
        rff)))
