(ns metabase.metabot.tools.explorations
  "Exploration-specific tool wrappers.

  A tool result's `:output` is the one string that goes to *both* the LLM and the client,
  so the small plan edits the FE applies by parsing the tool result — `remove_from_research_plan`, `set_research_name`,
  `select_research_timelines` — return `{:output <json-string>}`; a bare map would reach the LLM
  but stream to the client as an empty string, and the plan would silently never update.

  `add_research_groups` is the exception: its picker hydration is far too large to spend LLM
  context on and grows with every metric the call references, so it rides a `research_plan_update`
  data part (FE only) while `:output` carries a plain-text summary."
  (:require
   [clojure.string :as str]
   [metabase.explorations.core :as explorations]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.core :as tools]
   [metabase.util.json :as json]))

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

(defrecord ListResearchMetricsTool []
  tools/Tool
  (declaration [_]
    {:name        "list_research_metrics"
     :description (str "List the metrics available for research: one slim row per metric (id, name,"
                       " description, in_library – a quality signal), best first. Dimensions are not"
                       " included; pass metric ids from this index to `get_research_candidates` to see"
                       " their candidate dimensions. Pass `q` to filter by a case-insensitive substring"
                       " of a metric or dimension name – e.g. `q: \"region\"` returns the metrics that"
                       " have a Region-like dimension. More than "
                       explorations/research-metric-index-max-metrics " matches are truncated to the top "
                       explorations/research-metric-index-max-metrics " with `truncated: true` – narrow"
                       " with `q`.")
     :scope       scope/agent-explorations-read
     :args        list-research-metrics-schema})

  (handle [_ {:keys [q]} _ctx]
    {:output (json/encode (explorations/research-metric-index {:q q}))}))

(def list-research-metrics-tool
  "The `list_research_metrics` tool."
  (->ListResearchMetricsTool))

(def ^:private get-research-candidates-schema
  [:map {:closed true}
   [:q {:optional true} [:maybe :string]]
   [:metric_ids {:optional true}
    [:maybe [:sequential {:max explorations/research-candidates-max-metrics} :int]]]])

(tools/defrecoverable needs-metric-ids-or-q!
  "`get_research_candidates` was called with neither `metric_ids` nor `q`."
  {:payload [:map {:closed true}]}
  [_]
  {:message  (str "Pass `metric_ids`, `q`, or both. This tool reports the candidate dimensions of"
                  " metrics you have already chosen.")
   :recovery [{:uses #{"list_research_metrics"}
               :text "Call `list_research_metrics` to choose metric ids."}
              {:uses #{"search"}
               :text "Call `search` with `entity_types` [\"metric\"] to find metrics by topic."}]})

(defrecord GetResearchCandidatesTool []
  tools/Tool
  (declaration [_]
    {:name        "get_research_candidates"
     :description (str "Get the candidate dimensions for chosen research metrics. Pass `metric_ids` (up to "
                       explorations/research-candidates-max-metrics ", from `list_research_metrics`)"
                       " and/or `q` (a case-insensitive substring of a metric or dimension name) – at"
                       " least one is required. Each metric lists the `dimensions` it can be sliced by:"
                       " the `id` to pass to `add_research_groups`, the `group` it belongs to, and a"
                       " `name` only when this metric calls it something other than the group name."
                       " Each entry in `dimension_groups` states that group's types and interestingness"
                       " once, plus the `metric_ids` it can slice. Every metric and dimension id you"
                       " pass to `add_research_groups` must come from this tool. Requested ids you"
                       " can't see come back as `missing_metric_ids`; a too-broad `q` returns the top"
                       " matches with `truncated: true` – narrow the search or pass explicit"
                       " `metric_ids`.")
     :scope       scope/agent-explorations-read
     :args        get-research-candidates-schema})

  (handle [_ {:keys [q metric_ids]} _ctx]
    (when (and (str/blank? q) (empty? metric_ids))
      (needs-metric-ids-or-q! {}))
    {:output (json/encode (explorations/research-candidates {:metric-ids metric_ids :q q}))}))

(def get-research-candidates-tool
  "The `get_research_candidates` tool."
  (->GetResearchCandidatesTool))

(def ^:private summary-max-names
  "How many dimension names one summary line spells out before falling back to a count. A metric
   can be sliced by a long list of candidate dimensions, and the summary is the whole of what the
   LLM sees of the result."
  15)

(defn- summarize-names [names]
  (let [extra (- (count names) summary-max-names)]
    (if (pos? extra)
      (str (str/join ", " (take summary-max-names names)) " and " extra " more")
      (str/join ", " names))))

(defn- not-found-sentence
  "That the `noun`s with `ids` were not found, without saying whether they exist."
  [noun ids]
  (if (next ids)
    (str noun "s " (str/join ", " ids) " were not found. They may not exist, or you may not have"
         " access to them.")
    (str noun " " (first ids) " was not found. It may not exist, or you may not have access to it.")))

