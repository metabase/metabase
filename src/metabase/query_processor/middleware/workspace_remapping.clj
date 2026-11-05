(ns metabase.query-processor.middleware.workspace-remapping
  "On a workspace sidecar, a transform's output lands in a scratch namespace while content keeps naming the main
  table. These two steps make every query that names a remapped main table read its scratch table instead. Both
  do nothing unless the database has remappings, and [[metabase.workspaces.core/table-remappings]] only looks for
  them in workspace mode.

  1. [[remapped-metadata-provider]], which QP setup binds in place of the database's metadata provider before
     preprocessing, reports each remapped table at its scratch location, so MBQL compiles to SQL that names the
     scratch table and every middleware in between sees the same table.
  2. [[apply-workspace-sql-remapping]] (execution) rewrites the final SQL, native or compiled from MBQL, with
     SQLGlot. This is the step that covers native SQL, and it fails closed: SQL it can't parse does not run.

  The two steps read the remappings separately. A remapping recorded in between only makes step 2 rewrite more; one
  deleted in between (POST or DELETE /current) leaves MBQL compiled against the old scratch table for that one query.
  [[bypass-cache-when-remapped]] keeps the result cache out of the way, since its key ignores remappings."
  (:require
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util.performance :refer [mapv]]
   [metabase.workspaces.core :as ws]))

(set! *warn-on-reflection* true)

(defn- remap-tables
  "A [[lib.metadata/transforming-metadata-provider]] transform that moves remapped tables to their scratch location."
  [remappings]
  (fn [{metadata-type :lib/type} results]
    (if (= metadata-type :metadata/table)
      (mapv #(or (ws/remapped-table remappings %) %) results)
      results)))

(defn remapped-metadata-provider
  "`metadata-provider`, reporting each table in `remappings` at its scratch location."
  [metadata-provider remappings]
  (lib.metadata/transforming-metadata-provider (remap-tables remappings) metadata-provider))

(defn rewrite-query
  "`query` with every reference to a remapped table of its database rewritten to the scratch table, in the SQL that will
  run: each native stage (what the driver runs for a native query) and `:qp/compiled` (what it runs for any other
  query; compiled MBQL already names scratch tables, but a native source card inside it does not). `:qp/compiled-inline`
  and the stages of joins are not rewritten: they only feed what is shown, never what runs. `query` unchanged when the
  database has no remappings."
  [{database-id :database, :as query}]
  (if-let [remappings (ws/table-remappings database-id)]
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
  "Execution middleware, outside the cache: a query on a database with remappings is never served from or saved to the
  result cache, since a cached result does not say whether it read the main table or its scratch copy."
  [qp]
  (fn [{database-id :database, :as query} rff]
    (qp (cond-> query
          (and (:cache-strategy query) (ws/table-remappings database-id)) (dissoc :cache-strategy))
        rff)))
