(ns metabase-enterprise.workspaces.provisioning-connection
  "The workspace provisioning connection of a database: the warehouse login that creates and drops workspace users
  and scratch namespaces. Its details are merged over the database's own `:details`, are stored encrypted, and never
  leave the server."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.core :as warehouses]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn provisioning-details :- [:maybe ms/DatabaseDetails]
  "The stored provisioning details of the Database with `database-id`, or nil when it has none."
  [database-id :- ::lib.schema.id/database]
  (:details (ws.db/provisioning-connection database-id)))

(defn- database-or-404
  [database-id]
  (or (ws.db/database database-id)
      (throw (ex-info (tru "Database {0} not found." (str database-id))
                      {:status-code 404, :database-id database-id}))))

(defn- login
  "The warehouse user that provisioning `details` log in as on `database`."
  [database details]
  (:user (merge (:details database) details)))

(defn- throw-if-live-workspaces!
  [database-id message]
  (when-let [workspaces (not-empty (ws.db/live-workspaces-of-database database-id))]
    (throw (ex-info message
                    {:status-code   409
                     :error-code    "workspaces_exist"
                     :database-id   database-id
                     :workspaces    (mapv #(into {} (select-keys % [:id :name])) workspaces)
                     :response/keys #{:workspaces}}))))

(mu/defn connection-info :- [:map {:closed true}
                             [:configured :boolean]
                             [:user       {:optional true} [:maybe :string]]
                             [:updated_at {:optional true} :some]]
  "What the API shows of the provisioning connection of the Database with `database-id`: whether one is configured,
  and if so its login and when it was last saved. Never the password. Throws a 404 for an unknown Database."
  [database-id :- ::lib.schema.id/database]
  (let [database (database-or-404 database-id)]
    (if-let [{:keys [details updated_at]} (ws.db/provisioning-connection database-id)]
      {:configured true, :user (login database details), :updated_at updated_at}
      {:configured false})))

(mu/defn save!
  "Store `details` as the provisioning connection of the Database with `database-id`, after a test connection with
  them merged over the database's own details and the driver's privilege check. Throws a 404 for an unknown Database,
  a 400 when the connection fails, a 412 naming the privileges the login lacks, and a 409 listing the workspaces on
  the database when they exist and `details`, merged over the database's own, differ from the stored connection in
  anything but the password; a new password for the same login is accepted."
  [database-id :- ::lib.schema.id/database
   details     :- ms/DatabaseDetails
   user-id     :- [:maybe ms/PositiveInt]]
  (let [database (database-or-404 database-id)]
    (when-let [existing (provisioning-details database-id)]
      ;; the workspaces' warehouse objects belong to this login on this server: while they exist, only its password
      ;; may change
      (when (not= (dissoc (merge (:details database) existing) :password)
                  (dissoc (merge (:details database) details) :password))
        (throw-if-live-workspaces!
         database-id
         (tru "Workspaces on this database were made with the user {0}; delete them before you change anything but its password."
              (login database existing)))))
    (when-let [error (warehouses/test-database-connection (:engine database) (merge (:details database) details)
                                                          :log-exception false)]
      (throw (ex-info (or (:message error) (tru "Unable to connect to the database."))
                      (assoc error :status-code 400, :error-code "connection_failed"))))
    (t2/with-transaction [_conn]
      (ws.db/save-provisioning-connection! database-id details user-id)
      ;; the check logs in through the :workspace-provisioning scope, which reads the login from the app DB on this
      ;; thread, so inside this transaction it sees the new row; a 412 rolls the row back
      (driver/check-workspace-provisioning! (keyword (:engine database)) (driver.u/lib-database database-id)))
    nil))

(mu/defn delete!
  "Delete the provisioning connection of the Database with `database-id`. Throws a 404 for an unknown Database and a
  409 listing the workspaces on the database when there are any."
  [database-id :- ::lib.schema.id/database]
  (database-or-404 database-id)
  (throw-if-live-workspaces! database-id (tru "Delete the workspaces on this database before its provisioning connection."))
  (ws.db/delete-provisioning-connection! database-id)
  nil)

