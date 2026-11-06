(ns metabase-enterprise.workspaces.provisioning-connection
  "The workspace provisioning connection of a database: the warehouse login that creates and drops workspace users
  and scratch namespaces. Its details are merged over the database's own `:details`, are stored encrypted, and never
  leave the server."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.premium-features.core :refer [defenterprise]]
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

(defn warehouse-or-throw
  "The Database with `database-id`. Throws a 404 when there is none, and a 400 when it is not an ordinary warehouse
  the admin connected: the audit database (whose connections go to Metabase's own app DB), the sample database, an
  attached data warehouse, or a database-routing destination."
  [database-id]
  (let [database (or (ws.db/database database-id)
                     (throw (ex-info (tru "Database {0} not found." (str database-id))
                                     {:status-code 404, :database-id database-id})))]
    (when (or (:is_audit database) (:is_sample database) (:is_attached_dwh database) (:router_database_id database))
      (throw (ex-info (tru "Workspaces are not supported on this database.")
                      {:status-code 400, :error-code "workspaces_unsupported", :database-id database-id})))
    database))

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
  (let [database (warehouse-or-throw database-id)]
    (if-let [{:keys [details updated_at]} (ws.db/provisioning-connection database-id)]
      {:configured true, :user (login database details), :updated_at updated_at}
      {:configured false})))

(defn- invalidate-provisioning-pool!
  "Close the database's pool of provisioning-login connections: after its login is deleted or refused, they would
  otherwise stay open as that login until the next use notices the change."
  [database-id]
  (sql-jdbc/invalidate-pool-for-db-and-type! database-id :workspace-provisioning))

(mu/defn save!
  "Store `details` as the provisioning connection of the Database with `database-id`, after a test connection with
  them merged over the database's own details and the driver's privilege check. Throws a 404 for an unknown Database;
  a 400 when its engine does not support workspaces or the connection fails; a 412 naming the privileges the login
  lacks, keeping the stored login; and a 409 listing the workspaces on the database when they exist and `details`,
  merged over the database's own, differ from the stored connection in anything but the password (or there is no
  stored connection). A new password for the same login is accepted."
  [database-id :- ::lib.schema.id/database
   details     :- ms/DatabaseDetails
   user-id     :- [:maybe ms/PositiveInt]]
  (let [database    (warehouse-or-throw database-id)
        engine      (keyword (:engine database))
        lib-db      (driver.u/lib-database database-id)
        same-login? (fn [existing]
                      (= (dissoc (merge (:details database) existing) :password)
                         (dissoc (merge (:details database) details) :password)))]
    ;; before the test connection, and so that check-workspace-provisioning!, which has no default, is only called
    ;; for an engine that implements it
    (when-not (driver.u/supports? engine :workspace lib-db)
      (throw (ex-info (tru "Workspaces are not supported on {0} databases." (name engine))
                      {:status-code 400, :error-code "workspaces_unsupported"})))
    (when (str/blank? (:user details))
      (throw (ex-info (tru "The provisioning connection needs a user.")
                      {:status-code 400, :errors {:user (tru "value must be a non-blank string")}})))
    ;; before taking the lock, so a slow warehouse does not hold up workspace creation or a Database delete
    (when-let [error (warehouses/test-database-connection (:engine database) (merge (:details database) details)
                                                          :log-exception false)]
      (throw (ex-info (or (:message error) (tru "Unable to connect to the database."))
                      (assoc error :status-code 400, :error-code "connection_failed"))))
    ;; The row lock is held until commit. Creating a workspace database takes the same lock first (see
    ;; [[metabase-enterprise.workspaces.workspace/insert-workspace-database!]]), so no workspace can appear between the
    ;; check below and the write. The foreign key alone would not do: H2 does not lock the parent row for it.
    (t2/with-transaction [_conn]
      (let [existing (when (ws.db/lock-provisioning-connection! database-id)
                       (provisioning-details database-id))]
        (when-not (and existing (same-login? existing))
          ;; the workspaces' warehouse objects belong to the stored login on this server: while they exist, only its
          ;; password may change
          (throw-if-live-workspaces!
           database-id
           (tru "Workspaces exist on this database; delete them before you change anything but the password of its provisioning login."))))
      (ws.db/save-provisioning-connection! database-id details user-id)
      ;; the check logs in through the :workspace-provisioning scope, which reads the login from the app DB on this
      ;; thread, so inside this transaction it sees the new row; a 412 rolls the row back
      (try
        (driver/check-workspace-provisioning! engine lib-db)
        (catch Throwable e
          (invalidate-provisioning-pool! database-id)
          (throw e))))
    nil))

(mu/defn delete!
  "Delete the provisioning connection of the Database with `database-id` and close its connections. Throws a 404 for
  an unknown Database and a 409 listing the workspaces on the database when there are any."
  [database-id :- ::lib.schema.id/database]
  (warehouse-or-throw database-id)
  (t2/with-transaction [_conn]
    (ws.db/lock-provisioning-connection! database-id)
    (throw-if-live-workspaces! database-id (tru "Delete the workspaces on this database before its provisioning connection."))
    (ws.db/delete-provisioning-connection! database-id))
  (invalidate-provisioning-pool! database-id)
  nil)

(defenterprise check-no-workspaces!
  "Throws a 409 listing the workspaces on the Database with `database-id`, if any. Not gated on `:workspaces`: their
  warehouse users outlive the feature."
  :feature :none
  [database-id]
  ;; Runs in the Database delete's transaction (Toucan runs before-delete hooks in it), so the lock is held through the
  ;; delete: a workspace database created meanwhile waits for it, then finds no provisioning login.
  (ws.db/lock-provisioning-connection! database-id)
  (throw-if-live-workspaces! database-id (tru "Delete the workspaces on this database before the database.")))

(def ^:private connection-identity-keys
  "The `:details` keys that decide which server, database and login a connection reaches. The provisioning login is
  merged over them, and the workspaces' warehouse objects live there."
  [:host :port :dbname :db :user :tunnel-enabled :tunnel-host :tunnel-port :tunnel-user])

(defenterprise check-connection-identity-change!
  "Throws a 409 listing the workspaces on the Database with `database-id` when it has a provisioning connection and the
  update from `old-details` to `new-details` changes the server, database, login or SSH tunnel: the provisioning login
  would be sent there, and teardown would miss the workspaces' users and schemas. A password change is allowed. Not
  gated on `:workspaces`, like [[check-no-workspaces!]]."
  :feature :none
  [database-id old-details new-details]
  ;; details that are not maps (say, still encrypted under another key during a key rotation) carry no identity to
  ;; compare
  (when (and (map? old-details)
             (map? new-details)
             (not= (select-keys old-details connection-identity-keys)
                   (select-keys new-details connection-identity-keys))
             (ws.db/lock-provisioning-connection! database-id))
    (throw (ex-info (tru "This database has a workspace provisioning connection. Delete its workspaces and the provisioning connection before you change its host, port, database, user or SSH tunnel.")
                    {:status-code   409
                     :error-code    "workspaces_exist"
                     :database-id   database-id
                     :workspaces    (mapv #(into {} (select-keys % [:id :name]))
                                          (ws.db/live-workspaces-of-database database-id))
                     :response/keys #{:workspaces}}))))
