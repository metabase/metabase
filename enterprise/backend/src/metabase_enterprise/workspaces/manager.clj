(ns metabase-enterprise.workspaces.manager
  "Creating, renaming and deleting workspaces: their rows in the app DB, and their users and scratch namespaces in
  the warehouse through the driver's workspace methods.

  Creation commits the rows, all in flight and locked by the request (see [[metabase-enterprise.workspaces.status]]),
  before any warehouse work, so a crash mid-way leaves rows that record what may exist in the warehouse. A failure
  rolls back what the request made: the driver tears down each database it initialized, and the rows are deleted.
  When that teardown fails too, the failed databases' rows stay `:failed` for a later delete."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.status :as ws.status]
   [metabase-enterprise.workspaces.workspace :as ws.workspace]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::create-request
  [:map {:closed true}
   [:name      ms/NonBlankString]
   [:databases [:sequential {:min 1}
                [:map {:closed true}
                 [:database_id ::lib.schema.id/database]
                 [:schemas     [:sequential {:min 1} ms/NonBlankString]]]]]])

(mr/def ::create-result
  "What [[create-workspace!]] returns: the created Workspace, or, when its rollback also failed, the id of the
  Workspace whose `:failed` databases still need a delete."
  [:or
   [:map {:closed true} [:workspace :map]]
   [:map {:closed true} [:cleanup-required-workspace-id ms/PositiveInt]]])

;;; ------------------------------------------------- Errors -------------------------------------------------

(def ^:private passed-through-statuses
  "Status codes of driver errors the API returns as they are: they describe the request or a precondition, not a
  warehouse failure."
  #{400 404 409 412})

(defn- api-error
  "The exception the API returns for `e`, a failure provisioning a workspace: driver errors with a status code in
  [[passed-through-statuses]] as they are, the existing-user 409 with an error code, and anything else as a 502
  carrying the warehouse's message, which the driver has scrubbed of the workspace password."
  ^Throwable [^Throwable e]
  (let [{:keys [status-code] :as data} (ex-data e)]
    (cond
      (false? (:workspace/cleanup? data))
      (ex-info (ex-message e) {:status-code 409, :error-code "workspace_user_exists"} e)

      (passed-through-statuses status-code)
      e

      :else
      (ex-info (or (ex-message e) (tru "The warehouse returned an error."))
               {:status-code 502, :error-code "warehouse_error"}
               e))))

(defn- workspace-or-404
  [id]
  (or (ws.db/workspace id)
      (throw (ex-info (tru "Workspace {0} not found." (str id)) {:status-code 404, :id id}))))

;;; ------------------------------------------------- Create -------------------------------------------------

(defn- check-unique!
  [values message]
  (when-not (apply distinct? values)
    (throw (ex-info message {:status-code 400}))))

(defn- checked-database
  "The Database of `request-database`, with what provisioning it needs. Throws a 404 for an unknown Database and a 400
  for one whose engine does not support workspaces, or a schema that cannot be a main schema."
  [{:keys [database_id schemas]}]
  (let [database (or (ws.db/database database_id)
                     (throw (ex-info (tru "Database {0} not found." (str database_id))
                                     {:status-code 404, :database-id database_id})))
        engine   (keyword (:engine database))
        lib-db   (driver.u/lib-database database_id)]
    (when-not (driver.u/supports? engine :workspace lib-db)
      (throw (ex-info (tru "Workspaces are not supported on {0} databases." (name engine))
                      {:status-code 400, :error-code "workspaces_unsupported", :database-id database_id})))
    (check-unique! schemas (tru "Database {0} names a schema more than once." (str database_id)))
    (run! driver.u/check-workspace-main-schema! schemas)
    {:database-id database_id, :engine engine, :lib-db lib-db, :schemas schemas}))

(defn- insert-database-rows!
  "Insert the WorkspaceDatabase of `database` in `workspace-id` and a WorkspaceSchema per main schema, all in flight
  and locked by this request. Returns `database` with its `:wsd` row and `:schema-rows`, each with its `:lock_token`."
  [workspace-id {:keys [database-id engine lib-db schemas] :as database}]
  (let [isolation-id (driver.u/random-isolation-id)
        wsd          (ws.workspace/insert-workspace-database!
                      {:workspace_id     workspace-id
                       :database_id      database-id
                       :isolation_id     isolation-id
                       :database_details (driver/workspace-isolation-details engine lib-db {:isolation_id isolation-id})
                       :status           :provisioning
                       :lock_token       (ws.status/new-lock-token)})]
    (assoc database
           :wsd         wsd
           :schema-rows (mapv #(ws.workspace/insert-workspace-schema!
                                (:id wsd) % :adding (fn [schema-row]
                                                      (driver/workspace-scratch-namespace engine lib-db wsd schema-row)))
                              schemas))))

