(ns metabase.metabot.self.system-one
  "System One models: models that answer typed questions about a state instead of generating text.

  A request is one *state* (a string, map, or vector) and a *batch* of named questions. Every question is
  answered in parallel and in isolation against the same read of the state, so a batch costs about what its longest
  question does: ask everything you might need in one request, speculative questions included, and let code decide
  which answers to act on. A question that depends on another's answer belongs in a second request.

  There are three kinds of question, each a plain map built by hand or with a constructor here:

    [[noul]]   — is this statement true?            → `{:type :noul :noul 0.92}`, the probability of yes
    [[choice]] — which of these options?            → `{:type :choice :choice :billing :probabilities {...}
                                                        :confidence 0.82}`
    [[score]]  — where on this ordered rubric?      → `{:type :score :score 1.6 :probabilities {0 ... 1 ... 2 ...}
                                                        :legend {0 ... } :confidence 0.78}`, the expected level

  `:instructions`, choice options' descriptions, and rubric levels can each be a string or structured JSON content.
  Answers come back keyed by the batch's own keys, and a choice's options by the option keys it was given.

    (require '[metabase.metabot.self.system-one :as s1])

    (s1/ask \"Help! My payouts have been failing for 3 days.\"
            {:urgent (s1/noul \"Does the message convey urgency?\")
             :topic  (s1/choice \"What is this about?\" [:billing :technical :other])
             :anger  (s1/score \"How angry is the customer?\" [\"Calm\" \"Frustrated\" \"Very angry\"])})

    (s1/values *1)
    ;; => {:urgent 0.92, :topic :billing, :anger 1.6}

  [[ask]] runs on the first usable System One connection in the provider list, or on the connection a `:model-ref`
  names."
  (:require
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.typesafe :as typesafe]
   [metabase.metabot.usage :as usage]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Schemas ---------------------------------------------------

(mr/def ::content
  [:schema {::mr/deliberately-open true, :description "JSON content: text, or structured data the model reads"}
   [:maybe [:or :string map? sequential?]]])

(mr/def ::key
  [:or :keyword :string])

(mr/def ::noul-question
  [:map {:closed true}
   [:type [:= :noul]]
   [:instructions {:optional true} ::content]
   [:criteria {:optional true} [:map {:closed true}
                                [:true {:optional true} ::content]
                                [:false {:optional true} ::content]]]])

(mr/def ::choice-question
  [:map {:closed true}
   [:type [:= :choice]]
   [:instructions {:optional true} ::content]
   [:criteria [:map-of {:min 1 :max 255, ::mr/deliberately-open true, :description "options, keyed by the caller"}
               ::key ::content]]])

(mr/def ::score-question
  [:map {:closed true}
   [:type [:= :score]]
   [:instructions {:optional true} ::content]
   [:criteria [:sequential {:min 1} ::content]]])

(mr/def ::question
  [:multi {:dispatch :type}
   [:noul ::noul-question]
   [:choice ::choice-question]
   [:score ::score-question]])

(mr/def ::questions
  [:map-of {:min 1, ::mr/deliberately-open true, :description "a batch of questions, keyed by the caller"}
   ::key ::question])

(mr/def ::ask-options
  [:maybe [:map {:closed true}
           [:model-ref {:optional true} [:maybe :string]]
           [:tracking-opts {:optional true} [:maybe [:map {:closed true}
                                                     [:source {:optional true} [:maybe :string]]
                                                     [:tag {:optional true} [:maybe :string]]
                                                     [:profile-id {:optional true} [:maybe :keyword]]
                                                     [:request-id {:optional true} [:maybe :string]]
                                                     [:session-id {:optional true} [:maybe :string]]]]]]])

(mr/def ::probability
  [:and number? [:>= 0] [:<= 1]])

(mr/def ::answer
  [:multi {:dispatch :type}
   [:noul [:map
           [:type [:= :noul]]
           [:noul ::probability]]]
   [:choice [:map
             [:type [:= :choice]]
             [:choice ::key]
             [:probabilities [:map-of ::key ::probability]]
             [:confidence ::probability]]]
   [:score [:map
            [:type [:= :score]]
            [:score number?]
            [:probabilities [:map-of :int ::probability]]
            [:legend [:map-of :int ::content]]
            [:confidence ::probability]]]])

(mr/def ::response
  [:map
   [:model :string]
   [:answers [:map-of ::key ::answer]]
   [:usage [:map
            [:input-tokens [:maybe :int]]
            [:output-tokens [:maybe :int]]]]])

;;; ------------------------------------------------ Constructors ------------------------------------------------

(defn noul
  "A yes/no question: is `instructions` true of the state? `criteria` optionally describes what counts as `:true`
  and `:false`."
  ([instructions]
   {:type :noul :instructions instructions})
  ([instructions criteria]
   (assoc (noul instructions) :criteria criteria)))

(defn choice
  "A question picking one of `options`: a map of option key to its description (nil for none), or a sequence of
  option keys to leave undescribed."
  [instructions options]
  {:type         :choice
   :instructions instructions
   :criteria     (if (map? options)
                   options
                   (into {} (map (fn [k] [k nil])) options))})

(defn score
  "A question placing the state on an ordered rubric: `levels` describes each level, the first being level 0."
  [instructions levels]
  {:type :score :instructions instructions :criteria (vec levels)})

;;; ------------------------------------------------ Asking ------------------------------------------------------

(defn- resolve-adapter [provider]
  ;; a `case` inside of function instead of a map so that with-redefs work well
  (case provider
    "typesafe" typesafe/system-one
    (throw (ex-info (str "Unknown System One provider: " provider)
                    {:provider provider}))))

(defn- default-model [provider]
  (case provider
    "typesafe" typesafe/default-model))

(defn- default-connection-key
  "The first connection in the provider list that serves System One models and can make requests."
  []
  (some (fn [{conn-key :key :keys [type config]}]
          (when (and (llm.provider/system-one-type? type)
                     (llm.provider/config-complete? type config))
            conn-key))
        (llm.provider/connections)))

(defn available?
  "Whether [[ask]] has a System One connection to run on without a `:model-ref`."
  []
  (some? (default-connection-key)))

(defn- resolve-target
  [model-ref]
  (let [model-ref (or model-ref
                      (default-connection-key)
                      (throw (ex-info (tru "No System One provider is configured.")
                                      {:status-code 400
                                       :api-error   true
                                       :error-code  :llm-not-configured})))
        {:keys [type model] :as resolved}
        (or (llm.provider/resolve-model-ref model-ref)
            (throw (ex-info (tru "No LLM provider connection named {0} is configured."
                                 (pr-str (llm.provider/model-ref->connection-key model-ref)))
                            {:status-code 400
                             :api-error   true
                             :error-code  :llm-not-configured
                             :model-ref   model-ref})))]
    (when-not (llm.provider/system-one-type? type)
      (throw (ex-info (tru "{0} does not serve System One models." (pr-str model-ref))
                      {:status-code 400 :model-ref model-ref})))
    (let [model (or (not-empty model) (default-model type))]
      (assoc resolved
             :model     model
             :model-ref (str (:connection-key resolved) "/" model)))))

(mu/defn ask :- ::response
  "Ask a batch of `questions` about `state` in one request. Returns `{:model :answers :usage}`, with `:answers` keyed
  like `questions`.

  `opts`:
    - `:model-ref`     — a `connection-key/model` naming the System One connection and model to use. The model may
                         be left off (`\"typesafe\"`) for the provider's default. Defaults to the first usable System
                         One connection.
    - `:tracking-opts` — how the call is recorded in usage analytics, as for [[metabase.metabot.self/call-llm]]."
  ([state     :- ::content
    questions :- ::questions]
   (ask state questions nil))
  ([state     :- ::content
    questions :- ::questions
    {:keys [model-ref tracking-opts]} :- ::ask-options]
   (when-let [limit-msg (usage/check-usage-limits!)]
     (throw (ex-info limit-msg {:api-error true :error-code :ai-usage-limit-reached})))
   (let [{:keys [type model credentials ai-proxy?] :as target} (resolve-target model-ref)
         tracking-opts (merge {:source "unknown" :tag "system-one"} (u/remove-nils tracking-opts) {:model (:model-ref target) :ai-proxy? ai-proxy?})
         timer         (u/start-timer)
         response      (self/with-retries
                         tracking-opts
                         #((resolve-adapter type) {:state       state
                                                   :questions   questions
                                                   :model       model
                                                   :credentials credentials
                                                   :ai-proxy?   ai-proxy?}))]
     (self/report-token-usage! tracking-opts
                               {:promptTokens     (or (get-in response [:usage :input-tokens]) 0)
                                :completionTokens (or (get-in response [:usage :output-tokens]) 0)}
                               (u/since-ms timer))
     response)))

;;; ------------------------------------------------ Reading answers ---------------------------------------------

(defn- answers-of-type [response type]
  (into {} (filter #(= type (:type (val %)))) (:answers response)))

(defn nouls
  "The noul answers in `response`, keyed by question."
  [response]
  (answers-of-type response :noul))

(defn choices
  "The choice answers in `response`, keyed by question."
  [response]
  (answers-of-type response :choice))

(defn scores
  "The score answers in `response`, keyed by question."
  [response]
  (answers-of-type response :score))

(defn value
  "The headline value of one answer: a noul's probability, a choice's option, or a score's expected level."
  [answer]
  (get answer (:type answer)))

(defn values
  "Every answer in `response` reduced to its [[value]], keyed by question."
  [response]
  (update-vals (:answers response) value))

(defn ranked
  "A choice or score answer's probabilities as `[[option probability] ...]`, most likely first."
  [answer]
  (vec (sort-by val > (:probabilities answer))))

;; design
;; prompt + jev => action || deferral
;; deferal + prompt + llm => action || clarification || deferal
;; deferal + user => action
;; clarifcation + user => prompt
;; state + action => state

;; TODO
;; [/] distill what questions we should ask jev that would remove the need for calls to an llm
;;    [x] classify the user's incoming prompt
;;    [/] route that to a tool call
;; [ ] start removing need to call to llm in certains ways (unclear atm)
;; [ ] figure out how to make the agent loop a state machine

;; NOTE: tool calls
;;
;; analyze_chart
;;   ask_for_sql_clarification
;;   construct_notebook_query
;;   conversation_search
;;   create_alert
;;   create_autogenerated_dashboard
;;   create_chart
;;   create_dashboard_subscription
;;   create_sql_query
;;   document_construct_model_chart
;;   document_construct_sql_chart
;;   document_schema_collect
;;   edit_chart
;;   edit_sql_query
;;   get_field_values
;;   list_available_data_sources
;;   list_available_fields
;;   load_skill
;;   read_conversation
;;   read_resource
;;   read_web_page
;;   recent_chats
;;   replace_sql_query
;;   retrieve_library_entities
;;   run_query
;;   save_entity
;;   search
;;   static_viz
;;   web_search
;;
;;   The internal profile can also expose load_mcp_tools and connected external tools named <server>__<tool>. Those depend on the user’s connections. Implementation (src/metabase/metabot/tools/external_mcp.clj:24).
;;
;;   Defined but absent from currently registered profiles — includes the disabled Research profile:
;;
;;   add_research_groups
;;   get_research_candidates
;;   get_snippet_details
;;   get_timeline_details
;;   get_transform_details
;;   list_research_metrics
;;   list_snippets
;;   list_timelines
;;   remove_from_research_plan
;;   select_research_timelines
;;   set_research_name
;;   todo_read
;;   todo_write
;;
;;   All 24 MCP v2 tools — loaded by the MCP v2 API (src/metabase/mcp/v2/api.clj:18):
;;
;;   alert_write
;;   bookmark_content
;;   browse_collection
;;   browse_data
;;   collection_write
;;   dashboard_write
;;   document_write
;;   duplicate_content
;;   execute_query
;;   execute_sql
;;   get_content
;;   get_parameter_values
;;   learn
;;   measure_write
;;   metric_write
;;   question_write
;;   refresh_ui_credential
;;   render_drill_through
;;   run_saved_question
;;   search
;;   segment_write
;;   subscription_write
;;   transform_write
;;   visualize_query
