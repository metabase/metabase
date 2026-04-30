(ns metabase.metabot.tools.explorations
  "Exploration-specific tool wrappers."
  (:require
   [metabase.explorations.core :as explorations]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private select-exploration-metrics-schema
  [:map {:closed true}
   [:metric_ids [:sequential :int]]])

(mu/defn ^{:tool-name "select_exploration_metrics"}
  select-exploration-metrics-tool
  "Select the metrics to include in the Exploration. Returns the same hydrated
   `{:metrics ... :dimension_groups ...}` shape as `GET /api/exploration/dimensions`,
   so the frontend can populate the modal directly without a follow-up request."
  [{:keys [metric_ids]} :- select-exploration-metrics-schema]
  (explorations/exploration-data {:metric-ids metric_ids}))

(def ^:private set-exploration-name-schema
  [:map {:closed true}
   [:name :string]])

(mu/defn ^{:tool-name "set_exploration_name"}
  set-exploration-name-tool
  "Set the name of the Exploration."
  [{:keys [name]} :- set-exploration-name-schema]
  {:name  name})
