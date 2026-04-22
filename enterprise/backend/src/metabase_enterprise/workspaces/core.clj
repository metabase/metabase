(ns metabase-enterprise.workspaces.core)

(def ^:private workspaces-config (atom nil))

(def ^:private example-config
  {:name "github",
   :databases
   {2                                                       ;db-id
    {:name "Analytics Data Warehouse"
     :input_schemas ["raw_github"]
     :output_schema "mb__isolation_754bd_github"}}})

(defn active?
  "Are we in workspace mode at all?"
  []
  (boolean @workspaces-config))

(defn set-config!
  [config]
  (reset! workspaces-config config))

(defn db-workspace-schema
  [db-id]
  (get-in @workspaces-config [:databases db-id :output_schema]))
