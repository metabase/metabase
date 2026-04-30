(ns metabase-enterprise.workspaces.config
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.workspace-database/keep-me)

(defn- user-entry
  "Admin user entry derived from the workspace creator. Returns nil when the creator
   has been deleted or has no email — without a real identity to bind the user to,
   we'd be inventing one, so we skip the section instead. The password is read from
   the `MB_WORKSPACE_USER_PASSWORD` env var at config-from-file load time, so the
   developer running the local instance picks the password themselves."
  [creator]
  (when-let [email (:email creator)]
    {:first_name   (:first_name creator)
     :last_name    (:last_name creator)
     :email        email
     :password     "{{env MB_WORKSPACE_USER_PASSWORD}}"
     :is_superuser true}))

(defn- database-entry [wsd db]
  {:name    (:name db)
   :engine  (:engine db)
   :details (merge (:details db)
                   (:database_details wsd)
                   {:schema-filters-type     "inclusion"
                    :schema-filters-patterns (str/join "," (:input_schemas wsd))})})

(defn- workspace-database-entry [wsd db]
  [(:name db) {:input_schemas (vec (:input_schemas wsd))
               :output_schema (:output_schema wsd)}])

(defn build-workspace-config
  "Return a downloadable config.yml-shaped map for `workspace-id`:

    {:version 1
     :config  {:databases [...]
               :workspace {:name      <ws-name>
                           :databases {<db-name> {:input_schemas :output_schema}}}}}

  Each database entry merges the underlying `metabase_database.details` with the
  WorkspaceDatabase's override credentials and adds `schema-filters-*` keys
  derived from `:input_schemas`. Returns nil when the workspace does not exist.
  Throws a 409 `ex-info` if any of the workspace's databases is not
  `:provisioned`."
  [workspace-id]
  (when-let [ws (workspace/get-workspace workspace-id)]
    (let [wsds    (:databases ws)
          creator (:creator ws)]
      (when (some #(not= :provisioned (:status %)) wsds)
        (throw (ex-info "Cannot build config while workspace has databases that are not :provisioned"
                        {:status-code  409
                         :workspace_id workspace-id})))
      (let [dbs-by-id (if-let [ids (seq (map :database_id wsds))]
                        (into {} (map (juxt :id identity))
                              (t2/select :model/Database :id [:in ids]))
                        {})
            pairs     (for [wsd wsds
                            :let [db (get dbs-by-id (:database_id wsd))]]
                        [wsd db])
            user      (user-entry creator)]
        {:version 1
         :config  (cond-> {:databases (mapv (fn [[wsd db]] (database-entry wsd db)) pairs)
                           :workspace {:name      (:name ws)
                                       :databases (into {} (map (fn [[wsd db]] (workspace-database-entry wsd db))) pairs)}}
                    user (assoc :users [user]))}))))

(defn config->yaml
  "Render a workspace config map as a pretty-printed YAML string."
  [config]
  (yaml/generate-string config :dumper-options {:flow-style :block}))
