(ns metabase.slides.ai
  "Anthropic-backed slide deck generator. Calls Claude with a `generate_slides`
   tool so the model is forced to return structured JSON, then converts that
   JSON into TipTap slide documents the editor can render."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.llm.settings :as llm.settings]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (com.fasterxml.jackson.core JsonParseException)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Anthropic call ---------------------------------------------------

(def ^:private generate-slides-tool
  "JSON-Schema definition handed to Claude. The model must return its answer as
   a tool call whose input matches this schema — no free-form prose to parse."
  {:name        "generate_slides"
   :description "Generate a slide deck outline for a Metabase presentation. Always use this tool to return your response."
   :input_schema
   {:type     "object"
    :required ["title" "slides"]
    :properties
    {:title  {:type "string"
              :description "Overall deck title."}
     :slides {:type "array"
              :minItems 3
              :maxItems 8
              :description "Ordered slides making up the deck."
              :items
              {:type "object"
               :required ["type" "title"]
               :properties
               {:type     {:type "string"
                           :enum ["cover" "content" "chart" "closing"]
                           :description "Layout type. 'cover' is the first slide, 'closing' is the last, 'chart' embeds a Metabase question, 'content' is text-only."}
                :title    {:type "string"
                           :description "Headline shown at the top of the slide."}
                :subtitle {:type "string"
                           :description "Optional supporting text under the title (cover/closing slides)."}
                :bullets  {:type        "array"
                           :items       {:type "string"}
                           :description "Optional bullet list for content slides."}
                :card_id  {:type        "integer"
                           :description "ID of the Metabase card to embed (only for type=chart). Must come from the user's available cards."}
                :card_caption
                {:type "string"
                 :description "Short caption explaining what the embedded chart shows (chart slides)."}}}}}}})

(defn- get-api-key []
  (let [api-key (llm.settings/llm-anthropic-api-key)]
    (when (str/blank? api-key)
      (throw (ex-info "LLM is not configured. Set MB_LLM_ANTHROPIC_API_KEY."
                      {:type :llm-not-configured :status-code 503})))
    api-key))

(defn- handle-api-error [exception]
  (if-let [response-body (some-> exception ex-data :body)]
    (let [parsed (try (json/decode response-body)
                      (catch JsonParseException _ {:error {:message response-body}}))]
      (log/warnf "Anthropic API error: %s" (pr-str parsed))
      (throw (ex-info (or (-> parsed :error :message) "Anthropic API request failed")
                      {:type :anthropic-api-error
                       :status-code (or (some-> exception ex-data :status) 502)})))
    (throw exception)))

(defn- call-claude
  "POST to Anthropic with our tool definition and force a tool_use response.
   Returns the parsed tool input map."
  [{:keys [system messages]}]
  (let [model (llm.settings/llm-anthropic-model)
        url   (str (llm.settings/llm-anthropic-api-base-url) "/v1/messages")
        body  (cond-> {:model       model
                       :max_tokens  (llm.settings/llm-max-tokens)
                       :messages    messages
                       :tools       [generate-slides-tool]
                       :tool_choice {:type "tool" :name "generate_slides"}}
                system (assoc :system system))]
    (try
      (let [response (http/post url
                                {:headers {"x-api-key" (get-api-key)
                                           "anthropic-version" (llm.settings/llm-anthropic-api-version)
                                           "content-type" "application/json"}
                                 :body (json/encode body)
                                 :as :json
                                 :content-type :json
                                 :socket-timeout (llm.settings/llm-request-timeout-ms)
                                 :connection-timeout (llm.settings/llm-connection-timeout-ms)})]
        (->> response :body :content
             (filter #(= "tool_use" (:type %)))
             first
             :input))
      (catch Exception e
        (handle-api-error e)))))

;;; ------------------------------------------- LLM output → TipTap docs ---------------------------------------------

(defn- p
  "TipTap paragraph node containing plain text."
  [text]
  {:type "paragraph"
   :content [{:type "text" :text (str text)}]})

(defn- empty-paragraph []
  {:type "paragraph"})

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
  "TipTap node that renders an interactive embedded Metabase card.
   Mirrors the schema produced by the Documents editor."
  [card-id]
  {:type "cardEmbed"
   :attrs {:id card-id
           :name nil}})

(defn- slide-doc
  "Wrap a vector of TipTap block nodes in a `doc` node."
  [blocks]
  {:type "doc"
   :content (vec blocks)})

(defmulti ^:private build-slide
  "Convert one LLM-produced slide spec into a {:id :doc :layout} map."
  (fn [spec _idx] (keyword (:type spec))))

(defmethod build-slide :cover
  [{:keys [title subtitle]} idx]
  {:id (str "slide-" idx)
   :layout "cover"
   :doc (slide-doc
         (cond-> [(heading 1 (or title "Untitled"))]
           (not (str/blank? subtitle)) (conj (p subtitle))))})

(defmethod build-slide :closing
  [{:keys [title subtitle]} idx]
  {:id (str "slide-" idx)
   :layout "closing"
   :doc (slide-doc
         (cond-> [(heading 1 (or title "Thank you"))]
           (not (str/blank? subtitle)) (conj (p subtitle))))})

(defmethod build-slide :chart
  [{:keys [title card_id card_caption]} idx]
  {:id (str "slide-" idx)
   :layout "default"
   :doc (slide-doc
         (cond-> [(heading 2 (or title "Chart"))]
           card_id                          (conj (card-embed card_id))
           (not (str/blank? card_caption))  (conj (p card_caption))
           (and (nil? card_id)
                (str/blank? card_caption))  (conj (empty-paragraph))))})

(defmethod build-slide :content
  [{:keys [title subtitle bullets]} idx]
  {:id (str "slide-" idx)
   :layout "default"
   :doc (slide-doc
         (cond-> [(heading 2 (or title "Untitled"))]
           (not (str/blank? subtitle)) (conj (p subtitle))
           (seq bullets)               (conj (bullet-list bullets))
           (and (str/blank? subtitle)
                (empty? bullets))      (conj (empty-paragraph))))})

(defmethod build-slide :default
  [spec idx]
  (build-slide (assoc spec :type "content") idx))

(defn- ensure-valid-card-ids
  "Filter card_id references to ones the LLM actually had access to."
  [llm-output allowed-card-ids]
  (let [allowed (set allowed-card-ids)]
    (update llm-output :slides
            (fn [slides]
              (mapv (fn [s]
                      (if (and (= "chart" (:type s))
                               (not (allowed (:card_id s))))
                        (-> s
                            (assoc :type "content")
                            (dissoc :card_id))
                        s))
                    slides)))))

(defn llm-output->slides
  "Translate Claude's `generate_slides` tool input into the slide-deck shape we
   store in the database. Public for testing."
  [llm-output]
  (->> (:slides llm-output)
       (map-indexed (fn [i s] (build-slide s (inc i))))
       (vec)))

;;; ----------------------------------------------- Prompt construction --------------------------------------------

(defn- format-card-line [{:keys [id name description display]}]
  (format "  %d — %s%s%s"
          id
          name
          (if-not (str/blank? display) (str " [" display "]") "")
          (if-not (str/blank? description) (str " — " description) "")))

(defn- format-dashboard-line [{:keys [id name description]}]
  (format "  %d — %s%s"
          id
          name
          (if-not (str/blank? description) (str " — " description) "")))

(def ^:private system-prompt
  "You are an editor designing a short, punchy slide deck for a business audience reading inside Metabase, a BI tool.

Rules:
- The deck must have a `cover` slide first and a `closing` slide last.
- Aim for 4 to 7 slides total. Be concise — slides are read in seconds.
- When cards are available, lean heavily on `chart` slides — that is the whole point of this product (live, interactive Metabase charts in a deck). Aim for at least half of the body slides to be charts when cards are provided.
- Use your judgement to pick the most relevant cards. Not every card has to appear, and the user-supplied dashboard may contain charts that don't fit the topic — skip those.
- For `content` slides, use 2 to 5 short bullets, each under 12 words.
- Titles are 2 to 7 words. Avoid corporate jargon.
- `card_id` MUST be one of the cards the user listed; never invent IDs.

Always respond by calling the generate_slides tool.")

(defn- build-user-prompt [prompt cards dashboards]
  (let [parts (cond-> [(str "Topic: " prompt)]
                (seq dashboards)
                (conj
                 (str "\nReference dashboard(s) — treat these as the source of truth for the topic; their cards are listed below:\n"
                      (str/join "\n" (map format-dashboard-line dashboards))))
                (seq cards)
                (conj
                 (str "\nAvailable Metabase cards (id — name [display] — description). Embed the ones that match the topic; ignore the rest:\n"
                      (str/join "\n" (map format-card-line cards))))
                true
                (conj "\nProduce the deck."))]
    (str/join "\n" parts)))

;;; ------------------------------------------------ Public entry point ---------------------------------------------

(defn generate-deck
  "Generate a slide deck. Returns `{:name string :slides [Slide]}` ready to be
   persisted. Throws if the LLM call fails or returns nothing usable."
  [{:keys [prompt cards dashboards]}]
  (let [card-ids   (mapv :id cards)
        user-msg   (build-user-prompt prompt cards dashboards)
        start      (u/start-timer)
        raw        (call-claude {:system   system-prompt
                                 :messages [{:role "user" :content user-msg}]})
        _          (when-not (seq (:slides raw))
                     (throw (ex-info "Claude returned no slides"
                                     {:type :empty-slides :status-code 502})))
        sanitized  (ensure-valid-card-ids raw card-ids)
        slides     (llm-output->slides sanitized)]
    (log/infof "Generated %d slides in %.0fms"
               (count slides)
               (double (u/since-ms start)))
    {:name   (or (not-empty (:title raw)) "Untitled slides")
     :slides slides}))
