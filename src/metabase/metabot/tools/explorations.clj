(ns metabase.metabot.tools.explorations
  "Exploration-specific tool wrappers."
  (:require
   [metabase.explorations.core :as explorations]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private select-exploration-metrics-schema
  [:map {:closed true}
   [:metric_ids [:sequential :int]]])

(mu/defn ^{:tool-name "select_research_metrics"}
  select-exploration-metrics-tool
  "Select the metrics to include in the research. Populates the research artifact with the chosen metrics."
  [{:keys [metric_ids]} :- select-exploration-metrics-schema]
  (explorations/exploration-data {:metric-ids metric_ids}))

(def ^:private set-exploration-name-schema
  [:map {:closed true}
   [:name :string]])

(mu/defn ^{:tool-name "set_research_name"}
  set-exploration-name-tool
  "Set the name of the research artifact."
  [{:keys [name]} :- set-exploration-name-schema]
  {:name  name})

(def ^:private select-exploration-timelines-schema
  [:map {:closed true}
   [:timeline_ids [:sequential :int]]])

(mu/defn ^{:tool-name "select_research_timelines"}
  select-exploration-timelines-tool
  "Select the timelines to include in the research. Populates the research artifact with the chosen timelines."
  [{:keys [timeline_ids]} :- select-exploration-timelines-schema]
  {:timeline_ids timeline_ids})
