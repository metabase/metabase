(ns metabase.metabot.tools.show-entity
  "Display existing Metabase content inline in a conversation."
  (:require
   [metabase.api.common :as api]
   [metabase.documents.core :as documents]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- readable-entity
  [entity-type entity-id]
  (let [entity (case entity-type
                 ("question" "model" "metric") (api/read-check :model/Card entity-id)
                 "dashboard" (api/read-check :model/Dashboard entity-id)
                 "document" (documents/get-document entity-id)
                 "table" (api/read-check :model/Table entity-id))]
    (api/check-404 (and entity
                        (not (:archived entity))
                        (or (not= entity-type "table") (:active entity))))
    (when (#{"question" "model" "metric"} entity-type)
      (api/check-404 (= entity-type (name (:type entity)))))
    entity))

(mu/defn ^{:tool-name "show_entity"
           :scope     scope/agent-search}
  show-entity-tool
  "Show an existing question, model, metric, dashboard, document, or table inline in the conversation.
  Use after search or read_resource when the user asks to find or show existing content. Questions, models,
  and metrics render as live chart previews; other entities render as link cards. Show the best 1–3 matches.
  This does not create or modify content and does not return query results to you."
  [{entity-type :entity_type entity-id :entity_id}
   :- [:map {:closed true}
       [:entity_type [:enum "question" "model" "metric" "dashboard" "document" "table"]]
       [:entity_id pos-int?]]]
  (let [entity (readable-entity entity-type entity-id)
        title  (or (:display_name entity) (:name entity))
        url    (links/resolve-metabase-uri (str "metabase://" entity-type "/" entity-id) {} {})]
    {:output (str "Showing " title " inline. The user can open the existing item from its title. "
                  "Do not claim to have created it or describe data values you have not inspected.")
     :data-parts [(streaming/shown-entity-part {:type entity-type :id entity-id :title title :url url})]}))
