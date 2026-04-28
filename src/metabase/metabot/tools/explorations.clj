(ns metabase.metabot.tools.explorations
  "Exploration-specific tool wrappers."
  (:require
   [metabase.metabot.scope :as scope]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private select-exploration-metrics-schema
  [:map {:closed true}
   [:metric_ids [:sequential :int]]])

(mu/defn ^{:tool-name "select_exploration_metrics"
           :scope     scope/agent-search}
  select-exploration-metrics-tool
  "Select the metrics to include in the Exploration."
  [{:keys [metric_ids]} :- select-exploration-metrics-schema]
  {:metric_ids  (vec metric_ids)})
