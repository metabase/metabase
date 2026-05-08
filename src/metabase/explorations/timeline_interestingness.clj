(ns metabase.explorations.timeline-interestingness
  "LLM-driven scorer for `(exploration_query, timeline)` pairs.

  Given a thread-selected timeline and one of the thread's charts, ask the
  LLM how relevant the timeline's events are to explaining notable moments
  in that specific chart. Returns a `double` in `[0.0, 1.0]` or `nil` on
  any failure path (LLM unconfigured, malformed response, transport error,
  query not yet executed). Never throws.

  The score is per-chart on purpose: a timeline can be highly relevant to
  one chart in a thread and irrelevant to another."
  (:require
   [clojure.string :as str]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.interestingness.core :as interestingness]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(defn- deserialize-result
  "Inverse of `cache.impl/do-with-serialization` for a single object — the
  runner serializes one full QP result as a single nippy frame, so we read
  one frame from the gzipped stream and return it."
  [^bytes result-bytes]
  (with-open [is (ByteArrayInputStream. result-bytes)]
    (cache.impl/with-reducible-deserialized-results [[qp-result _] is]
      qp-result)))

(defn- event->timeline-event
  "Convert a `:model/TimelineEvent` row to the chart-config `::timeline-event`
  shape (see `metabase.interestingness.chart.types/timeline-event`)."
  [{:keys [name timestamp description icon]}]
  (cond-> {:name      (str name)
           :timestamp (str timestamp)}
    description (assoc :description description)
    icon        (assoc :icon icon)))

(def ^:private response-schema
  {:type       "object"
   :properties {:score     {:type        "number"
                            :minimum     0
                            :maximum     1
                            :description "Relevance in [0.0, 1.0]. 1 = events directly explain notable moments in the chart; 0.5 = same domain, partial alignment; 0 = unrelated."}
                :reasoning {:type        "string"
                            :description "One short sentence justifying the score, retained for debugging only."}}
   :required   ["score" "reasoning"]})

(def ^:private rubric-preamble
  "You are an analytics assistant rating how relevant a timeline of events is for understanding a single chart.

You see the chart's stats (notable moments include outliers, significant changes, patterns, and the most recent change), the user's question that motivated the analysis, the timeline's name and description, and the timeline's events with their timestamps.

Score in [0.0, 1.0]:
- 1.0   events directly correspond in time to notable moments in the chart and plausibly explain them
- 0.7+  several events temporally align with key points and the timeline's domain matches what the chart measures
- 0.4   moderately related (same domain, or a few events near key points)
- 0.2   weakly related (events present but don't line up; or domain is loosely related)
- 0.0   unrelated, no events, or actively misleading

Be calibrated. Most timelines are weakly related (~0.2-0.5); reserve >=0.8 for timelines that clearly explain what the chart shows.

Always return a single object matching the supplied schema. Do not respond with prose.

---

")

(def ^:private model "anthropic/claude-haiku-4-5")
(def ^:private temperature 0.0)
(def ^:private max-tokens 256)

(defn- chart->representation
  [chart-config]
  (let [stats (interestingness/compute-chart-stats chart-config {:deep? false})]
    (interestingness/generate-representation
     {:title           (:title chart-config)
      :display-type    (:display_type chart-config)
      :stats           stats
      :timeline-events (:timeline_events chart-config)})))

(defn- timeline-meta-text
  [{:keys [name description]}]
  (cond-> (str "Timeline: " name)
    (not (str/blank? description)) (str "\nDescription: " description)))

(defn- build-user-message
  [chart-config thread-prompt timeline-row]
  (str rubric-preamble
       (when-not (str/blank? thread-prompt)
         (str "USER QUESTION:\n" thread-prompt "\n\n---\n\n"))
       (timeline-meta-text timeline-row)
       "\n\n---\n\nCHART:\n"
       (chart->representation chart-config)))

(defn- clamp01
  [x]
  (-> x double (max 0.0) (min 1.0)))

(defn- llm-score!
  "Single seam for tests to `with-redefs`. Returns a `double` in `[0.0, 1.0]`
  or `nil` on any failure."
  [chart-config thread-prompt timeline-row]
  (try
    (let [response (metabot.self/call-llm-structured
                    model
                    [{:role "user" :content (build-user-message chart-config thread-prompt timeline-row)}]
                    response-schema
                    temperature
                    max-tokens
                    {:request-id (str (random-uuid))
                     :source     "timeline_interestingness"
                     :tag        "timeline-interestingness"})
          score    (:score response)]
      (if (number? score)
        (clamp01 score)
        (do (log/warnf "Timeline interestingness: malformed LLM response %s"
                       (pr-str response))
            nil)))
    (catch Throwable e
      (log/warn e "Timeline interestingness: LLM call failed")
      nil)))

(defn- load-context
  "Load query, result bytes, hydrated timeline (with events), and the parent
  thread's prompt. Returns nil if any required piece is missing."
  [exploration-query-id timeline-id]
  (when-let [query (t2/select-one :model/ExplorationQuery :id exploration-query-id)]
    (when (= "done" (:status query))
      (when-let [{:keys [result_data]} (t2/select-one [:model/ExplorationQueryResult :result_data]
                                                      :exploration_query_id exploration-query-id)]
        (when-let [timeline (t2/select-one :model/Timeline :id timeline-id)]
          (let [thread   (t2/select-one [:model/ExplorationThread :prompt]
                                        :id (:exploration_thread_id query))
                hydrated (timeline-event/include-events-singular timeline {:events/all? false})]
            {:query        query
             :result-bytes result_data
             :timeline     hydrated
             :prompt       (:prompt thread)}))))))

(defn score-query-timeline
  "Compute the LLM-driven interestingness score for the given
  `(exploration-query-id, timeline-id)` pair. Returns a `double` in
  `[0.0, 1.0]` or `nil` on any failure (query not done, no result, LLM
  unconfigured, malformed response, transport error). Never throws."
  [exploration-query-id timeline-id]
  (try
    (when (metabot.settings/llm-metabot-configured?)
      (when-let [{:keys [query result-bytes timeline prompt]}
                 (load-context exploration-query-id timeline-id)]
        (let [qp-result   (deserialize-result result-bytes)
              base-config (explorations.interestingness/qp-result->chart-config query qp-result)]
          (when base-config
            (let [events       (mapv event->timeline-event (:events timeline))
                  chart-config (assoc base-config :timeline_events events)]
              (llm-score! chart-config prompt timeline))))))
    (catch Throwable e
      (log/warnf e "Timeline interestingness scoring failed for query=%s timeline=%s"
                 exploration-query-id timeline-id)
      nil)))
