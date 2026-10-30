(ns metabase.metabot.tools.static-viz
  "Render saved questions and metrics as PNG images in Slack."
  (:require
   [metabase.api.common :as api]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.curation :as curation]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]))

(set! *warn-on-reflection* true)

(defn- queued-output
  [{card-id :id card-name :name card-type :type}]
  (str "<result>\n"
       "Visualization queued for " (name card-type) " \"" (llm-shape/escape-xml-content card-name) "\" (ID "
       card-id "). It will be posted as a separate follow-up message in the thread, with its name as the title "
       "and a link to open it in Metabase.\n"
       "</result>\n"
       "<instructions>\n"
       "Use the future tense when describing the visualization, because it has not appeared when the user reads "
       "your message.\n"
       "</instructions>"))

(defrecord StaticVizTool []
  tools/Tool
  (declaration [_]
    {:name        "static_viz"
     :description (str "Generate a static visualization (PNG image) of a saved question or metric. The "
                       "visualization will be posted as a separate follow-up message in the thread.")
     :scope       scope/agent-viz-create
     :metabot/curation :gated
     :args        [:map {:closed true} [:entity_id :int]]})

  (handle [_ {:keys [entity_id]} _ctx]
    (let [card (tools/with-entity {:kind :card :id entity_id}
                 (api/read-check (metabot.db/card entity_id)))]
      ;; a question or a metric: judged as a metric read is, a curated card on its own or a metric by its definition
      (when (shared/curated-only?)
        (curation/check-curated-subject! (str (name (:type card)) " " entity_id) ["metric" entity_id]))
      {:output     (queued-output card)
       :data-parts [(streaming/static-viz-part {:entity_id entity_id})]})))

(def static-viz-tool
  "The `static_viz` tool."
  (->StaticVizTool))
