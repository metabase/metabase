(ns metabase-enterprise.workspaces.common
  (:require
   [metabase.database-routing.core :as database-routing]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(defn add-database
  "Add databases for a workspace. Requires an existing database in metabase, but alternative credentials. Will route
  them using db routing. Also provide a schema-name which will be scratch pad area for working."
  [workspace router-id details schema-name]
  ;; todo: do in a transaction
  ;; todo: if db is already routed
  (if (database-routing/router-enabled? router-id {:workspace-id (:id workspace)})
    (throw (ex-info "Database is already present in workspace" {:db router-id}))
    (database-routing/create-or-update-router router-id {:workspace-id (:id workspace)}))
  (assert (:ident workspace) "Workspace must have a nice unique ident for routing")
  (database-routing/route-database router-id
                                   [{:name (:ident workspace) :details details}]
                                   {:check-connection-details? true})
  (update workspace :databases conj {:details details :parent router-id :scratch-pad schema-name})
  )

(defn remove-database
  "Remove a database from a workspace. Provide the parent id since we use a routed database agaisnt that parent."
  [workspace parent-id]
  (when-not (database-routing/router-enabled? parent-id {:workspace-id (:id workspace)})
    (throw (ex-info (tru "Database not enabled in workspace") {:workspace (:id workspace) :database-id parent-id})))
  (database-routing/delete-associated-database-router! parent-id {:workspace-id (:id workspace)}))

(defn empty-workspace
  [name]
  {:name name
   :ident (u/generate-nano-id)
   :databases []
   :documents []
   :transforms []})
