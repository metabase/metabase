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
   [metabase.metabot.scope :as scope]
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
  member dimension carries its id in parentheses."
  [{:keys [block_id metric dimensions]}]
  (str "- [" block_id "] " (:name metric)
       ", broken out by: " (str/join ", " (map named-with-id dimensions))))

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
           (te/lines "Groups:" (map format-research-plan-group groups)))
         (when (seq timelines)
           (te/field "Selected timelines" (str/join ", " (map named-with-id timelines)))))))))

(defn research-plan-system-context
  "System-prompt template vars contributed by the `:explorations` profile — the formatted draft
  Research plan under `:research_plan` (nil when there is no plan, so the template guard stays
  false). Wired as the profile's `:system-prompt-context` hook."
  [context]
  {:research_plan (format-research-plan context)})

(def ^:private list-research-metrics-schema
  [:map {:closed true}
   [:q {:optional true} [:maybe :string]]])

(mu/defn ^{:tool-name "list_research_metrics"
           :scope     scope/agent-explorations-read}
  list-research-metrics-tool
  "List the metrics available for research: one slim row per metric (id, name, description,
   in_library — a quality signal), best first. Dimensions are not included; pass metric ids from
   this index to `get_research_candidates` to see their candidate dimensions. Pass `q` to filter
   by a case-insensitive substring of a metric or dimension name — e.g. `q: \"region\"` returns
   the metrics that have a Region-like dimension. More than 500 matches are truncated to the top
   500 with `truncated: true` — narrow with `q`."
  [{:keys [q]} :- list-research-metrics-schema]
  {:output (json/encode (explorations/research-metric-index {:q q}))})

(def ^:private get-research-candidates-schema
  [:map {:closed true}
   [:q {:optional true} [:maybe :string]]
   [:metric_ids {:optional true} [:maybe [:sequential :int]]]])

(mu/defn ^{:tool-name "get_research_candidates"
           :scope     scope/agent-explorations-read}
  get-research-candidates-tool
  "Get the candidate dimensions for chosen research metrics. Pass `metric_ids` (up to 20, from
   `list_research_metrics`) and/or `q` (a case-insensitive substring of a metric or dimension
   name) — at least one is required. Each metric lists the `dimensions` it can be sliced by: the
   `id` to pass to `add_research_groups`, the `group` it belongs to, and a `name` only when this
   metric calls it something other than the group name. Each entry in `dimension_groups` states
   that group's types and interestingness once, plus the `metric_ids` it can slice. Every metric
   and dimension id you pass to `add_research_groups` must come from this tool. Requested ids you
   can't see come back as `missing_metric_ids`; a too-broad `q` returns the top matches with
   `truncated: true` — narrow the search or pass explicit `metric_ids`."
  [{:keys [q metric_ids]} :- get-research-candidates-schema]
  (cond
    (and (str/blank? q) (empty? metric_ids))
    {:output (str "Error: pass metric_ids (up to " explorations/research-candidates-max-metrics
                  ", from list_research_metrics) and/or q (a search term). This tool reports"
                  " dimensions for metrics you have already chosen; use list_research_metrics or"
                  " search to choose them.")}

    (> (count metric_ids) explorations/research-candidates-max-metrics)
    {:output (str "Error: pass at most " explorations/research-candidates-max-metrics
                  " metric_ids per call (got " (count metric_ids)
                  "). Split the request into multiple calls.")}

    :else
    {:output (json/encode (explorations/research-candidates {:metric-ids metric_ids :q q}))}))

(def ^:private add-research-groups-schema
  [:map {:closed true}
   [:groups
    [:sequential
     [:map {:closed true}
      [:metric_id :int]
      [:dimension_ids {:optional true} [:sequential :string]]
      [:replace_default_dimensions {:optional true} :boolean]]]]])

(mu/defn ^{:tool-name "add_research_groups"
           :scope     scope/agent-explorations-write}
  add-research-groups-tool
  "Add one or more groups to the research artifact. Each group is a metric sliced by chosen
   dimensions: `{\"metric_id\": <id>, \"dimension_ids\": [<id>, ...]}`. By default
   `dimension_ids` are added on top of the automatically-selected interesting dimensions; omit
   it to use only the automatic selection. To pin the metric to exactly the dimensions you
   list (no automatic ones), also pass `\"replace_default_dimensions\": true` - then
   `dimension_ids` must be non-empty."
  [{:keys [groups]} :- add-research-groups-schema]
  {:output (json/encode (explorations/exploration-data->api
                         (explorations/research-groups {:groups groups})))})

(def ^:private remove-from-research-plan-schema
  [:map {:closed true}
   [:block_ids {:optional true} [:sequential :string]]
   [:members {:optional true}
    [:sequential
     [:map {:closed true}
      [:block_id :string]
      [:dimension_ids [:sequential :string]]]]]
   [:timeline_ids {:optional true} [:sequential :int]]])

(mu/defn ^{:tool-name "remove_from_research_plan"
           :scope     scope/agent-explorations-write}
  remove-from-research-plan-tool
  "Remove groups, individual dimensions within a group, or timelines from the research plan.
   Address groups by the `block_id` shown in brackets for each group in the current research
   plan (e.g. `metric:42`).

   - To drop whole groups, pass `block_ids`: `{\"block_ids\": [\"metric:42\"]}`. Use this when the
     user no longer wants a metric at all (e.g. \"actually I don't care about revenue\").
   - To prune within a group, pass `members` with the `dimension_ids` to stop slicing that
     group's metric by: `{\"members\": [{\"block_id\": \"metric:42\", \"dimension_ids\": [\"d1\"]}]}`.
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

(mu/defn ^{:tool-name "set_research_name"
           :scope     scope/agent-explorations-write}
  set-exploration-name-tool
  "Set the name of the research artifact."
  [{:keys [name]} :- set-exploration-name-schema]
  {:output (json/encode {:name name})})

(def ^:private select-exploration-timelines-schema
  [:map {:closed true}
   [:timeline_ids [:sequential :int]]])

(mu/defn ^{:tool-name "select_research_timelines"
           :scope     scope/agent-explorations-write}
  select-exploration-timelines-tool
  "Select the timelines to include in the research. Populates the research artifact with the chosen timelines."
  [{:keys [timeline_ids]} :- select-exploration-timelines-schema]
  {:output (json/encode {:timeline_ids timeline_ids})})
