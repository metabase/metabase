(ns metabase-enterprise.metabot.tools.transforms
  (:require
   [metabase-enterprise.transforms-python.api :as transforms-python.api]
   [metabase.metabot.tools.util :as metabot.tools.u]))

(defn get-transform-python-library-details
  "Get information about a Python library by path."
  [{:keys [path]}]
  (try
    {:structured_output
     (transforms-python.api/get-python-library-by-path path)}
    (catch Exception e
      (metabot.tools.u/handle-agent-error e))))
