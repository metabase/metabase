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

(defn- present-schema
  [{:keys [status error] :as schema}]
  (cond-> (select-keys schema [:main_schema :scratch_namespace :status])
    (and (= :failed status) error) (assoc :error error)))

(defn- present-database
  [wsd schemas database]
  {:database_id (:database_id wsd)
   :database    (select-keys database [:id :name :engine])
   :status      (:status wsd)
   :schemas     (mapv present-schema schemas)})

(defn- present-workspace
  "The API's `Workspace`: `workspace` with its creator from `users-by-id`, its databases from `databases-by-workspace`
  with each Database from `database-by-id`, and their schemas from `schemas-by-database`. Never a password or lock
  token: `databases-by-workspace` and `schemas-by-database` hold rows read without them."
  [workspace users-by-id databases-by-workspace schemas-by-database database-by-id]
  {:id         (:id workspace)
   :name       (:name workspace)
   :creator    (some-> (users-by-id (:creator_id workspace)) (select-keys [:id :email :common_name]))
   :created_at (:created_at workspace)
   :updated_at (:updated_at workspace)
   :databases  (vec (for [wsd (databases-by-workspace (:id workspace))]
                      (present-database (with-effective-status wsd)
                                        (map with-effective-status (schemas-by-database (:id wsd)))
                                        (database-by-id (:database_id wsd)))))})

(defn- present-workspaces
  "[[present-workspace]] for each of `workspaces`, reading their databases, schemas, creators and Databases."
  [workspaces]
  (let [databases (when (seq workspaces)
                    (ws.db/workspace-databases-of-workspaces (mapv :id workspaces) (ws.status/staleness :database)))
        schemas   (when (seq databases)
                    (ws.db/workspace-schemas-of-workspace-databases (mapv :id databases)
                                                                    (ws.status/staleness :schema)))
        users     (when-let [ids (seq (keep :creator_id workspaces))]
                    (ws.db/users (vec (distinct ids))))
        dbs       (when (seq databases)
                    (ws.db/databases (vec (distinct (map :database_id databases)))))
        by-id     (fn [rows] (into {} (map (juxt :id identity)) rows))
        by-ws     (group-by :workspace_id databases)
        by-wsd    (group-by :workspace_database_id schemas)]
    (mapv #(present-workspace % (by-id users) by-ws by-wsd (by-id dbs)) workspaces)))

(mu/defn workspaces-page :- [:map [:data [:sequential :map]] [:total :int]]
  "One page of Workspaces as the API shows them (see [[present-workspace]]), in id order:
  `{:data <up to limit workspaces after offset, or all when limit is nil>, :total <number of workspaces>}`. A
  database's `:status`, and each schema's, is the status it reads as (see [[ws.status/effective-status]])."
  [{:keys [limit offset]} :- [:map {:closed true}
                              [:limit  [:maybe ms/PositiveInt]]
                              [:offset ms/IntGreaterThanOrEqualToZero]]]
  {:data  (present-workspaces (ws.db/workspaces-page limit offset))
   :total (ws.db/workspace-count)})

(mu/defn workspace :- [:maybe :map]
  "The Workspace with `id` as the API shows it (see [[present-workspace]]), or nil."
  [id :- ms/PositiveInt]
  (some-> (ws.db/workspace id) vector present-workspaces first))
