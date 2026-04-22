(ns metabase-enterprise.workspaces.core)

(def ^:private workspaces-config (atom nil))

(def ^:private example-config
  {:name "github",
   :databases
   {(keyword "Analytics Data Warehouse") {:input_schemas ["raw_github"]
                                          :output_schema "mb__isolation_754bd_github"}}})

(defn active?
  []
  (boolean @workspaces-config))

(defn set-config!
  [config]
  (reset! workspaces-config config))
