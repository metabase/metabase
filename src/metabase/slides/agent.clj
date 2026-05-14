(ns metabase.slides.agent
  "Multi-turn Anthropic agent that builds slide decks.

   Unlike a one-shot completion, this loop hands Claude a set of tools and lets
   it explore the user's Metabase content (`search_metabase`, `get_card`,
   `get_dashboard_cards`), propose an outline (`propose_outline`), then write
   each slide one at a time (`write_slide`). The agent runs until Anthropic
   returns `stop_reason=\"end_turn\"`.

   Each step calls `on-event` so the API layer can stream progress to the
   browser as SSE."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.llm.settings :as llm.settings]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (com.fasterxml.jackson.core JsonParseException)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Slide schema ------------------------------------------------

(def ^:private layouts
  "Supported slide layouts. Each carries layout-specific required attributes,
   enforced when the model calls `write_slide`."
  {"cover"       {:title :required :subtitle :optional}
   "bullets"     {:title :required :bullets :required}
   "big_number"  {:title :required :card_id :required :caption :optional}
   "chart"       {:title :required :card_id :required :caption :optional}
   "two_column"  {:title :required :card_id :required :bullets :required}
   "closing"     {:title :required :subtitle :optional}})

(def ^:private write-slide-payload-schema
  "JSON-Schema for the union payload across all layouts."
  {:type "object"
   :required ["index" "layout" "title"]
   :properties
   {:index   {:type "integer" :minimum 1
              :description "1-based slide position. Use sequential numbers; gaps are allowed during iteration."}
    :layout  {:type "string"
              :enum (vec (keys layouts))
              :description "Visual template. 'cover' opens the deck, 'closing' ends it. 'big_number' is a single eye-catching metric. 'chart' is a full-bleed embed. 'two_column' is bullets-on-the-left + chart-on-the-right. 'bullets' is text only."}
    :title   {:type "string"
              :description "Slide headline. 2-7 words. No periods."}
    :subtitle {:type "string"
               :description "Optional supporting line under the title. Only used by cover and closing layouts."}
    :bullets  {:type "array"
               :items {:type "string"}
               :minItems 2 :maxItems 5
               :description "2-5 short bullet points. Each under 12 words. Required for bullets and two_column layouts."}
    :card_id  {:type "integer"
               :description "Required for big_number, chart, and two_column layouts. Must be a card the agent has previously seen via a search or get_card tool call."}
    :caption  {:type "string"
               :description "Optional one-line caption explaining what the embedded chart shows. Used by chart and big_number layouts."}}})

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
    :description "Inspect a single card in detail: display type, column names and description. Use this before deciding to embed a card so you know what it actually shows."
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
                       {:layout {:type "string" :enum (vec (keys layouts))}
                        :title  {:type "string"}
                        :intent {:type "string"
                                 :description "One sentence explaining what this slide will say or show."}}}}}}}
   {:name "write_slide"
    :description "Write one slide. Must be called once per slide proposed in propose_outline, in order. Re-call to revise."
    :input_schema write-slide-payload-schema}])

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
             :columns (vec (keep :display_name (:result_metadata card)))))))

(defmethod run-tool "propose_outline"
  [_ outline]
  ;; Pure state — surfaced to the UI, not validated server-side beyond the schema.
  {:ok true :slides (count (:slides outline))})

(defmethod run-tool "write_slide"
  [_ slide]
  ;; The agent loop accumulates these; this just acknowledges back to the model.
  {:ok true :index (:index slide)})

(defmethod run-tool :default
  [name _]
  {:error (str "unknown tool: " name)})

;;; ----------------------------------------------- LLM-output → TipTap ---------------------------------------------

(defn- p [text]
  {:type "paragraph"
   :content [{:type "text" :text (str text)}]})

(defn- heading [level text]
  {:type "heading"
   :attrs {:level level}
   :content [{:type "text" :text (str text)}]})

(defn- bullet-list [items]
  {:type "bulletList"
   :content (for [item items]
              {:type "listItem"
               :content [(p item)]})})

(defn- card-embed
  "A cardEmbed wrapped in a resizeNode so it has a pixel height to draw into.
   Layout-specific renderers downstream may override the height via CSS."
  [card-id]
  {:type "resizeNode"
   :attrs {:height 480 :minHeight 240}
   :content [{:type "cardEmbed"
              :attrs {:id card-id :name nil}}]})

(defn- doc [blocks]
  {:type "doc"
   :content (vec blocks)})

(defmulti ^:private layout->blocks
  "Convert a `write_slide` payload to a vector of TipTap blocks."
  (fn [layout _payload] layout))

(defmethod layout->blocks "cover"
  [_ {:keys [title subtitle]}]
  (cond-> [(heading 1 (or title "Untitled"))]
    (not (str/blank? subtitle)) (conj (p subtitle))))

