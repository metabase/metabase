(ns metabase.actions.audit
  "Audit trail for action executions: one QueryExecution row per invocation, written synchronously on the request
  thread. A failed audit write is logged and never fails the action, so a destructive write goes untraced only when
  the app DB itself is down.

  The row's `context` (`:action-execute`, or `:public-action-execute` from the public endpoints) separates these
  write rows from the reads in `v_query_log`; `v_action_log` selects on it. Nested actions are not wrapped, so an
  invocation is one row."
  (:require
   [java-time.api :as t]
   [metabase.actions.args :as actions.args]
   [metabase.actions.db :as actions.db]
   [metabase.actions.types :as actions.types]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.permissions.core :as perms]
   [metabase.queries.models.query :as query]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private InternalTemplate
  "An action descriptor `:template` -- identifies the action, never its content."
  [:map {:closed true, :probe/id "src/metabase/actions/audit.clj:31"}
   [:type       [:= :internal]]
   [:action     [:or :string :keyword]]
   [:database   {:optional true} [:maybe pos-int?]]
   [:scope      {:optional true} ::actions.types/scope.normalized]
   [:action-id  {:optional true} [:maybe pos-int?]]])

(def ^:private Inputs
  "The input values that were actually supplied to an action invocation, across the various shapes an action's
  arguments can take."
  [:sequential [:or
                [:= {} {}]
                ::lib.schema.parameter/parameter
                [:map-of ::lib.schema.parameter/id ::lib.schema.parameter/parameter.value]
                ::actions.args/model.row.create
                ::actions.args/model.row.update
                ::actions.args/model.row.delete
                ::actions.args/table.common]])

(def ^:private Base
  "What a recording site knows about an invocation before it runs."
  [:map {:closed true}
   ;; e.g. :model.row/update, :query/execute
   [:action       :keyword]
   [:action-id    [:maybe pos-int?]]
   [:dashboard-id [:maybe pos-int?]]
   [:database-id  [:maybe pos-int?]]
   [:user-id      [:maybe pos-int?]]
   [:context      [:enum :action-execute :public-action-execute]]
   [:native?      :boolean]
   ;; hashed, and stored in `query` -- the SQL template or an action descriptor, never the input values
   [:template     [:or ::lib.schema/query ::lib-be.schema/maybe-legacy-or-empty-query InternalTemplate]]
   ;; the input values that were actually supplied: PII-gated into `parameters`
   [:inputs       Inputs]])

(defn- impersonated?
  "Whether an enforced connection-impersonation policy applies to the current user on `database-id`: the question the
  QP's impersonation preprocessing asks, so these rows agree with read rows. A lookup error (e.g. conflicting sandbox
  and impersonation policies) is logged and reads as false, so auditing never fails the action."
  [database-id]
  (boolean
   ;; public forms run with no user, and the OSS impl throws without one
   (when (and api/*current-user-id* database-id)
     (try
       (perms/impersonation-enforced-for-db? database-id)
       (catch Throwable e
         (log/warnf e "Could not resolve connection impersonation for database %d" database-id)
         false)))))

;; Mirrors `query-execution-info` in [[metabase.query-processor.middleware.process-userland-query]]; keep the two row
;; shapes in step when a column is added to `query_execution`.
(mu/defn- execution-row
  [{:keys [action-id dashboard-id database-id user-id context native? template inputs]} :- Base]
  {:action_id       action-id
   :dashboard_id    dashboard-id
   :database_id     database-id
   :executor_id     user-id
   :context         context
   :native          native?
   :hash            (lib-be/query-hash template)
   ;; not a column: `save-queries-and-update-average-execution-times!` stores it in `query`, and it is dropped
   ;; before the insert, as the userland read path does
   :json_query      template
   :parameterized   (boolean (seq inputs))
   :parameters      (when (and (seq inputs) (analytics.settings/analytics-pii-retention-enabled))
                      (json/encode inputs))
   :tenant_id       (:tenant_id @api/*current-user*)
   :started_at      (t/zoned-date-time)
   ;; an action row can never be a cache hit; setting it keeps the EE cache-rerun join from ever matching
   :cache_hit       false
   ;; native rows take both from the writeback QP's snapshot; other rows skip the QP, so ask the policy directly
   :is_impersonated (if native? false (impersonated? database-id))
   :is_db_routed    false
   :result_rows     0
   :running_time    0})

(defn do-with-audited-execution
  "Run `thunk` and record one QueryExecution row for it, whether it succeeded or failed. `base` is a [[Base]] map;
  `result->row` turns the thunk's return value (nil when it threw) into extra columns, typically `:result_rows`.

  Recording errors are logged, never thrown: the warehouse transaction has already committed or rolled back, and a
  500 after a destructive write invites a retry of it. The thunk's own exception is rethrown unchanged."
  [base result->row thunk]
  (let [start-ms (System/currentTimeMillis)
        row      (execution-row base)
        record!  (fn [extra-fn]
                   (try
                     (let [row (-> row
                                   (merge (extra-fn))
                                   (assoc :running_time (u/since-ms-wall-clock start-ms)))]
                       (query/save-queries-and-update-average-execution-times!
                        [{:query             (:json_query row)
                          :query-hash        (:hash row)
                          :execution-time-ms (:running_time row)}])
                       (actions.db/insert-query-execution! (dissoc row :json_query)))
                     (catch Throwable e
                       (log/errorf e "Failed to record action execution for %s" (:action base)))))]
    (try
      (u/prog1 (thunk)
        (record! #(result->row <>)))
      (catch Throwable e
        (record! #(assoc (result->row nil) :error (or (some-> e ex-cause ex-message) (ex-message e))))
        (throw e)))))

(defmacro with-audited-execution
  "Macro form of [[do-with-audited-execution]]."
  {:style/indent 2}
  [base result->row & body]
  `(do-with-audited-execution ~base ~result->row (fn [] ~@body)))