(defn- insert-rows!
  "Insert the Workspace and the rows of each of `databases` (see [[insert-database-rows!]]) in one transaction, so a
  missing provisioning connection or an invalid schema leaves nothing. Returns `[workspace-id databases]`."
  [workspace-name creator-id databases]
  (t2/with-transaction [_conn]
    (let [workspace-id (ws.db/insert-workspace! workspace-name creator-id)]
      ;; in Database id order: each insert locks that Database's provisioning connection row, and two creates taking
      ;; the same rows in opposite orders would deadlock
      [workspace-id (mapv #(insert-database-rows! workspace-id %) (sort-by :database-id databases))])))

(defn- provision-database!
  "Create the workspace user and scratch namespaces of `database` in the warehouse, moving each schema to `:active`
  and the database to `:provisioned`. Refreshes the database's lock before each step, so a long create keeps it, and
  throws a 409 before any warehouse change once another request has taken it over. Returns the new lock token."
  [{:keys [engine lib-db wsd schema-rows]}]
  (let [{:keys [id lock_token]} wsd]
    (ws.status/refresh-lock! :database id lock_token)
    (driver/init-workspace-isolation! engine lib-db wsd)
    (doseq [{schema-id :id, :keys [main_schema scratch_namespace], schema-token :lock_token} schema-rows]
      (ws.status/refresh-lock! :database id lock_token)
      (driver/add-workspace-schema! engine lib-db wsd main_schema scratch_namespace)
      (ws.status/change-status! :schema schema-id schema-token #{:adding} :active))
    (ws.status/change-status! :database id lock_token #{:provisioning} :provisioned)))

(defn- provision-all!
  "[[provision-database!]] for each of `databases` in order, stopping at the first failure. Returns
  `{:provisioned <databases done, with their new :lock_token and :status>, :failed <the database that failed>, :error
  <its exception>}`, the last two only on failure."
  [databases]
  (loop [[database & more] databases
         provisioned       []]
    (if-not database
      {:provisioned provisioned}
      (let [result (try
                     {:token (provision-database! database)}
                     (catch Throwable e
                       {:error e}))]
        (if-let [e (:error result)]
          {:provisioned provisioned, :failed database, :error e}
          (recur more (conj provisioned (-> database
                                            (assoc-in [:wsd :lock_token] (:token result))
                                            (assoc-in [:wsd :status] :provisioned)))))))))

(defn- roll-back-database!
  "Tear down `database`, whose lock this request holds, in the warehouse. Returns nil when it is gone, or the
  exception when it is not; its row is then `:failed`. Never throws."
  [{:keys [engine lib-db database-id], {:keys [id lock_token status] :as wsd} :wsd}]
  (try
    (let [token (ws.status/change-status! :database id lock_token #{status} :deprovisioning)]
      (try
        (driver/destroy-workspace-isolation! engine lib-db wsd)
        nil
        (catch Throwable e
          (log/warnf "Rolling back workspace database %d on Database %d failed: %s" id database-id (ex-message e))
          (ws.status/change-status! :database id token #{:deprovisioning} :failed)
          e)))
    (catch Throwable e
      (log/warnf "Rolling back workspace database %d on Database %d failed: %s" id database-id (ex-message e))
      e)))

(defn- roll-back!
  "Undo a create of `workspace-id` that failed at `failed` with `error`, after `provisioned` were done. The databases
  provisioned, and the failed one unless its error says the warehouse objects are not this workspace's
  (`:workspace/cleanup? false`), are torn down; the rows of every database that left nothing in the warehouse are
  deleted. Returns the ids of the WorkspaceDatabases left `:failed`."
  [workspace-id {:keys [provisioned failed error]} databases]
  (let [teardown  (cond-> provisioned
                    (not (false? (:workspace/cleanup? (ex-data error)))) (conj failed))
        left      (into #{} (keep (fn [database]
                                    (when (roll-back-database! database)
                                      (get-in database [:wsd :id]))))
                        teardown)]
    (if (empty? left)
      (ws.db/delete-workspace! workspace-id)
      (doseq [{{wsd-id :id} :wsd} databases
              :when (not (left wsd-id))]
        (ws.db/delete-workspace-database! wsd-id)))
    left))

(mu/defn create-workspace! :- ::create-result
  "Create a workspace named `name` by `creator-id` on each of `databases` with its main `schemas`, and provision it in
  the warehouse, blocking until done. Returns `{:workspace <the Workspace>}`.

  Throws, leaving nothing behind, a 400 for a database named twice, an unsupported engine or an invalid schema; a 404
  for an unknown Database; a 409 `provisioning_connection_missing` for a database without a provisioning login. When
  the warehouse work fails, everything made is rolled back and the error thrown: a driver precondition (412) or
  request error as it is, an existing workspace user as a 409 `workspace_user_exists` (that user is left alone), and
  anything else as a 502 `warehouse_error`. When the rollback fails too, returns
  `{:cleanup-required-workspace-id <id>}`: the Workspace stays, with its `:failed` databases."
  [{workspace-name :name, :keys [databases]} :- ::create-request
   creator-id                                :- [:maybe ms/PositiveInt]]
  (check-unique! (map :database_id databases) (tru "A database is named more than once."))
  (let [checked                   (mapv checked-database databases)
        [workspace-id databases]  (insert-rows! workspace-name creator-id checked)
        {:keys [error] :as result} (provision-all! databases)]
    (if-not error
      {:workspace (ws.workspace/workspace workspace-id)}
      (let [left (roll-back! workspace-id result databases)]
        (if (empty? left)
          (throw (api-error error))
          (do
            (log/warnf "Workspace %d failed to provision and its rollback failed; it needs a delete. Cause: %s"
                       workspace-id (ex-message error))
            {:cleanup-required-workspace-id workspace-id}))))))

;;; ------------------------------------------------- Rename -------------------------------------------------

(mu/defn rename-workspace! :- :map
  "Rename the Workspace with `id` to `workspace-name` and return it. Throws a 404 when there is none."
  [id             :- ms/PositiveInt
   workspace-name :- ms/NonBlankString]
  (workspace-or-404 id)
  (ws.db/rename-workspace! id workspace-name)
  (ws.workspace/workspace id))

;;; ------------------------------------------------- Delete -------------------------------------------------

(defn- take-delete-locks!
  "Take the lock of each of `wsds`, rows with an effective `:status`, by moving it to `:deprovisioning` from
  `:provisioned` or `:failed` (a stale in-flight row reads as failed). Returns each with its `:lock_token`. When one is
  held by another request, gives back those already taken and throws its 409."
  [wsds]
  (reduce (fn [taken {:keys [id] :as wsd}]
            (let [token (try
                          (ws.status/take-lock! :database id #{:provisioned :failed} :deprovisioning)
                          (catch Throwable e
                            (doseq [{taken-id :id, :keys [status lock_token]} taken]
                              (try
                                (ws.status/change-status! :database taken-id lock_token #{:deprovisioning} status)
                                (catch Throwable give-back-e
                                  ;; the row reads as failed once stale, so a later delete can still take it
                                  (log/warnf "Giving back the lock of workspace database %d failed: %s"
                                             taken-id (ex-message give-back-e)))))
                            (throw e)))]
              (conj taken (assoc wsd :lock_token token))))
          []
          wsds))

(defn- tear-down-database!
  "Tear down `wsd`, whose lock this request took, in the warehouse and delete its row. Refreshes the lock first, so
  a delete of many databases keeps the ones it has not reached, and stops with a failure when another request has
  taken it over since. Returns nil, or `{:database_id, :message}` when the teardown fails; its row is then `:failed`.
  Never throws."
  [{:keys [id database_id lock_token] :as wsd}]
  (try
    (ws.status/refresh-lock! :database id lock_token)
    (driver/destroy-workspace-isolation! (keyword (:engine (ws.db/database database_id)))
                                         (driver.u/lib-database database_id)
                                         wsd)
    (ws.db/delete-workspace-database! id)
    nil
    (catch Throwable e
      (log/warnf "Deleting workspace database %d on Database %d failed: %s" id database_id (ex-message e))
      (try
        (ws.status/change-status! :database id lock_token #{:deprovisioning} :failed)
        (catch Throwable status-e
          (log/warnf "Marking workspace database %d failed failed: %s" id (ex-message status-e))))
      {:database_id database_id
       :message     (or (ex-message e) (tru "The warehouse returned an error."))})))

(mu/defn delete-workspace! :- :nil
  "Tear down every database of the Workspace with `id` in the warehouse, then delete it. Throws a 404 when there is
  none, and a 409 when another request holds one of its databases (nothing is torn down then). Each database's row is
  deleted once its teardown succeeds; when some fail, throws a 502 listing them, the Workspace and their rows stay
  `:failed`, and a retry is safe."
  [id :- ms/PositiveInt]
  (workspace-or-404 id)
  (let [wsds     (map (fn [wsd]
                        (-> wsd
                            (assoc :status (ws.status/effective-status (:status wsd) (:stale wsd)))
                            (dissoc :stale)))
                      (ws.db/workspace-databases-of-workspaces [id] (ws.status/staleness :database)))
        failures (into [] (keep tear-down-database!) (take-delete-locks! wsds))]
    (when (seq failures)
      (throw (ex-info (tru "Tearing down the workspace failed for some databases; retry the delete.")
                      {:status-code   502
                       :error-code    "teardown_failed"
                       :workspace_id  id
                       :databases     failures
                       :response/keys #{:workspace_id :databases}})))
    (ws.db/delete-workspace! id)
    nil))
