(ns metabase-enterprise.workspaces.core
  "Programmatic API for workspaces.

   Workspaces and their per-database configs live in the `:model/Workspace` and
   `:model/WorkspaceDatabase` rows. Mutations go through [[create-workspace!]] and
   [[delete-workspace!]]. Provisioning operations are synchronous — the caller
   waits until the warehouse work completes.

   Per-database lifecycle:

                    provision
    unprovisioned ────────────► provisioning ──────► provisioned
         ▲                           │                    │
         │                  failure  │                    │ deprovision
         │                           ▼                    ▼
         │                     unprovisioned ◄──── deprovisioning
         │                                                │
         │                                       failure  │
         │                                                ▼
         └──────────────────────────────────────── provisioned"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.models.workspace-database :as workspace-database]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Helpers ------------------------------------------------

(defn- assert-workspace-exists [workspace-id]
  (when-not (t2/exists? :model/Workspace :id workspace-id)
    (throw (ex-info "Workspace not found"
                    {:status-code 404 :workspace_id workspace-id}))))

(defn- assert-database-exists [database-id]
  (or (t2/select-one :model/Database :id database-id)
      (throw (ex-info "Database not found"
                      {:status-code 404 :database_id database-id}))))

(defn- assert-database-eligible-for-workspaces [database]
  (when-not (workspace-database/database-eligible-for-workspaces? database)
    (throw (ex-info "Workspaces are not enabled for this database"
                    {:status-code 400 :database_id (:id database)}))))

;;; ------------------------------------------------ Reads ------------------------------------------------

(defn get-workspace
  "Return the Workspace with the given `id`, hydrated with `:databases` and `:creator`.
   Returns nil if not found."
  [id]
  (workspace/get-workspace id))

(defn list-workspaces
  "Return all Workspaces, each hydrated with `:databases` and `:creator`."
  []
  (workspace/list-workspaces))

;;; ------------------------------------------------ Writes ------------------------------------------------

(defn- combined-exception
  "One exception carrying every failure in `throwables`: the first is the cause,
  the rest are attached as suppressed (the JDK mechanism for multiple failures
  on one throwable). The message is the messages the databases returned, joined
  into one line. The ex-data is shaped so the API error middleware returns just
  that message — without it, an uncaught 500 dumps the full `Throwable->map`
  cause chain into the response."
  ^Throwable [throwables]
  (let [message       (str/join "; " (map #(or (ex-message %) (str (class %))) throwables))
        ^Throwable ex (ex-info message
                               {:status-code 500
                                :message     message
                                :errors      {:_error message}}
                               (first throwables))]
    (run! #(.addSuppressed ex ^Throwable %) (rest throwables))
    ex))

(defn- provision-workspace-databases!
  "Provision every WorkspaceDatabase of the hydrated workspace `ws` synchronously
  (blocking), failing fast on the first error."
  [ws]
  (doseq [{wsd-id :id} (:databases ws)]
    (provisioning/provision-single! wsd-id)))

(defn- teardown-workspace-databases!
  "Tear down every WorkspaceDatabase of `workspace-id` — any state, blocking.
  Mirrors [[provision-workspace-databases!]], but continues past failures so each
  row gets its attempt: rows whose teardown succeeds are deleted immediately
  (progress is persisted per row, so an instance crash midway loses nothing);
  rows whose teardown fails are kept. Throws the combined failures when any
  teardown failed."
  [workspace-id]
  (let [failures (into []
                       (keep (fn [wsd]
                               (try
                                 (provisioning/teardown-workspace-database! wsd provisioning/dispatching-provisioner)
                                 nil
                                 (catch Throwable t t))))
                       (t2/select :model/WorkspaceDatabase :workspace_id workspace-id))]
    (when (seq failures)
      (throw (combined-exception failures)))))

(defn create-workspace!
  "Create a new Workspace, attach the databases with ids `database_ids` — each must
   exist (404) and be eligible for workspaces (400, see
   [[workspace-database/database-eligible-for-workspaces?]]) — with all of their
   known schemas as `input_schemas`, and provision each database (blocking).
   Returns the created workspace, hydrated.

   The workspace and its WorkspaceDatabase rows are committed BEFORE provisioning
   starts — deliberately NOT one big transaction. The rows are the durable record
   of warehouse resources that may (partially) exist, so they must survive an
   instance crash mid-provision; a rollback would erase them while the warehouse
   objects live on. Cleanup after a provisioning failure is therefore explicit:
   every database is torn down; when the cleanup removes everything, the Workspace
   row is deleted and the provisioning error is rethrown; when the cleanup itself
   fails, the workspace is kept — and returned like a successful create — with the
   failed rows (`:unprovisioned`) so the leak stays visible and the teardown can
   be retried via delete. Callers detect that case from the databases' statuses."
  [{:keys [name creator_id database_ids]}]
  (let [databases (mapv (fn [db-id]
                          (let [database (assert-database-exists db-id)]
                            (assert-database-eligible-for-workspaces database)
                            {:database_id   db-id
                             :input_schemas (workspace-database/database-input-schemas database)}))
                        database_ids)
        ws        (workspace/create-workspace! {:name       name
                                                :creator_id creator_id
                                                :databases  databases})]
    (try
      (provision-workspace-databases! ws)
      (catch Throwable t
        (let [cleaned-up? (try
                            (teardown-workspace-databases! (:id ws))
                            true
                            ;; Cleanup failed: the workspace and the failed rows are
                            ;; kept — and returned — so the teardown can be retried
                            ;; via delete. Both errors are deliberately swallowed,
                            ;; not logged (raw warehouse errors are sensitive);
                            ;; callers see the failure in the databases' statuses,
                            ;; and a delete retry surfaces the teardown errors.
                            (catch Throwable _ false))]
          (when cleaned-up?
            (try
              (workspace/delete-workspace! (:id ws))
              (catch Throwable delete-t
                (.addSuppressed t delete-t)))
            (throw (combined-exception [t]))))))
    (workspace/get-workspace (:id ws))))

(defn delete-workspace!
  "Tear down every database's warehouse isolation (any state, blocking), then
  delete the workspace. There is no partial deletion: each WorkspaceDatabase is
  either fully torn down (warehouse footprint confirmed gone, row deleted) or
  kept. Every database gets its teardown attempt even when earlier ones fail; if
  any of them fail, the workspace is kept alongside the failed rows and one
  exception combining all the failures is thrown, so the delete can be retried.
  Progress is persisted per row, so an instance crash midway loses nothing.
  Returns nil."
  [id]
  (assert-workspace-exists id)
  (teardown-workspace-databases! id)
  (workspace/delete-workspace! id)
  nil)
