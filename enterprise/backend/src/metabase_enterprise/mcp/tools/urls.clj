(ns metabase-enterprise.mcp.tools.urls
  "MCP tool for generating Metabase UI URLs for entities."
  (:require
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase.system.settings :as system.settings]
   [metabase.util.json :as json]))

(defn- base-url []
  (or (system.settings/site-url) "http://localhost:3000"))

(defn- entity-url
  "Build a full Metabase URL for a given entity type and ID."
  [entity-type id & {:keys [extra]}]
  (let [base (base-url)
        path (case entity-type
               "workspace"  (str "/data-studio/workspaces/" id)
               "transform"  (str "/data-studio/transforms/" id)
               "table"      (str "/question#" id)
               "database"   (str "/browse/databases/" id)
               "question"   (str "/question/" id)
               "dashboard"  (str "/dashboard/" id)
               "collection" (str "/collection/" id)
               (str "/" entity-type "/" id))]
    (str base path (when extra extra))))

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "get_entity_url"
                           :description  "Get the Metabase UI URL for an entity. Use this to give users clickable links to workspaces, transforms, tables, databases, questions, or dashboards."
                           :annotations  {"readOnlyHint" true}
                           :input-schema {:type       "object"
                                          :properties {"entity_type" {:type "string"
                                                                      :enum ["workspace" "transform" "table" "database" "question" "dashboard" "collection"]
                                                                      :description "Type of entity"}
                                                       "id"          {:type ["integer" "string"] :description "Entity ID"}}
                                          :required   ["entity_type" "id"]}
                           :handler
                           (fn [{:strs [entity_type id]}]
                             {:content [{:type "text"
                                         :text (json/encode {:url (entity-url entity_type id)})}]})})
