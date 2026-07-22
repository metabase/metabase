(ns metabase.metabot.tools.explorations
  "Exploration-specific tool wrappers.

  Every tool here returns `{:output <json-string>}`: the exploration chat FE applies plan edits
  by parsing the tool result it sees on the `tool-output-available` stream event, and only a
  result's `:output` string makes it onto the wire (see
  `metabase.metabot.self.core/tool-output->wire-output`) — a bare map would reach the LLM but
  stream to the client as an empty string, and the plan would silently never update."
  (:require
   [clojure.string :as str]
   [metabase.explorations.core :as explorations]
   [metabase.metabot.tmpl :as te]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- named-with-id
  "Render a plan member as `Name (id)` so the agent can address it by id with the plan-editing
  tools, even when the member was added directly by the user and never seen in a tool result."
  [{:keys [id name]}]
  (str name " (" id ")"))

(defn- format-research-plan-group
  "Format one group of the draft Research plan as a single line the LLM can act on. The
  `block_id` is surfaced verbatim so the agent can echo it back to plan-editing tools, and each
  member dimension/metric carries its id in parentheses."
  [{:keys [block_id anchor metric dimensions dimension metrics]}]
  (case anchor
    "metric"
    (str "- [" block_id "] " (:name metric)
         ", broken out by: " (str/join ", " (map named-with-id dimensions)))
    "dimension"
    (str "- [" block_id "] by " (:name dimension)
         ", slicing: " (str/join ", " (map named-with-id metrics)))
    nil))

(defn format-research-plan
  "Format the user's in-progress draft Research plan for injection into the system message.

  The plan lives only as front-end state until the Exploration is created, so the front-end
  serializes it into context each turn. Returns a formatted string for template variable
  {{research_plan}}, or nil when there is no plan to show (so the template's
  `{% if research_plan %}` guard stays false)."
  [context]
  (when-let [plan (:research_plan context)]
    (let [{:keys [name groups timelines]} plan]
      (when (or (seq groups) (seq timelines) (not (str/blank? name)))
        (te/lines
         (str "The user is assembling a Research plan. Below is its current contents as of the "
              "start of this turn — the user may edit it directly in the UI, so it can differ "
              "from what your tool calls alone would produce. Once you've made plan edits this "
              "turn, trust your tool results over this snapshot. Refer to a group by its "
              "[block_id]. Each metric, dimension, and timeline is followed by its id in "
              "parentheses — pass those ids to the plan-editing tools.")
         ""
         (te/field "Plan name" (not-empty name))
         (when (seq groups)
           (te/lines "Groups:" (keep format-research-plan-group groups)))
         (when (seq timelines)
           (te/field "Selected timelines" (str/join ", " (map named-with-id timelines)))))))))

(defn research-plan-system-context
  "System-prompt template vars contributed by the `:explorations` profile — the formatted draft
  Research plan under `:research_plan` (nil when there is no plan, so the template guard stays
  false). Wired as the profile's `:system-prompt-context` hook."
  [context]
  {:research_plan (format-research-plan context)})

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
  {:output (json/encode (explorations/research-candidates {:q q}))})

(def ^:private add-research-groups-schema
  [:map {:closed true}
   [:groups
    [:sequential
     [:map {:closed true}
      [:anchor [:enum "metric" "dimension"]]
      [:metric_id {:optional true} :int]
      [:dimension_id {:optional true} :string]
      [:dimension_ids {:optional true} [:sequential :string]]
      [:metric_ids {:optional true} [:sequential :int]]
      [:replace_default_dimensions {:optional true} :boolean]]]]])

(mu/defn ^{:tool-name "add_research_groups"}
  add-research-groups-tool
  "Add one or more groups to the research artifact. Each group is either:
   - metric-anchored: `{\"anchor\": \"metric\", \"metric_id\": <id>, \"dimension_ids\": [<id>, ...]}`
     — the metric sliced by the chosen dimensions. By default `dimension_ids` are added on top of
     the automatically-selected interesting dimensions; omit it to use only the automatic
     selection. To pin the metric to exactly the dimensions you list (no automatic ones), also
     pass `\"replace_default_dimensions\": true` - then `dimension_ids` must be non-empty.
   - dimension-anchored: `{\"anchor\": \"dimension\", \"dimension_id\": <id>}`, the dimension
     slicing every related metric. To slice only a chosen few, pass
     `\"metric_ids\": [<id>, ...]` and just those metrics are included. Prefer this (a single
     dimension-anchored group with a curated `metric_ids`) when the user asks to look at a handful
     of metrics by one dimension — it reads as one \"by <dimension>\" block rather than several
     loose metrics."
  [{:keys [groups]} :- add-research-groups-schema]
  {:output (json/encode (explorations/research-groups {:groups groups}))})

(def ^:private remove-from-research-plan-schema
  [:map {:closed true}
   [:block_ids {:optional true} [:sequential :string]]
   [:members {:optional true}
    [:sequential
     [:map {:closed true}
      [:block_id :string]
      [:metric_ids {:optional true} [:sequential :int]]
      [:dimension_ids {:optional true} [:sequential :string]]]]]
   [:timeline_ids {:optional true} [:sequential :int]]])

(mu/defn ^{:tool-name "remove_from_research_plan"}
  remove-from-research-plan-tool
  "Remove groups, individual metrics/dimensions within a group, or timelines from the research
   plan. Address groups by the `block_id` shown in brackets for each group in the current research
   plan (e.g. `metric:42`, `dim:7`).

   - To drop whole groups, pass `block_ids`: `{\"block_ids\": [\"metric:42\"]}`. Use this when the
     user no longer wants a metric or dimension area at all (e.g. \"actually I don't care about
     revenue\").
   - To prune within a group, pass `members`. For a metric-anchored group, list the
     `dimension_ids` to stop slicing by; for a dimension-anchored group, list the `metric_ids` to
     stop including: `{\"members\": [{\"block_id\": \"metric:42\", \"dimension_ids\": [\"d1\"]}]}`.
   - To drop timelines, pass `timeline_ids` (the ids shown in the current plan's selected
     timelines): `{\"timeline_ids\": [7]}`.

   If removing members would leave a group with nothing in it, the whole group is dropped — so to
   remove an entire group prefer `block_ids` directly. Removing a block, member, or id that isn't
   in the plan is a no-op."
  [{:keys [block_ids members timeline_ids]} :- remove-from-research-plan-schema]
  {:output (json/encode {:block_ids    block_ids
                         :members      members
                         :timeline_ids timeline_ids})})

(def ^:private set-exploration-name-schema
  [:map {:closed true}
   [:name :string]])

(mu/defn ^{:tool-name "set_research_name"}
  set-exploration-name-tool
  "Set the name of the research artifact."
  [{:keys [name]} :- set-exploration-name-schema]
  {:output (json/encode {:name name})})

(def ^:private select-exploration-timelines-schema
  [:map {:closed true}
   [:timeline_ids [:sequential :int]]])

(mu/defn ^{:tool-name "select_research_timelines"}
  select-exploration-timelines-tool
  "Select the timelines to include in the research. Populates the research artifact with the chosen timelines."
  [{:keys [timeline_ids]} :- select-exploration-timelines-schema]
  {:output (json/encode {:timeline_ids timeline_ids})})