(tools/defrecoverable unknown-metric!
  "Metric ids in `add_research_groups` that are not metrics the user can research."
  {:payload [:map {:closed true}
             [:metric-ids [:sequential {:min 1} :int]]]}
  [{:keys [metric-ids]}]
  {:message  (not-found-sentence "Metric" metric-ids)
   :recovery [{:uses #{"list_research_metrics" "get_research_candidates"}
               :text (str "Call `list_research_metrics` to find metrics available for research, and"
                          " take their ids from `get_research_candidates`.")}]})

(tools/defrecoverable replace-needs-dimensions!
  "Groups in `add_research_groups` that set `replace_default_dimensions` with no `dimension_ids`."
  {:payload [:map {:closed true}
             [:metric-ids [:sequential {:min 1} :int]]]}
  [{:keys [metric-ids]}]
  {:message  (str "`replace_default_dimensions` replaces the automatically-selected dimensions with the"
                  " group's `dimension_ids`, but "
                  (if (next metric-ids)
                    (str "the groups for metrics " (str/join ", " metric-ids) " have none.")
                    (str "the group for metric " (first metric-ids) " has none.")))
   :recovery [{:uses #{}
               :text (str "Pass the dimension ids to slice by, or drop `replace_default_dimensions` to"
                          " keep the automatic selection.")}]})

