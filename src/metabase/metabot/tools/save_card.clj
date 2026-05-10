(ns metabase.metabot.tools.save-card
  "Tool that saves a query already constructed in agent memory as a real Metabase
  `Card`, optionally inheriting the `:display` from a chart in memory. Bridges the
  conversational `query_id`/`chart_id` IDs that other metabot tools produce with the
  HTTP-shaped `/api/card` write path.

  This tool stays as a Clojure var (not a defendpoint) because it needs read access
  to `*memory-atom*` to resolve `query_id` and `chart_id` — pushing the full memory
  blob through a Ring request body would be both noisy and lossy."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as tmpl]
   [metabase.metabot.tools.shared :as shared]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private valid-displays
  #{"table" "bar" "line" "pie" "area" "scatter" "row" "scalar"
    "smartscalar" "gauge" "progress" "funnel" "pivot" "combo"
    "waterfall" "sankey" "object" "map" "sunburst"})

(def ^:private save-card-schema
  [:map {:closed true}
   [:query_id              :string]
   [:name                  :string]
   [:collection_id         {:optional true} [:maybe :int]]
   [:description           {:optional true} [:maybe :string]]
   [:chart_id              {:optional true} [:maybe :string]]
   [:display               {:optional true}
    [:maybe (into [:enum] valid-displays)]]])

(defn- stored-chart-type
  "Pull the chart type out of an in-memory chart map. The canonical shape produced
  by `extract-charts` in `metabase.metabot.agent.core` stores the type under
  `[:visualization_settings :chart_type]`; tolerate string keys in case the chart
  arrived via JSON-decoded incoming `:state`."
  [chart]
  (or (get-in chart [:visualization_settings :chart_type])
      (get-in chart ["visualization_settings" "chart_type"])))

(defn- chart-display
  "Resolve the card's `:display` value. Explicit `display` arg wins, then a chart in
  memory, then a sensible default of `:table`."
  [memory chart-id explicit]
  (cond
    explicit             (keyword explicit)
    (and chart-id memory)
    (or (some-> (memory/find-chart memory chart-id) stored-chart-type keyword)
        :table)
    :else                :table))

(defn- format-result
  "Build the LLM-visible XML result. Mirrors the output style of other metabot tools
  (e.g. `create_chart`) so the LLM produces consistent follow-ups."
  [{:keys [card instructions]}]
  (str "<result>\n"
       "<card id=\"" (:id card) "\""
       " name=\"" (str/escape (str (:name card)) {\" "&quot;"}) "\""
       " collection_id=\"" (or (:collection_id card) "") "\""
       " display=\"" (some-> (:display card) name) "\""
       "/>\n"
       "</result>\n"
       "<instructions>\n" instructions "\n</instructions>"))

(mu/defn ^{:tool-name "save_card"
           :scope     scope/agent-card-create
           :prompt    "save_card.md"}
  save-card-tool
  "Save a previously-constructed query (`query_id`) as a Metabase card.

  Always ask the user where to save the card before calling — call `list_collections`
  first if you don't already know the target collection. Pass `chart_id` to inherit
  the chart's display type, or pass `display` explicitly. Returns the new card's id
  and emits a `navigate_to` data part so the user lands on the saved question."
  [{:keys [query_id name collection_id description chart_id display]} :- save-card-schema]
  (try
    (let [memory        (shared/current-memory)
          _             (when-not memory
                          (throw (ex-info "save_card requires conversation memory; called outside the agent loop?"
                                          {:agent-error? true})))
          dataset-query (memory/find-query memory query_id)
          target-coll   (when collection_id
                          (api/write-check :model/Collection collection_id))
          card-display  (chart-display memory chart_id display)
          _             (api/create-check :model/Card {:collection_id collection_id})
          _             (query-perms/check-run-permissions-for-query dataset-query)
          card-input    {:name                   name
                         :dataset_query          dataset-query
                         :display                card-display
                         :description            description
                         :collection_id          collection_id
                         :visualization_settings {}}
          card          (queries/create-card! card-input @api/*current-user*)
          card-link     (tmpl/link "Open question" "metabase://question/" (:id card))
          coll-link     (when collection_id
                          (tmpl/link (or (:name target-coll) "Collection")
                                     "metabase://collection/" collection_id))
          instructions  (tmpl/lines
                         "Card saved successfully."
                         (str "- " card-link)
                         (when coll-link (str "- " coll-link))
                         "Reference the card in conversation using the metabase://question/ link above.")]
      (log/info "save_card succeeded" {:card-id       (:id card)
                                       :collection-id (:collection_id card)
                                       :display       (:display card)})
      {:output            (format-result {:card card :instructions instructions})
       :structured-output (select-keys card [:id :name :collection_id :display :description])
       :data-parts        [(streaming/navigate-to-part (str "/question/" (:id card)))]
       :instructions      instructions})
    (catch Exception e
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        (do (log/warn e "save_card failed")
            {:output (str "Failed to save card: " (or (ex-message e) "Unknown error"))})))))
