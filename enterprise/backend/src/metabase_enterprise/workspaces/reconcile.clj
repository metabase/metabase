(ns metabase-enterprise.workspaces.reconcile
  "Diff-and-reconcile engine for workspace databases.

   [[diff-workspace-databases]] is a pure function that computes the operations needed to transition from the current
  database list to a desired one.

   [[reconcile-workspace-databases!]] executes those operations, persisting an audit trail in
  `workspace_database_operation` and `workspace_database_operation_step`."
  (:require
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.models.workspace-database-operation]
   [metabase-enterprise.workspaces.models.workspace-database-operation-step]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Pure diff -----------------------------------------------------

(defn diff-workspace-databases
  "Pure diff: given `current` (the workspace's existing database rows) and `desired`
   (the proposed database list), return a vector of operations. Each operation is a map:

     {:op-type         :add | :remove | :modify
      :database_id     int
      :wsd-id          int (nil for :add — row doesn't exist yet)
      :requested_input [{:db ? :schema ?} ...]  (nil for :remove)
      :steps           [{:op :op/deprovision ...} {:op :op/provision ...} ...]}

   Ordering: removals first, then modifications, then additions.
   Steps within each operation are ordered and independently executable.

   `current` is a seq of maps with at least `:database_id`, `:id`, `:input`, and
   `:status`. `desired` is a seq of maps with `:database_id` and `:input`.
   Input comparison uses set equality (order-independent)."
  [current desired]
  (let [cur-by-db (into {} (map (juxt :database_id identity)) current)
        des-by-db (into {} (map (juxt :database_id identity)) desired)
        cur-ids   (set (keys cur-by-db))
        des-ids   (set (map :database_id desired))
        ;; removals: deprovision (if provisioned) then delete row
        remove-ops (into []
                         (map (fn [db-id]
                                (let [{:keys [id status]} (cur-by-db db-id)]
                                  {:op-type         :remove
                                   :database_id     db-id
                                   :wsd-id          id
                                   :requested_input nil
                                   :steps           (cond-> []
                                                      (= :provisioned status)
                                                      (conj {:op :op/deprovision :database_id db-id :wsd-id id})
                                                      true
                                                      (conj {:op :op/delete-row :database_id db-id :wsd-id id}))})))
                         (remove des-ids cur-ids))
        ;; modifications: deprovision (if provisioned) → update input → provision
        modify-ops (into []
                         (keep (fn [db-id]
                                 (let [cur (cur-by-db db-id)
                                       des (des-by-db db-id)]
                                   (when (not= (set (:input cur)) (set (:input des)))
                                     (let [wsd-id (:id cur)]
                                       {:op-type         :modify
                                        :database_id     db-id
                                        :wsd-id          wsd-id
                                        :requested_input (:input des)
                                        :steps           (cond-> []
                                                           (= :provisioned (:status cur))
                                                           (conj {:op :op/deprovision :database_id db-id :wsd-id wsd-id})
                                                           true
                                                           (conj {:op :op/update-input :database_id db-id :wsd-id wsd-id
                                                                  :input (:input des)})
                                                           true
                                                           (conj {:op :op/provision :database_id db-id :wsd-id wsd-id}))})))))
                         (filter des-ids cur-ids))
        ;; additions: insert row → provision
        add-ops (into []
                      (map (fn [db-id]
                             (let [des (des-by-db db-id)]
                               {:op-type         :add
                                :database_id     db-id
                                :wsd-id          nil
                                :requested_input (:input des)
                                :steps           [{:op :op/insert-row :database_id db-id :input (:input des)}
                                                  {:op :op/provision  :database_id db-id}]})))
                      (remove cur-ids des-ids))]
    (into [] cat [remove-ops modify-ops add-ops])))

;;; -------------------------------------------- Step execution ----------------------------------------------------

(defn- execute-step
  "Execute a single primitive step. Returns the step map with `:result :ok`
   or, for `:op/insert-row`, with `:wsd-id` also set."
  [workspace-id {:keys [op] :as step}]
  (case op
    :op/deprovision
    (do (provisioning/deprovision-single! (:wsd-id step))
        (assoc step :result :ok))

    :op/delete-row
    (do (t2/delete! :model/WorkspaceDatabase :id (:wsd-id step))
        (assoc step :result :ok))

    :op/update-input
    (do (t2/update! :model/WorkspaceDatabase {:id (:wsd-id step)}
                    {:input (:input step)})
        (assoc step :result :ok))

    :op/insert-row
    (let [wsd-id (t2/insert-returning-pk! :model/WorkspaceDatabase
                                          {:workspace_id     workspace-id
                                           :database_id      (:database_id step)
                                           :input            (:input step)
                                           :database_details {}
                                           :output_schema    ""})]
      (assoc step :result :ok :wsd-id wsd-id))

    :op/provision
    (do (provisioning/provision-single! (:wsd-id step))
        (assoc step :result :ok))))

(defn- persist-step-result!
  "Update a step row with its execution result."
  [step-id {:keys [result started_at] :as step-result}]
  (let [now (OffsetDateTime/now)]
    (t2/update! :model/WorkspaceDatabaseOperationStep {:id step-id}
                (cond-> {:status (case result
                                   :ok      :success
                                   :error   :error
                                   :skipped :skipped)}
                  started_at
                  (assoc :started_at started_at)
                  (#{:ok :error} result)
                  (assoc :completed_at now)
                  (= :error result)
                  (assoc :error (:error step-result))))))

(defn- execute-operation-steps
  "Walk the steps of a single operation, executing each in order. If a step
   fails, remaining steps are marked `:skipped`. Calls `on-step` with each
   step's result immediately after execution so persistence is never deferred."
  [workspace-id steps on-step]
  (reduce (fn [{:keys [results failed? wsd-id]} [position step]]
            (if failed?
              (let [result (assoc step :result :skipped)]
                (on-step position result)
                {:results (conj results result) :failed? true :wsd-id wsd-id})
              (let [step    (cond-> (assoc step :started_at (OffsetDateTime/now))
                              (and (= :op/provision (:op step)) (nil? (:wsd-id step)) wsd-id)
                              (assoc :wsd-id wsd-id))
                    result  (try
                              (execute-step workspace-id step)
                              (catch Throwable t
                                (log/warnf t "Step %s failed for database %s"
                                           (name (:op step)) (:database_id step))
                                (assoc step :result :error :error (ex-message t))))]
                (on-step position result)
                {:results (conj results result)
                 :failed? (= :error (:result result))
                 :wsd-id  (or (:wsd-id result) wsd-id)})))
          {:results [] :failed? false :wsd-id nil}
          (map-indexed vector steps)))

(defn- run-operation!
  "Create the operation + step rows, execute steps with immediate persistence."
  [workspace-id user-id {:keys [op-type database_id wsd-id requested_input steps]}]
  (let [op-id    (t2/insert-returning-pk! :model/WorkspaceDatabaseOperation
                                          {:workspace_database_id wsd-id
                                           :database_id           database_id
                                           :op_type               op-type
                                           :requested_input       requested_input
                                           :initiated_by          user-id
                                           :status                :in-progress})
        step-ids (t2/insert-returning-pks! :model/WorkspaceDatabaseOperationStep
                                           (vec (map-indexed (fn [i step]
                                                               {:operation_id op-id
                                                                :op           (:op step)
                                                                :position     i
                                                                :status       :pending})
                                                             steps)))
        on-step  (fn [position result]
                   (persist-step-result! (nth step-ids position) result)
                   ;; backfill workspace_database_id when insert-row creates the row
                   (when (and (nil? wsd-id) (:wsd-id result))
                     (t2/update! :model/WorkspaceDatabaseOperation {:id op-id}
                                 {:workspace_database_id (:wsd-id result)})))
        {:keys [results failed?]} (execute-operation-steps workspace-id steps on-step)
        op-status (if failed? :error :success)]
    (t2/update! :model/WorkspaceDatabaseOperation {:id op-id}
                {:status       op-status
                 :completed_at (OffsetDateTime/now)})
    {:op-id       op-id
     :op-type     op-type
     :database_id database_id
     :status      op-status
     :results     (vec results)}))

;;; -------------------------------------------- Entry point -------------------------------------------------------

(defn reconcile-workspace-databases!
  "Apply the diff between the workspace's current databases and `desired`.
   Uses [[diff-workspace-databases]] for the pure diff, then executes each operation, persisting operation + step rows
  for audit trail.

   `ws` is a hydrated workspace (with `:databases`). The caller is responsible for fetching and 404-checking.

   Each operation is independent — a failure in one database does not prevent processing others. Within an operation,
  a failed step skips remaining steps.

   Returns the updated workspace, hydrated. Throws with `:status-code 207` when some operations fail."
  [ws desired user-id]
  (let [workspace-id (:id ws)
        operations   (diff-workspace-databases (:databases ws) desired)
        results      (into [] (map #(run-operation! workspace-id user-id %)) operations)
        errors       (filter #(= :error (:status %)) results)
        ws'          (workspace/get-workspace workspace-id)]
    (if (seq errors)
      (throw (ex-info "Some database operations failed"
                      {:status-code 207
                       :errors      errors
                       :workspace   ws'}))
      ws')))
