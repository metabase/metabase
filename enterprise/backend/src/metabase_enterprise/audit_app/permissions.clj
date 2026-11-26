(ns metabase-enterprise.audit-app.permissions
  (:require
   [metabase-enterprise.audit-app.db :as audit-app.db]
   [metabase.audit-app.core :as audit]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.error-type :as qp.error-type]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(def audit-db-view-names
  "Used for giving granular permissions into the audit db. Instead of granting permissions to
   all of the audit db, we query the audit db using the names of each view that starts with v_."
  #{"v_audit_log"
    "v_content"
    "v_dashboardcard"
    "v_group_members"
    "v_subscriptions"
    "v_users"
    "v_alerts"
    "v_databases"
    "v_fields"
    "v_query_log"
    "v_tables"
    "v_tenants"
    "v_tasks"
    "v_task_runs"
    "v_view_log"
    "v_metabot_conversations"
    "v_metabot_messages"
    "v_ai_usage_log"
    "v_mcp_tool_calls"
    "v_agent_api_calls"
    "v_api_key_usage"})

(defenterprise check-audit-db-permissions
  "Performs a number of permission checks to ensure that a query on the Audit database can be run.
   Causes for rejection are:
      - if the current user does not have access to the analytics collection
      - native queries
      - queries that include tables that are not audit views"
  :feature :audit-app
  [{database-id :database :as query}]
  ;; Each refusal has a QP error type, so that agents (Metabot, MCP, the Agent API) tell the caller why the query
  ;; failed. They show the message of the invalid-query refusals. For the permissions refusal, some agents (Metabot
  ;; `run_query`, Slackbot) show their own permission message.
  ;; The query goes under `:query`, because its own `:type` key would take the place of the error type.
  ;; Check if the user has access to the analytics collection, since this should be coupled with access to the
  ;; audit database in general.
  (when-not (some-> (audit/default-audit-collection) (t2/hydrate :can_read) mi/can-read?)
    (throw (query-perms/perms-exception (tru "You do not have access to the audit database") nil {:query query})))
  (let [{:keys [table-ids native?]} (query-perms/query->source-ids query)]
    (when native?
      (throw (ex-info (tru "Native queries are not allowed on the audit database")
                      {:type qp.error-type/invalid-query, :query query})))
    (qp.store/with-metadata-provider database-id
      (doseq [table-id table-ids]
        (when-not (audit-db-view-names
                   (u/lower-case-en (:name (lib.metadata/table (qp.store/metadata-provider) table-id))))
          (throw (ex-info (tru "Audit queries are only allowed on audit views")
                          {:type qp.error-type/invalid-query, :query query})))))))

(defn- set-view-tables-create-queries!
  "Set `:perms/create-queries` to `value` for the group with `group-id` on each of `view-tables`, the last in a call of
  its own so that the Database-level coalescing sees the other Tables already set."
  [group-id view-tables value]
  (when-let [last-table (peek view-tables)]
    (when-let [other-tables (seq (pop view-tables))]
      (perms/set-table-permissions! group-id :perms/create-queries (zipmap other-tables (repeat value))))
    (perms/set-table-permission! group-id last-table :perms/create-queries value)))

(defenterprise update-audit-collection-permissions!
  "Set the create-queries permission on the audit views for each group of `changes`, a map of group id to its
  Collection changes, that changes its access to the instance analytics Collection, and return `changes` with write
  access to that Collection downgraded to read."
  :feature :audit-app
  [changes]
  (let [audit-collection-id (:id (audit/default-audit-collection))
        audit-accesses      (into [] (keep (fn [[group-id group-changes]]
                                             (when-let [access (get group-changes audit-collection-id)]
                                               [group-id access])))
                                  changes)
        view-tables         (when (seq audit-accesses)
                              (vec (audit-app.db/tables-of-database-named audit/audit-db-id audit-db-view-names)))]
    (reduce (fn [changes [group-id access]]
              (set-view-tables-create-queries! group-id view-tables (case access
                                                                      (:read :write) :query-builder
                                                                      :none          :no))
              (cond-> changes
                (= access :write) (assoc-in [group-id audit-collection-id] :read)))
            changes
            audit-accesses)))
