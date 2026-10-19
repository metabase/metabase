(ns metabase.metabot.tools.static-viz
  "Static visualization tool for the slackbot profile.
  Renders existing saved questions/metrics as PNG images in Slack."
  (:require
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.curation :as curation]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.shared :as shared]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^{:tool-name "static_viz"
           :scope     scope/agent-viz-create}
  static-viz-tool
  "Generate a static visualization (PNG image) of a saved question or metric. The visualization will be posted as a separate follow-up message in the thread."
  [{:keys [entity_id]} :- [:map {:closed true}
                           [:entity_id :int]]]
  ;; a question or a metric: judged as a metric read is, a curated card on its own or a metric by its definition
  (when (shared/curated-only?)
    (curation/check-curated-subject! (str "entity " entity_id) ["metric" entity_id]))
  {:instructions (str "Visualization queued for entity " entity_id ". "
                      "The visualization will be posted as a separate follow-up message "
                      "with the question or metric's name as its title and a link to open "
                      "it in Metabase. Use future tense when referring to the visualization "
                      "in your response — it hasn't appeared yet when the user sees your text.")
   :data-parts [(streaming/static-viz-part {:entity_id entity_id})]})
