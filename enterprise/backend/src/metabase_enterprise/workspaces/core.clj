(ns metabase-enterprise.workspaces.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(def ^:private workspaces-config (atom nil))

(def ^:private example-config
  {:name "github",
   :databases
   {2 ;; db-id
    {:name "Analytics Data Warehouse"
     :input_schemas ["raw_github"]
     :output_schema "mb__isolation_754bd_github"}}})

(defenterprise active?
  "Are we in workspace mode at all?"
  :feature :workspaces
  :fallback :oss
  []
  (boolean @workspaces-config))

(defn set-config!
  [config]
  (reset! workspaces-config config))

(defenterprise db-workspace-schema
  "Return the workspace-isolated schema name configured for `db-id`, or nil
   when no workspace is configured for that database."
  :feature :workspaces
  :fallback :oss
  [db-id]
  (get-in @workspaces-config [:databases db-id :output_schema]))
