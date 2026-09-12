(ns metabase-enterprise.workspaces.impl
  "Workspaces: remapping CRUD and the cached read the query processor uses. `metabase-enterprise.workspaces.core`
  exposes these as the EE implementations of the `metabase.workspaces.core` hooks, and as the method telling
  the query processor which table a query naming a canonical table should really read."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.app-db.core :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.workspaces.schema :as ws.schema]))

(set! *warn-on-reflection* true)

(def ^:private ^{:arglists '([db-id])} cached-remappings-for-db
  "The remappings of the Database with `db-id`, cached for a few seconds so the query processor does not hit the app
  DB on every query. Writes on this instance clear it; other instances see them once the entry expires."
  (memoize/ttl
   ^{::memoize/args-fn (fn [[db-id]] [(mdb/unique-identifier) db-id])}
   (fn [db-id] (ws.db/remappings-for-db db-id))
   :ttl/threshold 5000))

(def ^:private ^{:arglists '([])} cached-workspace-schemas
  "Every `{:db_id, :schema}` transforms write into, cached like [[cached-remappings-for-db]]: read while building SQL,
  so it must not hit the app DB on every query."
  (memoize/ttl
   ^{::memoize/args-fn (fn [_] [(mdb/unique-identifier)])}
   (fn []
     (into []
           (keep (fn [{:keys [id settings]}]
                   (when-let [schema (not-empty (:workspaces-schema settings))]
                     {:db_id id, :schema schema})))
           (ws.db/databases-and-settings)))
   :ttl/threshold 5000))

(mu/defn workspace-schemas :- [:sequential [:map
                                            [:db_id ::lib.schema.id/database]
                                            [:schema ::lib.schema.common/non-blank-string]]]
  "Every `{:db_id, :schema}` transforms write their output into while workspaces are on, otherwise empty."
  []
  (if (ws.settings/workspaces-enabled)
    (cached-workspace-schemas)
    []))

(mu/defn- clear-remappings-cache! :- :nil
  []
  (memoize/memo-clear! cached-remappings-for-db)
  (memoize/memo-clear! cached-workspace-schemas)
  nil)

(mu/defn remappings-for-db :- [:maybe [:sequential ::ws.schema/workspace-table-remapping]]
  "The remappings of the Database with `db-id` while workspaces are enabled, otherwise nil."
  [db-id :- ::lib.schema.id/database]
  (when (ws.settings/workspaces-enabled)
    (not-empty (cached-remappings-for-db db-id))))

(mu/defn- workspace-schema-for-database :- ::lib.schema.common/non-blank-string
  "The workspace schema of `database`. Throws unless it is set and usable."
  [{:keys [engine] :as database} :- [:map [:id ::lib.schema.id/database] [:engine :keyword]]]
  (let [schema (setting/with-database database
                 (ws.settings/workspaces-schema))]
    (when-not (driver.u/supports? engine :schemas database)
      (throw (ex-info (tru "Workspaces are not supported on database {0}: its driver has no schemas." (:name database))
                      {:status-code 400, :database-id (:id database)})))
    (when (str/blank? schema)
      (throw (ex-info (tru "No workspace schema is set on database {0}. Set one before running transforms."
                           (:name database))
                      {:status-code 400, :database-id (:id database)})))
    (when-not (driver/schema-exists? engine (:id database) schema)
      (throw (ex-info (tru "The workspace schema {0} does not exist on database {1}. Create it before running transforms."
                           schema (:name database))
                      {:status-code 400, :database-id (:id database), :schema schema})))
    schema))

(mu/defn- random-table-name :- ::lib.schema.common/non-blank-string
  "A fresh workspace table name: a random UUID without dashes."
  []
  (str/replace (str (random-uuid)) "-" ""))

(mu/defn- get-or-create-remapping! :- ::ws.schema/workspace-table-remapping
  "The remapping of the canonical table, moved to `to-schema` if the workspace schema changed since it was created,
  or a new one. Safe against a concurrent first run of the same target."
  [db-id       :- ::lib.schema.id/database
   from-schema :- [:maybe :string]
   from-table  :- ::lib.schema.common/non-blank-string
   to-schema   :- ::lib.schema.common/non-blank-string]
  (let [id (ws.db/update-or-insert-remapping!
            db-id from-schema from-table
            (fn [existing]
              (cond
                (nil? existing)                        {:to_schema to-schema, :to_table (random-table-name)}
                (not= (:to_schema existing) to-schema) {:to_schema to-schema})))]
    (clear-remappings-cache!)
    (ws.db/remapping id)))

(mu/defn remap-table! :- ::ws.schema/table-info
  "Record (or reuse) the remapping of the canonical table `table-name` in `schema` and return its workspace table."
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (let [database  (ws.db/database db-id)
        to-schema (workspace-schema-for-database database)
        {:keys [to_schema to_table]} (get-or-create-remapping! db-id schema table-name to-schema)]
    {:schema to_schema, :name to_table}))

(mu/defn unmap-table! :- :nil
  "Delete the remapping of the canonical table `table-name` in `schema`."
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (ws.db/delete-remapping-for-source! db-id schema table-name)
  (clear-remappings-cache!))

(mu/defn workspace-table :- ::ws.schema/table-info
  "The workspace table backing the canonical table `table-name` in `schema`, or that table itself."
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (if-let [{:keys [to_schema to_table]} (ws.db/remapping-for-source db-id schema table-name)]
    {:schema to_schema, :name to_table}
    {:schema schema, :name table-name}))

(mu/defn canonical-table :- ::ws.schema/table-info
  "The canonical table backed by the workspace table `table-name` in `schema`, or that table itself."
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  (if-let [{:keys [from_schema from_table]} (ws.db/remapping-for-target db-id schema table-name)]
    {:schema from_schema, :name from_table}
    {:schema schema, :name table-name}))

(mu/defn table-remappings :- [:sequential ::ws.schema/workspace-table-remapping]
  "Every remapping of the Database with `db-id`."
  [db-id :- ::lib.schema.id/database]
  (ws.db/remappings-for-db db-id))
