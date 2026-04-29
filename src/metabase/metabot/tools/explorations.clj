(ns metabase.metabot.tools.explorations
  "Exploration-specific tool wrappers."
  (:require
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private select-exploration-metrics-schema
  [:map {:closed true}
   [:metric_ids [:sequential :int]]])

(mu/defn ^{:tool-name "select_exploration_metrics"}
  select-exploration-metrics-tool
  "Select the metrics to include in the Exploration."
  [{:keys [metric_ids]} :- select-exploration-metrics-schema]
  {:metric_ids  (vec metric_ids)})

(def ^:private set-exploration-name-schema
  [:map {:closed true}
   [:name :string]])

(mu/defn ^{:tool-name "set_exploration_name"}
  set-exploration-name-tool
  "Set the name of the Exploration."
  [{:keys [name]} :- set-exploration-name-schema]
  {:name  name})
