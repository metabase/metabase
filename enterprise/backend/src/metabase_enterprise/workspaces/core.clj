(ns metabase-enterprise.workspaces.core)

(def ^:private workspaces-config (atom nil))

(defn active?
  []
  (boolean @workspaces-config))

(defn set-config!
  [config]
  (reset! workspaces-config config))
