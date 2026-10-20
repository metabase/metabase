(ns metabase.metabot.tools.static-viz
  "Static visualization tool for the slackbot profile.
  Renders existing saved questions/metrics as PNG images in Slack."
  (:require
   [metabase.api.common :as api]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]))

(set! *warn-on-reflection* true)

(defn- queued-output
  [{card-id :id card-name :name card-type :type}]
  (str "<result>\n"
       "Visualization queued for " (name card-type) " \"" (llm-shape/escape-xml-content card-name) "\" (id "
       card-id "). It will be posted as a separate follow-up message in the thread, with its name as the title "
       "and a link to open it in Metabase.\n"
       "</result>\n"
       "<instructions>\n"
       "Use future tense when referring to the visualization, because it hasn't appeared yet when the user sees "
       "your text.\n"
       "</instructions>"))

(defrecord StaticVizTool []
  tools/Tool
  (declaration [_]
    {:name        "static_viz"
     :description (str "Generate a static visualization (PNG image) of a saved question or metric. The "
                       "visualization will be posted as a separate follow-up message in the thread.")
     :scope       scope/agent-viz-create
     :args        [:map {:closed true} [:entity_id :int]]})

  (handle [_ {:keys [entity_id]} _ctx]
    (let [card (tools/with-entity {:kind :card :id entity_id}
                 (api/read-check (metabot.db/card entity_id)))]
      {:output     (queued-output card)
       :data-parts [(streaming/static-viz-part {:entity_id entity_id})]})))

(def static-viz-tool
  "The `static_viz` tool."
  (->StaticVizTool))
