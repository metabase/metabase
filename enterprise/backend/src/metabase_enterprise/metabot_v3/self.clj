(ns metabase-enterprise.metabot-v3.self
  "LLM client infrastructure using reducible streams.

  Key design decisions:
  - LLM APIs return IReduceInit (reducible) instead of core.async channels
  - Standard Clojure transducers work directly: (into [] xf (claude-raw {...}))
  - Tools can return plain values or IReduceInit (for streaming results)
  - No core.async required anywhere

  TODO:
  - figure out what's lacking compared to ai-service"
  (:require
   [metabase-enterprise.llm.settings :as llm]
   [metabase-enterprise.metabot-v3.self.claude :as claude]
   [metabase-enterprise.metabot-v3.self.core :as core]
   [metabase-enterprise.metabot-v3.self.openai :as openai]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(p/import-vars [claude
                claude-raw
                claude->aisdk-xf
                claude])

(p/import-vars [core
                reducible?
                sse-reducible
                aisdk-xf
                lite-aisdk-xf
                aisdk-line-xf
                format-text-line
                format-data-line
                format-error-line
                format-tool-call-line
                format-tool-result-line
                format-finish-line
                format-start-line
                tool-executor-xf])

(p/import-vars [openai
                openai-raw
                openai->aisdk-xf
                openai])

(comment
  (llm/ee-openai-api-key)
  (llm/ee-ai-features-enabled)
  (def sys
    "You MUST call tools for time or currency questions. If asked 'what time' or 'convert X to Y', do not guess—always call the relevant tool first.")

  (def usr
    "What time is it right now in Europe/Kyiv, and convert 100 EUR to UAH.")

  ;; Now just use standard `into` - no core.async!
  (def q (into [] (openai/openai-raw {:messages [{:role "system" :content sys}
                                                 {:role "user" :content usr}]
                                      :tools    (vals TOOLS)}))))

;;; tools

(mu/defn get-time
  "Return current time for a given IANA timezone."
  [{:keys [tz]} :- [:map {:closed true}
                    [:tz [:string {:description "IANA timezone, e.g. Europe/Bucharest"}]]]]
  (str (java.time.ZonedDateTime/now (java.time.ZoneId/of tz))))

(mu/defn convert-currency
  "Convert an amount between two ISO currencies using a dummy rate."
  [{:keys [amount from to]} :- [:map {:closed true}
                                [:amount :float]
                                [:from :string]
                                [:to :string]]]
  (Thread/sleep 500) ;; we're doing some request to some far away service
  (let [rate (if (= [from to] ["EUR" "USD"]) 1.16 1.0)]
    {:amount    amount
     :from      from
     :to        to
     :rate      rate
     :converted (* amount rate)}))

(mu/defn analyze-data-trend
  "Analyze a data trend by calling back to the LLM for natural language insights.
  This demonstrates a recursive LLM call pattern commonly used in agentic workflows."
  [{:keys [metric values period]} :- [:map {:closed true}
                                      [:metric [:string {:description "The metric being analyzed, e.g. 'revenue', 'users'"}]]
                                      [:values [:vector {:description "Time series values"} number?]]
                                      [:period [:string {:description "Time period, e.g. 'Q1 2025', 'last 6 months'"}]]]]
  ;; Simulate calling back to LLM with a mini-prompt
  (let [prompt (format "Analyze this %s trend over %s: %s. Provide a 1-2 sentence insight highlighting key patterns."
                       metric period (pr-str values))]
    (openai/openai {:messages [{:role "user" :content prompt}]})))

(def TOOLS
  "All the defined tools"
  (u/index-by
   #(-> % meta :name name)
   [#'get-time
    #'convert-currency
    #'analyze-data-trend]))

(comment
  (map tool->openai (vals TOOLS)))

(comment
  ;; All examples now use standard `into` - no core.async needed!

  ;; Tool that calls back to LLM (returns reducible)
  (def q (into [] (analyze-data-trend {:metric "revenue"
                                       :values [100.0 120.0 145.0 160.0]
                                       :period "Q1 2025"})))
  (def w (into [] (tool-executor-xf TOOLS) q))
  (def e (into [] aisdk-xf w))

  ;; OpenAI with tools
  (def q (into [] (openai-raw
                   {:system "You are a data analysis assistant. When users provide time-series data and ask for insights, use the analyze-data-trend tool to generate interpretations. Always call the tool rather than making up your own analysis."
                    :input [{:role "user" :content "Can you analyze these trends? Revenue for Q1: [50000, 55000, 58000, 62000] and customer count: [100, 110, 105, 115]. What story do these numbers tell?"}]
                    :tools  (vals metabase-enterprise.metabot-v3.self/TOOLS)})))

  ;; Claude with structured output
  (def q (into [] (claude-raw
                   {:input [{:role "user" :content "Can you tell me currencies of three northmost American countries?"}]
                    :schema [:map
                             [:currencies [:sequential [:map
                                                        [:country [:string {:description "Three-letter code"}]]
                                                        [:currency [:string {:description "Three-letter code"}]]]]]]}))))
