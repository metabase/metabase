(ns metabase.slides.agent
  "Multi-turn Anthropic agent that builds slide decks.

   Slides are stored as `{:id :layout :data}` where `data` matches a per-layout
   Malli schema in `metabase.slides.layouts`. The frontend has a dedicated
   React component per layout — no TipTap involved."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.api.common :as api]
   [metabase.llm.settings :as llm.settings]
   [metabase.slides.layouts :as layouts]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (com.fasterxml.jackson.core JsonParseException)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- Tool catalog -----------------------------------------------

(def ^:private tools
  [{:name "search_metabase"
    :description "Search the user's Metabase content. Use this when you don't already know what cards exist. Returns up to 20 matches with id, name, display type and short description."
    :input_schema
    {:type "object"
     :required ["query"]
     :properties {:query {:type "string"
                          :description "Free-text search query, e.g. \"revenue\", \"user signups\"."}
                  :models {:type "array"
                           :items {:type "string" :enum ["card" "dashboard"]}
                           :description "Restrict to a subset of types. Defaults to both."}}}}
   {:name "get_dashboard_cards"
    :description "List every card on a dashboard. Use this when the user has nominated a dashboard as the topic source — it surfaces the bag of charts that already exist for that context."
    :input_schema
    {:type "object"
     :required ["dashboard_id"]
     :properties {:dashboard_id {:type "integer"}}}}
   {:name "get_card"
    :description "Inspect a single card in detail: display type, column names, sample fingerprint, description. Use this before deciding to embed a card so you know what it actually shows."
    :input_schema
    {:type "object"
     :required ["card_id"]
     :properties {:card_id {:type "integer"}}}}
   {:name "propose_outline"
    :description "Commit to an ordered list of slide intents BEFORE writing slides. Use this exactly once after you've gathered enough context. After this you must `write_slide` for each slide in order."
    :input_schema
    {:type "object"
     :required ["title" "slides"]
     :properties
     {:title  {:type "string"
               :description "Overall deck title. Becomes the name of the deck."}
      :slides {:type "array"
               :minItems 3 :maxItems 9
               :items {:type "object"
                       :required ["layout" "title" "intent"]
                       :properties
                       {:layout {:type "string" :enum (vec layouts/layout-ids)}
                        :title  {:type "string"}
                        :intent {:type "string"
                                 :description "One sentence explaining what this slide will say or show."}}}}}}}
   {:name "write_slide"
    :description (str
                  "Write one slide. Call once per slide proposed in propose_outline, in order. Re-call to revise.\n\n"
                  "The `data` field shape depends on the chosen `layout`. Available layouts:\n\n"
                  (layouts/layouts-help))
    :input_schema
    {:type "object"
     :required ["index" "layout" "data"]
     :properties
     {:index  {:type "integer" :minimum 1
               :description "1-based slide position in the final deck."}
      :layout {:type "string" :enum (vec layouts/layout-ids)
               :description "Which layout template to use. The `data` field must match this layout's schema."}
      :data   {:type "object"
               :description "Layout-specific payload. See the layout list above for required/optional fields."}}}}])

;;; ----------------------------------------------- Tool implementations --------------------------------------------

(defn- card-summary [card]
  {:id (:id card)
   :name (:name card)
   :display (some-> (:display card) name)
   :description (:description card)})

(defn- dashboard-summary [dash]
  {:id (:id dash)
   :name (:name dash)
   :description (:description dash)})

(defmulti ^:private run-tool
  "Execute a tool call, returning a JSON-serializable map."
  (fn [name _input] name))

(defmethod run-tool "search_metabase"
  [_ {:keys [query models]}]
  (let [accepted (set (or models ["card" "dashboard"]))
        like     (str "%" (some-> query str/lower-case) "%")]
    {:results
     (cond-> []
       (accepted "card")
       (into (->> (t2/select [:model/Card :id :name :description :display :collection_id :archived :card_schema]
                             {:where [:and
                                      [:= :archived false]
                                      [:or
                                       [:like [:lower :name] like]
                                       [:like [:lower :description] like]]]
                              :limit 20})
                  (filter (fn [c] (try (api/read-check c) true (catch Exception _ false))))
                  (map (fn [c] (assoc (card-summary c) :model "card")))))
       (accepted "dashboard")
       (into (->> (t2/select [:model/Dashboard :id :name :description :collection_id]
                             {:where [:and
                                      [:= :archived false]
                                      [:or
                                       [:like [:lower :name] like]
                                       [:like [:lower :description] like]]]
                              :limit 10})
                  (filter (fn [d] (try (api/read-check d) true (catch Exception _ false))))
                  (map (fn [d] (assoc (dashboard-summary d) :model "dashboard"))))))}))

(defmethod run-tool "get_dashboard_cards"
  [_ {:keys [dashboard_id]}]
  (let [dash (t2/select-one [:model/Dashboard :id :name :description :collection_id]
                            :id dashboard_id :archived false)]
    (if (or (nil? dash) (try (api/read-check dash) false (catch Exception _ true)))
      {:error "dashboard not found or not readable"}
      (let [card-ids (->> (t2/select [:model/DashboardCard :card_id]
                                     :dashboard_id dashboard_id)
                          (keep :card_id)
                          distinct)
            cards    (when (seq card-ids)
                       (->> (t2/select [:model/Card :id :name :description :display :collection_id :archived :card_schema]
                                       :id [:in card-ids] :archived false)
                            (filter (fn [c] (try (api/read-check c) true (catch Exception _ false))))
                            (map card-summary)))]
        {:dashboard (dashboard-summary dash)
         :cards (vec cards)}))))

(defmethod run-tool "get_card"
  [_ {:keys [card_id]}]
  (let [card (t2/select-one [:model/Card :id :name :description :display :collection_id :archived :result_metadata :card_schema]
                            :id card_id :archived false)]
    (if (or (nil? card) (try (api/read-check card) false (catch Exception _ true)))
      {:error "card not found or not readable"}
      (assoc (card-summary card)
             :columns (vec (keep (fn [c] (or (:display_name c) (:name c)))
                                 (:result_metadata card)))))))

(defmethod run-tool "propose_outline"
  [_ outline]
  {:ok true :slides (count (:slides outline))})

(defn- valid-layout? [layout] (contains? (set layouts/layout-ids) layout))

(defmethod run-tool "write_slide"
  [_ {:keys [index layout data] :as payload}]
  (cond
    (not (valid-layout? layout))
    {:error (str "unknown layout: " layout
                 ". Valid layouts: " (str/join ", " layouts/layout-ids))}

    (not (integer? index))
    {:error "index must be an integer"}

    :else
    (if-let [schema (layouts/schema-for layout)]
      (if (mc/validate schema data)
        {:ok true :index index :layout layout}
        {:error (str "data does not match layout schema for " layout
                     ". Reason: " (pr-str (mc/explain schema data)))})
      ;; Layout has no schema (shouldn't happen)
      {:ok true :index index :layout layout})))

(defmethod run-tool :default
  [name _]
  {:error (str "unknown tool: " name)})

;;; ----------------------------------------------- Anthropic transport ---------------------------------------------

(defn- get-api-key []
  (let [k (llm.settings/llm-anthropic-api-key)]
    (when (str/blank? k)
      (throw (ex-info "LLM is not configured. Set MB_LLM_ANTHROPIC_API_KEY."
                      {:type :llm-not-configured :status-code 503})))
    k))

(defn- handle-api-error [exception]
  (if-let [body (some-> exception ex-data :body)]
    (let [parsed (try (json/decode body) (catch JsonParseException _ {:error {:message body}}))]
      (log/warnf "Anthropic API error: %s" (pr-str parsed))
      (throw (ex-info (or (-> parsed :error :message) "Anthropic API request failed")
                      {:type :anthropic-api-error
                       :status-code (or (some-> exception ex-data :status) 502)})))
    (throw exception)))

(defn- claude-call
  [{:keys [system messages]}]
  (let [body {:model       (llm.settings/llm-anthropic-model)
              :max_tokens  (llm.settings/llm-max-tokens)
              :system      system
              :messages    messages
              :tools       (mapv #(select-keys % [:name :description :input_schema]) tools)}]
    (try
      (-> (http/post (str (llm.settings/llm-anthropic-api-base-url) "/v1/messages")
                     {:headers {"x-api-key" (get-api-key)
                                "anthropic-version" (llm.settings/llm-anthropic-api-version)
                                "content-type" "application/json"}
                      :body (json/encode body)
                      :as :json
                      :content-type :json
                      :socket-timeout (llm.settings/llm-request-timeout-ms)
                      :connection-timeout (llm.settings/llm-connection-timeout-ms)})
          :body)
      (catch Exception e (handle-api-error e)))))

;;; ---------------------------------------------------- Agent loop -------------------------------------------------

(def ^:private system-prompt
  (str
   "You are a professional presentation designer with creative freedom, working inside Metabase. You build short, beautiful, NARRATIVE decks. Your differentiator vs. every other tool: every chart you embed is a LIVE Metabase question, fully filterable and drillable in the deck. Use that.

# DESIGN PHILOSOPHY
- Decks tell a story. Open with a striking cover, build a 1–2 idea arc, close with a memorable wrap.
- Visual variety beats consistency. Adjacent slides should look DIFFERENT layouts unless the content demands repetition.
- Charts are the point. Body slides should LEAN ON chart-bearing layouts (chart_hero, title_metrics_with_chart, metrics_grid, two_column). Pure text (bullets) is a last resort.
- Less is more. 5–7 slides total. 2–7 word titles. Under 14 words per bullet. No corporate jargon, no periods at the end of titles.

# LAYOUT SELECTION GUIDELINES
- cover                     → Opening slide ONLY. Always layout=cover. Always first.
- closing                   → Closing slide ONLY. Always layout=closing. Always last.
- chart_hero                → One chart needs all the attention. Use for the headline data point.
- metrics_grid              → 2–6 KPI roll-up. Each tile = one number or one mini-chart. Use early in the deck for the at-a-glance view.
- title_metrics_with_chart  → A chart with a sidebar of supporting metrics. The most 'Gamma'-feeling layout.
- two_column                → A chart that needs explicit takeaways next to it. Bullets call out what to notice.
- bullets                   → Pure text. Use sparingly — at most one per deck (e.g. a 'why this matters' slide).
- big_quote                 → Insight that hits harder as a pull-quote. Use 0–1 times per deck.

# WORKFLOW
1. INVESTIGATE first. If the user shared a dashboard, ALWAYS call `get_dashboard_cards` on it before anything else. Use `search_metabase` for free-form discovery. Use `get_card` to inspect column-level detail before committing a chart slide.
2. PROPOSE OUTLINE exactly once. 5–7 slides. Vary layouts — adjacent slides should differ.
3. WRITE SLIDES in order with `write_slide`. Match each slide's `data` to the layout's schema (see write_slide tool docs).

# HARD RULES
- Every `card_id` MUST come from a card returned by your tool calls. NEVER invent an id.
- First slide MUST be layout=cover. Last slide MUST be layout=closing.
- Do not put the same layout on two adjacent body slides.
- Stop after the last `write_slide`. Do not narrate."))

(defn- initial-user-msg [{:keys [prompt dashboard_id card_ids]}]
  (str/trim
   (str/join
    "\n"
    (cond-> [(str "Topic: " prompt)]
      dashboard_id (conj (str "Reference dashboard id: " dashboard_id
                              " — start by calling get_dashboard_cards on it."))
      (seq card_ids) (conj (str "User-picked card ids: " (str/join ", " card_ids)))
      true (conj "\nInvestigate, propose an outline, then write the deck.")))))

(defn- text-blocks [content]
  (->> content (filter #(= "text" (:type %))) (map :text)))

(defn- tool-blocks [content]
  (filter #(= "tool_use" (:type %)) content))

(defn- payload->slide [{:keys [layout data]}]
  {:id (str "slide-" (java.util.UUID/randomUUID))
   :layout layout
   :data data})

(defn run-agent!
  "Run the slides agent.

   Required: `input` = {:prompt str :dashboard_id? int :card_ids? [int]}
   Required: `on-event` = (fn [event-map]) called for each user-visible step.

   Returns {:name str :slides [slide]} when the agent terminates with end_turn."
  [{:keys [input on-event max-iterations]
    :or {max-iterations 24}}]
  (let [emit       #(on-event %)
        slides     (atom (sorted-map))
        deck-name  (atom nil)
        messages   (atom [{:role "user" :content (initial-user-msg input)}])
        iterations (atom 0)]
    (loop []
      (when (>= @iterations max-iterations)
        (throw (ex-info "Agent ran too long" {:status-code 504})))
      (swap! iterations inc)
      (emit {:type "thinking" :iteration @iterations})
      (let [start    (u/start-timer)
            response (claude-call {:system system-prompt :messages @messages})
            content  (:content response)
            stop     (:stop_reason response)]
        (doseq [text (text-blocks content)]
          (when-not (str/blank? text)
            (emit {:type "assistant" :text text})))
        (let [calls (tool-blocks content)]
          (if (and (= stop "end_turn") (empty? calls))
            (do (emit {:type "done" :latency_ms (long (u/since-ms start))})
                {:name (or @deck-name "Untitled slides")
                 :slides (vec (vals @slides))})
            (let [results
                  (doall
                   (for [{:keys [id name input]} calls]
                     (let [_ (emit {:type "tool_call" :id id :tool name :input input})
                           result (try (run-tool name input)
                                       (catch Exception e
                                         (log/warnf e "Tool %s failed" name)
                                         {:error (.getMessage e)}))]
                       (emit {:type "tool_result" :id id :tool name :result result})
                       (when (= name "propose_outline")
                         (when-let [t (:title input)] (reset! deck-name t))
                         (emit {:type "outline" :outline input}))
                       (when (and (= name "write_slide") (:ok result))
                         (let [slide (payload->slide input)]
                           (swap! slides assoc (:index input) slide)
                           (emit {:type "slide_written"
                                  :index (:index input)
                                  :slide slide})))
                       {:type "tool_result"
                        :tool_use_id id
                        :content (json/encode result)})))]
              (swap! messages conj
                     {:role "assistant" :content content}
                     {:role "user"      :content (vec results)})
              (recur))))))))
