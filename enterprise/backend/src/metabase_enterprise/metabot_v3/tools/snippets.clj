(ns metabase-enterprise.metabot-v3.tools.snippets
  (:require
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.native-query-snippets.core :as snippets]))

(defn get-snippets
  "Lists SQL snippets available to the current user."
  [_args]
  (try
    {:structured_output
     (->> (snippets/list-native-query-snippets)
          (map #(select-keys % [:id :name :description])))}
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))

(defn get-snippet-details
  "Retrieve a specific SQL snippet by ID, including its content."
  [{:keys [snippet-id]}]
  (try
    {:structured_output
     (when snippet-id
       (when-let [snippet (snippets/get-native-query-snippet snippet-id)]
         (select-keys snippet [:id :name :description :content])))}
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))
