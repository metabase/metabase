(ns metabase-enterprise.metabot-v3.agent.tools.resources
  "Resource reading tool wrappers."
  (:require
   [metabase-enterprise.metabot-v3.tools.read-resource :as read-resource-tools]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^{:tool-name "read_resource"} read-resource-tool
  "Read detailed information about Metabase resources via URI patterns.

  Supports fetching multiple resources in parallel using metabase:// URIs:
  - metabase://table/{id}/fields - Get table structure with fields
  - metabase://model/{id}/fields/{field_id} - Get specific field details
  - metabase://metric/{id}/dimensions - Get metric dimensions
  - metabase://transform/{id} - Get transform details
  - metabase://dashboard/{id} - Get dashboard details"
  [{:keys [uris]}
   :- [:map {:closed true}
       [:uris [:sequential [:string {:description "Metabase resource URIs to fetch"}]]]]]
  (read-resource-tools/read-resource-tool {:uris uris}))