(tools/defrecoverable not-a-candidate-dimension!
  "Dimension ids in `add_research_groups` that are not candidate dimensions of their group's metric."
  {:payload [:map {:closed true}
             [:metrics [:sequential {:min 1}
                        [:map {:closed true}
                         [:metric-id     :int]
                         [:metric-name   :string]
                         [:dimension-ids [:sequential {:min 1} :string]]
                         [:candidates    [:sequential [:map {:closed true}
                                                       [:id   :string]
                                                       [:name :string]]]]]]]]}
  [{:keys [metrics]}]
  {:message  (te/lines
              "These dimension ids are not candidate dimensions of their group's metric:"
              (for [{:keys [metric-id metric-name dimension-ids candidates]} metrics]
                (str "- Metric " metric-id " (" metric-name "): "
                     (str/join ", " (map pr-str dimension-ids)) ". "
                     (if (seq candidates)
                       (str "Its candidates are "
                            (summarize-names (map #(str (pr-str (:id %)) " (" (:name %) ")") candidates))
                            ".")
                       "It has no candidate dimensions."))))
   :recovery [{:uses #{}
               :text (str "A dimension id belongs to one metric, so the same dimension has a different id"
                          " under each metric. Take each group's ids from its own metric's candidates.")}
              {:uses #{"get_research_candidates"}
               :text (str "Call `get_research_candidates` with `metric_ids` ["
                          (str/join ", " (map :metric-id metrics)) "] to see every candidate.")}]})

(defn- research-groups-payload
  "Validate `groups` and hydrate the FE picker payload for them, with the snake_case keys the
   client reads. Invalid groups raise the declared error for their kind of problem, naming every
   bad id of that kind."
  [groups]
  (explorations/exploration-data->api
   (try
     (explorations/research-groups {:groups groups})
     (catch clojure.lang.ExceptionInfo e
       (let [{:keys [unknown-metric-ids replace-without-dimensions invalid-dimensions]} (ex-data e)]
         (cond
           unknown-metric-ids         (unknown-metric! {:metric-ids unknown-metric-ids})
           replace-without-dimensions (replace-needs-dimensions! {:metric-ids replace-without-dimensions})
           invalid-dimensions         (not-a-candidate-dimension! {:metrics invalid-dimensions})
           :else                      (throw e)))))))

(defn- format-added-groups
  "Plain-text summary of the groups `add_research_groups` just applied — the whole of what the
   LLM sees of the result, since the picker hydration rides a data part instead. Names what the
   user now has in the plan so the agent can describe it without re-reading the catalog; ids are
   deliberately absent, as the next turn's plan snapshot carries
   the `block_id`s needed to edit these groups."
  [{:keys [metrics dimension_groups groups]}]
  (let [metric-name (into {} (map (juxt :id :name)) metrics)
        group-idx   (into {} (for [[i g] (map-indexed vector dimension_groups)
                                   d     (:dimensions g)]
                               [(:id d) i]))
        group-names (mapv :name dimension_groups)
        ;; Nil for a dimension the payload doesn't group: groups are validated against the
        ;; unresolved catalog, so a dimension can pass validation and still be dropped from the
        ;; hydrated metrics because their query can't actually break out on it. The summary skips
        ;; what it can't name rather than failing the whole tool call.
        group-name  (fn [dimension-id] (some-> (group-idx dimension-id) group-names))]
    (te/lines
     (str "Added " (count groups) " group(s) to the research plan:")
     (for [g groups]
       (let [dims (seq (keep group-name (:dimension_ids g)))]
         (str "- " (metric-name (:metric_id g))
              (cond
                (and dims (:replace_default_dimensions g)) (str ", by exactly: " (summarize-names dims))
                dims (str ", by: " (summarize-names dims) ", plus the automatic selection")
                :else ", by the automatically-selected dimensions")))))))

(def ^:private add-research-groups-schema
  [:map {:closed true}
   [:groups
    [:sequential {:min 1 :error/message "must list at least one group"}
     [:map {:closed true}
      [:metric_id :int]
      [:dimension_ids {:optional true} [:sequential :string]]
      [:replace_default_dimensions {:optional true} :boolean]]]]])

(defrecord AddResearchGroupsTool []
  tools/Tool
  (declaration [_]
    {:name        "add_research_groups"
     :description (str "Add one or more groups to the research artifact. Each group is a metric sliced"
                       " by chosen dimensions: `{\"metric_id\": <id>, \"dimension_ids\": [<id>, ...]}`."
                       " By default `dimension_ids` are added on top of the automatically-selected"
                       " interesting dimensions; omit it to use only the automatic selection. To pin the"
                       " metric to exactly the dimensions you list (no automatic ones), also pass"
                       " `\"replace_default_dimensions\": true` - then `dimension_ids` must be"
                       " non-empty.")
     :scope       scope/agent-explorations-write
     :args        add-research-groups-schema})

  (handle [_ {:keys [groups]} _ctx]
    (let [payload (research-groups-payload groups)]
      {:output     (format-added-groups payload)
       :data-parts [(streaming/research-plan-update-part payload)]})))

(def add-research-groups-tool
  "The `add_research_groups` tool."
  (->AddResearchGroupsTool))

(def ^:private remove-from-research-plan-schema
  [:map {:closed true}
   [:block_ids {:optional true} [:sequential :string]]
   [:members {:optional true}
    [:sequential
     [:map {:closed true}
      [:block_id :string]
      [:dimension_ids [:sequential :string]]]]]
   [:timeline_ids {:optional true} [:sequential :int]]])

(defrecord RemoveFromResearchPlanTool []
  tools/Tool
  (declaration [_]
    {:name        "remove_from_research_plan"
     :description (te/lines
                   (str "Remove groups, individual dimensions within a group, or timelines from the"
                        " research plan. Address groups by the `block_id` shown in brackets for each"
                        " group in the current research plan (e.g. `metric:42`).")
                   ""
                   (str "- To drop whole groups, pass `block_ids`: `{\"block_ids\": [\"metric:42\"]}`."
                        " Use this when the user no longer wants a metric at all (e.g. \"actually I"
                        " don't care about revenue\").")
                   (str "- To prune within a group, pass `members` with the `dimension_ids` to stop"
                        " slicing that group's metric by: `{\"members\": [{\"block_id\": \"metric:42\","
                        " \"dimension_ids\": [\"d1\"]}]}`.")
                   (str "- To drop timelines, pass `timeline_ids` (the ids shown in the current plan's"
                        " selected timelines): `{\"timeline_ids\": [7]}`.")
                   ""
                   (str "If removing members would leave a group with nothing in it, the whole group is"
                        " dropped – so to remove an entire group prefer `block_ids` directly. Removing"
                        " a block, member, or id that isn't in the plan is a no-op."))
     :scope       scope/agent-explorations-write
     :args        remove-from-research-plan-schema})

  (handle [_ {:keys [block_ids members timeline_ids]} _ctx]
    {:output (json/encode {:block_ids    block_ids
                           :members      members
                           :timeline_ids timeline_ids})}))

(def remove-from-research-plan-tool
  "The `remove_from_research_plan` tool."
  (->RemoveFromResearchPlanTool))

(def ^:private set-exploration-name-schema
  [:map {:closed true}
   [:name [:string {:min 1}]]])

(defrecord SetResearchNameTool []
  tools/Tool
  (declaration [_]
    {:name        "set_research_name"
     :description "Set the name of the research artifact."
     :scope       scope/agent-explorations-write
     :args        set-exploration-name-schema})

  (handle [_ {:keys [name]} _ctx]
    {:output (json/encode {:name name})}))

(def set-exploration-name-tool
  "The `set_research_name` tool."
  (->SetResearchNameTool))

(def ^:private select-exploration-timelines-schema
  [:map {:closed true}
   [:timeline_ids [:sequential {:min 1 :error/message "must list at least one timeline id"} :int]]])

(defrecord SelectResearchTimelinesTool []
  tools/Tool
  (declaration [_]
    {:name        "select_research_timelines"
     :description (str "Select the timelines to include in the research. Populates the research"
                       " artifact with the chosen timelines.")
     :scope       scope/agent-explorations-write
     :args        select-exploration-timelines-schema})

  (handle [_ {:keys [timeline_ids]} _ctx]
    {:output (json/encode {:timeline_ids timeline_ids})}))

(def select-exploration-timelines-tool
  "The `select_research_timelines` tool."
  (->SelectResearchTimelinesTool))
