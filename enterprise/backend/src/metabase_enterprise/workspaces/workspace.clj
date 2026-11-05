(ns metabase-enterprise.workspaces.workspace
  "Reading and writing the rows of a workspace: the Workspace, a WorkspaceDatabase per database and a WorkspaceSchema
  per main schema. Nothing here touches a warehouse."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.status :as ws.status]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(mu/defn insert-workspace-schema!
  "Insert a WorkspaceSchema for `main-schema` in the WorkspaceDatabase with `workspace-database-id`, in status `status`,
  and return it. Its `:scratch_namespace` is `(scratch-namespace-fn row)` of the inserted row, whose `:id` is part of
  the name; the row is never visible without it."
  [workspace-database-id :- ms/PositiveInt
   main-schema           :- ms/NonBlankString
   status                :- [:enum :adding :active :removing :failed]
   scratch-namespace-fn  :- ifn?]
  (t2/with-transaction [_conn]
    ;; the name needs the row id, which only the insert assigns: insert under a unique stand-in, then rename, in one
    ;; transaction
    (let [row     (ws.db/insert-workspace-schema! {:workspace_database_id workspace-database-id
                                                   :main_schema           main-schema
                                                   :scratch_namespace     (str "pending-" (random-uuid))
                                                   :status                status})
          scratch (scratch-namespace-fn row)]
      (ws.db/set-scratch-namespace! (:id row) scratch)
      (assoc row :scratch_namespace scratch))))

(defn- workspace-with-databases
  [workspace databases-by-workspace schemas-by-database now]
  (assoc workspace :databases
         (vec (for [wsd (databases-by-workspace (:id workspace))]
                (assoc wsd
                       :status  (ws.status/database-status (:status wsd) (:updated_at wsd) now)
                       :schemas (vec (schemas-by-database (:id wsd))))))))

(mu/defn workspaces-page :- [:map [:data [:sequential :map]] [:total :int]]
  "One page of Workspaces, in id order, each with its `:databases` and their `:schemas`, never with a
  `:database_details`: `{:data <up to limit workspaces after offset>, :total <number of workspaces>}`. A database's
  `:status` is the status it reads as (see [[ws.status/database-status]])."
  [{:keys [limit offset]} :- [:map {:closed true}
                              [:limit  ms/PositiveInt]
                              [:offset ms/IntGreaterThanOrEqualToZero]]]
  (let [workspaces (ws.db/workspaces-page limit offset)
        databases  (when (seq workspaces)
                     (ws.db/workspace-databases-of-workspaces (mapv :id workspaces)))
        schemas    (when (seq databases)
                     (ws.db/workspace-schemas-of-workspace-databases (mapv :id databases)))
        by-ws      (group-by :workspace_id databases)
        by-wsd     (group-by :workspace_database_id schemas)
        now        (OffsetDateTime/now)]
    {:data  (mapv #(workspace-with-databases % by-ws by-wsd now) workspaces)
     :total (ws.db/workspace-count)}))
