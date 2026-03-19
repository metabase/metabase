(ns metabase.metabot.agent.tools.resources
  "Resource reading tool wrappers."
  (:require
   [metabase.metabot.tools.read-resource :as read-resource-tools]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private schema
  [:map {:closed true}
   [:uris [:sequential [:string {:description "Metabase resource URIs to fetch"}]]]])

(defn read-resource-tool "read-resource-tool" []
  {:tool-name "read_resource"
   :doc       "Read detailed information about Metabase resources via URI patterns.

  Supports fetching multiple resources in parallel using metabase:// URIs:
  - metabase://table/{id}/fields - Get table structure with fields
  - metabase://model/{id}/fields/{field_id} - Get specific field details
  - metabase://metric/{id}/dimensions - Get metric dimensions
  - metabase://transform/{id} - Get transform details
  - metabase://dashboard/{id} - Get dashboard details"
   :schema    [:=> [:cat schema] :any]
   :fn        (fn [{:keys [uris]}]
                (try
                  (read-resource-tools/read-resource {:uris uris})
                  (catch Exception e
                    (log/error e "Error in read_resource tool")
                    {:output (str "Failed to read resources: " (or (ex-message e) "Unknown error"))})))})
