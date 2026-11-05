(ns metabase.query-processor.middleware.workspace-remapping
  "On a workspace sidecar, a transform's output lands in a scratch namespace while content keeps naming the main
  table. These two steps make every query that names a remapped main table read its scratch table instead. Both
  do nothing unless the database has remappings, and [[metabase.workspaces.core/table-remappings]] only looks for
  them in workspace mode.

  1. [[remapped-metadata-provider]], which QP setup binds in place of the database's metadata provider before
     preprocessing, reports each remapped table at its scratch location, so MBQL compiles to SQL that names the
     scratch table and every middleware in between sees the same table.
  2. [[apply-workspace-sql-remapping]] (execution) rewrites the final SQL, native or compiled from MBQL, with
     SQLGlot. This is the step that covers native SQL, and it fails closed: SQL it can't parse does not run."
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

(defn- rewrite-stages
  "Rewrite the SQL of every native stage in `stages`, including the stages of joins."
  [rewrite stages]
  (mapv (fn [stage]
          (cond-> stage
            (and (= :mbql.stage/native (:lib/type stage)) (string? (:native stage)))
            (update :native rewrite)

            (seq (:joins stage))
            (update :joins (fn [joins]
                             (mapv #(cond-> % (seq (:stages %)) (update :stages (partial rewrite-stages rewrite)))
                                   joins)))))
        stages))

(defn apply-workspace-sql-remapping
  "Execution middleware: rewrite references to remapped tables in the SQL about to run. The native stage is what the
  driver runs; `:qp/compiled` is the SQL compiled from MBQL, which also becomes the query's `native_form`."
  [qp]
  (fn [{database-id :database, :as query} rff]
    (if-let [remappings (ws/table-remappings database-id)]
      (let [rewrite  (partial ws/rewrite-sql driver/*driver* remappings)
            rewrite* #(update % :query rewrite)]
        (qp (cond-> query
              (:stages query)              (update :stages (partial rewrite-stages rewrite))
              (:qp/compiled query)         (update :qp/compiled rewrite*)
              (:qp/compiled-inline query)  (update :qp/compiled-inline rewrite*))
            rff))
      (qp query rff))))
