(ns metabase-enterprise.workspaces.workspace
  "Reading and writing the rows of a workspace: the Workspace, a WorkspaceDatabase per database and a WorkspaceSchema
  per main schema. Nothing here touches a warehouse."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.status :as ws.status]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn insert-workspace-database!
  "Insert a WorkspaceDatabase and return it. Every creation of a workspace database goes through here: it locks the
  database's provisioning connection row first, in the same transaction, so it cannot interleave with a change or
  deletion of that login (see [[metabase-enterprise.workspaces.provisioning-connection/save!]]). Throws a 409
  `provisioning_connection_missing` when the database has none."
  [row :- [:map {:closed true}
           [:workspace_id     ms/PositiveInt]
           [:database_id      ms/PositiveInt]
           [:isolation_id     :string]
           [:database_details ms/DatabaseDetails]
           [:status           [:enum :provisioning :provisioned :deprovisioning :failed]]
           [:lock_token       :string]]]
  (t2/with-transaction [_conn]
    (when-not (ws.db/provisioning-connection-for-update (:database_id row))
      (throw (ex-info (tru "This database has no workspace provisioning connection.")
                      {:status-code 409, :error-code "provisioning_connection_missing", :database-id (:database_id row)})))
    (ws.db/insert-workspace-database! row)))

(mu/defn insert-workspace-schema!
  "Insert a WorkspaceSchema for `main-schema` in the WorkspaceDatabase with `workspace-database-id`, in status `status`,
  and return it with its `:lock_token`: the caller holds its lock. Its `:scratch_namespace` is
  `(scratch-namespace-fn row)` of the inserted row, whose `:id` is part of the name; the row is never visible without
  it."
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
                                                   :status                status
                                                   :lock_token            (ws.status/new-lock-token)})
          scratch (scratch-namespace-fn row)]
      (ws.db/set-scratch-namespace! (:id row) scratch)
      (assoc row :scratch_namespace scratch))))

(defn- with-effective-status
  [row]
  (-> row
      (assoc :status (ws.status/effective-status (:status row) (:stale row)))
      (dissoc :stale)))

(defn- workspace-with-databases
  [workspace databases-by-workspace schemas-by-database]
  (assoc workspace :databases
         (vec (for [wsd (databases-by-workspace (:id workspace))]
                (assoc (with-effective-status wsd)
                       :schemas (mapv with-effective-status (schemas-by-database (:id wsd))))))))

(mu/defn workspaces-page :- [:map [:data [:sequential :map]] [:total :int]]
  "One page of Workspaces, in id order, each with its `:databases` and their `:schemas`, never with a
  `:database_details`: `{:data <up to limit workspaces after offset>, :total <number of workspaces>}`. A database's
  `:status`, and each schema's, is the status it reads as (see [[ws.status/effective-status]])."
  [{:keys [limit offset]} :- [:map {:closed true}
                              [:limit  ms/PositiveInt]
                              [:offset ms/IntGreaterThanOrEqualToZero]]]
  (let [workspaces (ws.db/workspaces-page limit offset)
        databases  (when (seq workspaces)
                     (ws.db/workspace-databases-of-workspaces (mapv :id workspaces) (ws.status/staleness :database)))
        schemas    (when (seq databases)
                     (ws.db/workspace-schemas-of-workspace-databases (mapv :id databases)
                                                               (ws.status/staleness :schema)))
        by-ws      (group-by :workspace_id databases)
        by-wsd     (group-by :workspace_database_id schemas)]
    {:data  (mapv #(workspace-with-databases % by-ws by-wsd) workspaces)
     :total (ws.db/workspace-count)}))