(defmethod layout->blocks "closing"
  [_ {:keys [title subtitle]}]
  (cond-> [(heading 1 (or title "Thank you"))]
    (not (str/blank? subtitle)) (conj (p subtitle))))

(defmethod layout->blocks "bullets"
  [_ {:keys [title bullets]}]
  [(heading 2 (or title "Untitled"))
   (bullet-list (or (seq bullets) ["…"]))])

(defmethod layout->blocks "big_number"
  [_ {:keys [title card_id caption]}]
  (cond-> [(heading 2 (or title "Key metric"))
           (card-embed card_id)]
    (not (str/blank? caption)) (conj (p caption))))

(defmethod layout->blocks "chart"
  [_ {:keys [title card_id caption]}]
  (cond-> [(heading 2 (or title "Chart"))
           (card-embed card_id)]
    (not (str/blank? caption)) (conj (p caption))))

(defmethod layout->blocks "two_column"
  [_ {:keys [title card_id bullets]}]
  [(heading 2 (or title "Untitled"))
   {:type "flexContainer"
    :content [(bullet-list (or (seq bullets) ["…"]))
              (card-embed card_id)]}])

(defmethod layout->blocks :default
  [_ payload]
  (layout->blocks "bullets" payload))

(defn- payload->slide
  [{:keys [layout] :as payload}]
  {:id (str "slide-" (java.util.UUID/randomUUID))
   :layout layout
   :doc (doc (layout->blocks layout payload))})

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
  "Single round-trip to Anthropic's messages API."
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
  "You are Gamma, a slide-deck author for Metabase users. Build a short, beautiful, **interactive** deck — every chart you embed will render live, with full filter & drill-through.

Workflow:
1. Investigate the topic. If the user shared a dashboard, immediately call `get_dashboard_cards` on it before doing anything else. Use `search_metabase` for free-form discovery. Use `get_card` whenever you need column-level detail.
2. Call `propose_outline` exactly once to declare a 4-7 slide plan. Mix layouts on purpose — a deck of seven bullet slides is bad design.
3. Write each slide with `write_slide`, in order. Charts are the whole point — at least HALF of the body slides should be `chart`, `big_number`, or `two_column`.

Rules:
- `card_id` must be a card you've actually seen in tool output. NEVER guess an id.
- Titles: 2-7 words, no period.
- Bullets: under 12 words each, 2-5 per slide.
- Cover slide is required (layout=\"cover\"), closing slide is required (layout=\"closing\").
- Stop when every proposed slide has been written. Do not say anything after the last write_slide.")

(defn- initial-user-msg [{:keys [prompt dashboard_id card_ids]}]
  (str/trim
   (str/join "\n"
             (cond-> [(str "Topic: " prompt)]
               dashboard_id (conj (str "Reference dashboard id: " dashboard_id))
               (seq card_ids) (conj (str "User-picked card ids: " (str/join ", " card_ids)))
               true (conj "\nGet the dashboard cards (if any), gather any extra context you need, then propose an outline and write the deck.")))))

(defn- text-blocks [content]
  (->> content (filter #(= "text" (:type %))) (map :text)))

(defn- tool-blocks [content]
  (filter #(= "tool_use" (:type %)) content))

(defn run-agent!
  "Run the slides agent.

   Required: `input` = {:prompt str :dashboard_id? int :card_ids? [int]}
   Required: `on-event` = (fn [event-map]) called for each user-visible step.

   Returns {:name str :slides [slide]} when the agent terminates with end_turn."
  [{:keys [input on-event max-iterations]
    :or {max-iterations 20}}]
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
            ;; agent finished naturally
            (do (emit {:type "done"
                       :latency_ms (long (u/since-ms start))})
                {:name (or @deck-name "Untitled slides")
                 :slides (vec (vals @slides))})
            ;; run all tool_use blocks, append assistant + tool_results, loop
            (let [results
                  (doall
                   (for [{:keys [id name input]} calls]
                     (let [_ (emit {:type "tool_call"
                                    :id id
                                    :tool name
                                    :input input})
                           result (try (run-tool name input)
                                       (catch Exception e
                                         (log/warnf e "Tool %s failed" name)
                                         {:error (.getMessage e)}))]
                       (emit {:type "tool_result"
                              :id id
                              :tool name
                              :result result})
                       ;; Side-effects collected by the loop, NOT sent to the model
                       (when (= name "propose_outline")
                         (when-let [t (:title input)] (reset! deck-name t))
                         (emit {:type "outline" :outline input}))
                       (when (= name "write_slide")
                         (swap! slides assoc (:index input) (payload->slide input))
                         (emit {:type "slide_written"
                                :index (:index input)
                                :slide (get @slides (:index input))}))
                       {:type "tool_result"
                        :tool_use_id id
                        :content (json/encode result)})))]
              (swap! messages conj
                     {:role "assistant" :content content}
                     {:role "user"      :content (vec results)})
              (recur))))))))
