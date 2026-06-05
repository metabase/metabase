(ns metabase.metabot.tools.explorations
  "Exploration-specific tool wrappers."
  (:require
   [metabase.explorations.core :as explorations]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private get-research-candidates-schema
  [:map {:closed true}
   [:q {:optional true} [:maybe :string]]])

(mu/defn ^{:tool-name "get_research_candidates"}
  get-research-candidates-tool
  "List the metrics and dimensions available for research. Each metric lists its candidate
   dimensions (id, name, interestingness); each dimension group lists the dimension ids it bundles
   and the metric ids it can slice. Use this to choose valid metric and dimension ids before
   calling `add_research_groups`. Pass `q` to filter by a search term."
  [{:keys [q]} :- get-research-candidates-schema]
  (explorations/research-candidates {:q q}))

(def ^:private add-research-groups-schema
  [:map {:closed true}
   [:groups
    [:sequential
     [:map {:closed true}
      [:anchor [:enum "metric" "dimension"]]
      [:metric_id {:optional true} :int]
      [:dimension_id {:optional true} :string]
      [:dimension_ids {:optional true} [:sequential :string]]]]]])

(mu/defn ^{:tool-name "add_research_groups"}
  add-research-groups-tool
  "Add one or more groups to the research artifact. Each group is either:
   - metric-anchored: `{\"anchor\": \"metric\", \"metric_id\": <id>, \"dimension_ids\": [<id>, ...]}`
     — the metric sliced by the chosen dimensions, added on top of the automatically-selected
     interesting ones. Omit `dimension_ids` to use only the automatic selection.
   - dimension-anchored: `{\"anchor\": \"dimension\", \"dimension_id\": <id>}` — the dimension
     slicing every related metric.

   Ids must come from `get_research_candidates`; an unknown id fails the whole call."
  [{:keys [groups]} :- add-research-groups-schema]
  (explorations/research-groups {:groups groups}))

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
