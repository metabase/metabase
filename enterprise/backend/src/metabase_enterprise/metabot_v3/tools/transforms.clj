(ns metabase-enterprise.metabot-v3.tools.transforms
  (:require
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase-enterprise.transforms-python.api :as transforms-python.api]
   [metabase.transforms-rest.api.transform :as api.transforms]
   [metabase.transforms.core :as transforms]
   [metabase.util.malli.registry :as mr]))

(mr/def ::transform-source ::api.transforms/transform-source)
(mr/def ::transform-target ::api.transforms/transform-target)

(defn get-transforms
  "Get a list of all known transforms."
  [_args]
  (try
    {:structured_output
     (->> (api.transforms/get-transforms)
          (into [] (comp (filter #(or (transforms/python-transform? %)
                                      (transforms/native-query-transform? %)))
                         (filter :source_readable)
                         (map #(select-keys % [:id :entity_id :name :type :description :source])))))}
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))

(defn get-transform-details
  "Get information about a transform."
  [{:keys [transform-id]}]
  (try
    {:structured_output
     (api.transforms/get-transform transform-id)}
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))

(defn get-transform-python-library-details
  "Get information about a Python library by path."
  [{:keys [path]}]
  (try
    {:structured_output
     (transforms-python.api/get-python-library-by-path path)}
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))
