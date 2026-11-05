(ns metabase-enterprise.workspaces.core
  "The workspace consumer: the workspace installed on this sidecar, and the EE implementations of the hooks in
  [[metabase.workspaces.core]].

  The installed workspace is a WorkspaceInstance: a name and, per database name, a main schema -> scratch namespace
  map. It lives in the `instance-workspace` setting, so it survives a restart. The hooks run on every EE instance
  whatever its token (`:feature :none`), because a sidecar whose token lapses must keep writing to scratch; each
  returns its OSS value without touching the app DB unless [[workspace-mode?]]."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.settings.core :as setting]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.workspaces.core :as ws]))

(set! *warn-on-reflection* true)

(defn- name-decoder
  "The JSON body middleware keywordizes map keys; database and schema names are strings."
  [k]
  (cond-> k
    (keyword? k) u/qualified-name))

(def ^:private Name
  [:string {:min 1, :decode/api name-decoder}])

(defn- distinct-namespaces?
  "Each main schema maps to its own scratch namespace, and no scratch namespace is also a main schema."
  [{:keys [databases]}]
  ;; total over any input: malli may run this on a value that failed the map schema
  (every? (fn [database]
            (let [schema-map (when (map? database) (:schemas database))
                  scratch    (when (map? schema-map) (vals schema-map))]
              (and (= (count scratch) (count (set scratch)))
                   (not-any? (set (keys schema-map)) scratch))))
          (when (map? databases) (vals databases))))

(mr/def ::workspace-instance
  "A workspace as a sidecar sees it: the workspace's name and, keyed by the name of each database it covers, that
  database's main schema -> scratch namespace map."
  [:and
   [:map {:closed true}
    [:name Name]
    [:databases [:map-of {:min 1}
                 Name
                 [:map {:closed true}
                  [:schemas [:map-of {:min 1} Name Name]]]]]]
   ;; checked over the whole value: a failing check inside the map-of would make the API strip that database
   ;; instead of saying what is wrong with it
   [:fn {:error/message "each main schema needs its own scratch namespace, and no scratch namespace may be a main schema"}
    distinct-namespaces?]])

(mu/defn- json->workspace-instance :- ::workspace-instance
  [s :- :string]
  (let [{:strs [name databases]} (json/decode s)]
    {:name      name
     :databases (update-vals databases (fn [{:strs [schemas]}] {:schemas schemas}))}))

(defn instance-workspace
  "The WorkspaceInstance installed on this instance, or nil."
  []
  (some-> (ws.settings/instance-workspace) json->workspace-instance))

(defn workspace-locked?
  "True when the workspace comes from deployment config (the `MB_INSTANCE_WORKSPACE` env var), which the API must not
  change."
  []
  (some? (setting/env-var-value :instance-workspace)))

(defenterprise workspace-mode?
  "EE implementation: true when a workspace is installed."
  :feature :none
  []
  (some? (ws.settings/instance-workspace)))

;;; -------------------------------------------------- Hooks ------------------------------------------------------

(defn- row->specs
  "A TableRemapping row as a `[from-spec to-spec]` pair; `\"\"` in a schema column is a driver without schemas."
  [row]
  [{:schema (not-empty (:from_schema row)), :table (:from_table_name row)}
   {:schema (not-empty (:to_schema row)),   :table (:to_table_name row)}])

(defenterprise table-remappings
  "EE implementation: the remappings recorded for the database, read only in workspace mode."
  :feature :none
  [database-id]
  (when (workspace-mode?)
    (not-empty (into {} (map row->specs) (ws.db/table-remappings-of-database database-id)))))

(defenterprise workspace-schemas
  "EE implementation: the schema map the installed workspace gives the database with `database`'s name."
  :feature :none
  [database]
  (when (workspace-mode?)
    (get-in (instance-workspace) [:databases (:name database) :schemas])))

(defenterprise resolve-transform-target
  "EE implementation: on a workspace database, record that the target table lives in the scratch namespace mapped to
  its schema and return the target moved there. A target whose schema the workspace does not map is refused: the
  workspace user can't write it, and content must name main tables."
  :feature :none
  [database-id target]
  (if-let [schema-map (when (workspace-mode?)
                        (ws/workspace-schemas {:name (ws.db/database-name database-id)}))]
    (let [{main-schema :schema table-name :name} target
          scratch (or (get schema-map main-schema)
                      (throw (ex-info (tru "This workspace can''t write to schema {0}: it maps only {1}."
                                           (pr-str main-schema) (pr-str (vec (sort (keys schema-map)))))
                                      {:status-code 400, :schema main-schema})))]
      (ws.db/upsert-table-remapping! {:database_id     database-id
                                      :from_db         ""
                                      :from_schema     main-schema
                                      :from_table_name table-name}
                                     {:to_db         ""
                                      :to_schema     scratch
                                      :to_table_name table-name})
      (assoc target :schema scratch))
    target))

(defenterprise rewrite-sql
  "EE implementation: rewrite with SQLGlot's `replace-names`, failing closed."
  :feature :none
  [driver remappings sql]
  (try
    (sql-tools/replace-names driver sql {:tables remappings} {:allow-unused? true})
    (catch Exception e
      (throw (ex-info (tru "This instance is a workspace, which must read remapped tables from their scratch copies, and it could not parse this SQL to find the tables it reads. Rewrite the query so it parses.")
                      {:type qp.error-type/invalid-query}
                      e)))))

;;; ---------------------------------------------- Install / remove -----------------------------------------------

(defn- database-id-named
  "The id of the one database named `database-name`; throws a 400 when none or several are."
  [database-name]
  (let [ids (ws.db/database-ids-named database-name)]
    (case (count ids)
      1 (first ids)
      0 (throw (ex-info (tru "No database is named {0}." (pr-str database-name))
                        {:status-code 400, :database database-name}))
      (throw (ex-info (tru "Several databases are named {0}: {1}." (pr-str database-name) (pr-str ids))
                      {:status-code 400, :database database-name, :database_ids ids})))))

(defn- stale-remapping-ids
  "Ids of the remapping `rows` that `instance` (with database names resolved to ids by `name->id`) no longer backs:
  their database or main schema is gone from it, or it maps the schema to another scratch namespace."
  [instance name->id rows]
  (let [schema-maps (into {}
                          (map (fn [[database-name {:keys [schemas]}]] [(name->id database-name) schemas]))
                          (:databases instance))]
    (into #{}
          (keep (fn [{:keys [id database_id from_schema to_schema]}]
                  (when-not (= to_schema (get-in schema-maps [database_id from_schema]))
                    id)))
          rows)))

(mu/defn set-instance-workspace! :- ::workspace-instance
  "Install `instance` on this instance, after checking each of its database names names exactly one database. Deletes
  the remappings the new schema maps no longer back. Returns the installed workspace."
  [instance :- ::workspace-instance]
  (let [name->id (into {} (map (juxt identity database-id-named)) (keys (:databases instance)))]
    (ws.db/delete-table-remappings! (stale-remapping-ids instance name->id (ws.db/table-remappings)))
    (ws.settings/instance-workspace! (json/encode instance))
    (instance-workspace)))

(defn clear-instance-workspace!
  "Turn workspace mode off: remove the installed workspace and every remapping."
  []
  (ws.settings/instance-workspace! nil)
  (ws.db/delete-all-table-remappings!)
  nil)

(defn table-remapping-rows
  "Every TableRemapping row, ordered by id."
  []
  (ws.db/table-remappings))
