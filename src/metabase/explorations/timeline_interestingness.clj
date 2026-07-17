(ns metabase.explorations.timeline-interestingness
  "LLM-driven scorer for `(exploration_query, timeline)` pairs.

  Given a thread-selected timeline and one of the thread's charts, ask the
  LLM how relevant the timeline's events are to explaining notable moments
  in that specific chart. Returns a `double` in `[0.0, 1.0]` or `nil` on
  any failure path (the shared `metabase.metabot.core/llm-call-available?` gate
  is closed, malformed response, transport error, query not yet executed).
  Never throws.

  The score is per-chart on purpose: a timeline can be highly relevant to
  one chart in a thread and irrelevant to another."
  (:require
   [clojure.string :as str]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.explorations.models.exploration-query-result :as eqr]
   [metabase.interestingness.core :as interestingness]
   [metabase.metabot.core :as metabot]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.query-processor.core :as qp]
   [metabase.timeline.core :as timeline]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(defn- deserialize-result
  "Inverse of `qp/do-with-serialization` for a single object — the
  runner serializes one full QP result as a single nippy frame, so we read
  one frame from the gzipped stream and return it."
  [^bytes result-bytes]
  (with-open [is (ByteArrayInputStream. result-bytes)]
    (qp/with-reducible-deserialized-results [[qp-result _] is]
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
   :properties {:reasoning {:type        "string"
                            :description "One sentence: state the DOMAIN FIT and the TEMPORAL FIT, then justify the score."}
                :score     {:type        "number"
                            :minimum     0
                            :maximum     1
                            :description "Relevance in [0.0, 1.0]. >=0.7 = recommend showing this timeline overlaid on the chart (domain matches what the chart measures and events fall within its time range); <0.4 = unrelated domain or events outside the range."}}
   :required   ["reasoning" "score"]})

(def ^:private rubric-preamble
  "You are an analytics assistant deciding whether a timeline of events is worth overlaying on a single chart to help a user understand it. Your score decides whether we surface the timeline to the user, so treat it as a recommendation (should we show this?), not a proof (does this provably explain every movement?).

You see the chart's statistics (notable moments: outliers, significant changes, trend, patterns, and the most recent change), the user's question that motivated the analysis, the timeline's name and description, and the timeline's events with their timestamps.

Judge two things:
1. DOMAIN FIT - does the timeline's subject plausibly relate to what the chart measures? (e.g. marketing, sales, or pricing events for a revenue chart; environmental, weather, or policy events for a water-quality chart.)
2. TEMPORAL FIT - do the events fall within the chart's time range, and ideally near its notable moments?

Score in [0.0, 1.0]:
- 0.9-1.0  Strong on both axes: events land on or near the chart's notable moments AND the domain plausibly explains them.
- 0.7-0.85 Clearly relevant and worth showing: the domain matches what the chart measures AND the events fall within the chart's active time range. Score in this band even if you cannot tie each event to a specific spike - an analyst looking at this chart would want these events overlaid. Most genuinely useful timelines belong here.
- 0.4-0.6  Partially relevant: the domain matches but the events sit mostly outside the chart's time range, OR the events are in range but the domain is only loosely related to what the chart measures.
- 0.1-0.3  Weakly related: little domain connection and events that barely overlap the time range.
- 0.0      Unrelated, no events, events entirely outside the chart's time range, or actively misleading.

Calibration rules:
- 0.7 is the bar for 'recommend showing this'. If DOMAIN FIT is clear AND at least some events fall within the chart's time range, do NOT score below 0.7 just because the events do not pinpoint a specific spike.
- If the events fall entirely outside the chart's time range, or the domain is unrelated to what the chart measures, score below 0.4 (usually 0.0), no matter how notable the events are in the abstract.

First write one sentence of reasoning that explicitly states the DOMAIN FIT and the TEMPORAL FIT; then give a score consistent with that reasoning.

Always return a single object matching the supplied schema. Do not respond with prose.

---

")

(def ^:private temperature 0.0)
(def ^:private max-tokens 256)

(defn- chart->representation
  [chart-config]
  (let [stats (interestingness/compute-chart-stats chart-config {:deep? true})]
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
                    (metabot.settings/llm-metabot-provider)
                    [{:role "user" :content (build-user-message chart-config thread-prompt timeline-row)}]
                    response-schema
                    temperature
                    max-tokens
                    {:request-id          (str (random-uuid))
                     :source              "timeline_interestingness"
                     :tag                 "timeline-interestingness"
                     :required-permission :permission/metabot-other-tools})
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
      (when-let [sr (eqr/stored-results exploration-query-id)]
        (when-let [timeline (t2/select-one :model/Timeline :id timeline-id)]
          (let [hydrated (timeline/include-events-singular timeline {:events/all? false})]
            {:query        query
             :result-bytes (:result_data sr)
             :timeline     hydrated
             :prompt       (t2/select-one-fn :prompt :model/ExplorationThread
                                             :id (:exploration_thread_id query))}))))))

(defn- score-loaded-context
  "Given the output of `load-context`, build the chart config and dispatch to
  the LLM scorer. Returns nil when the chart-config builder rejects the query."
  [{:keys [query result-bytes timeline prompt]}]
  (let [qp-result   (deserialize-result result-bytes)
        base-config (explorations.interestingness/qp-result->chart-config query qp-result)]
    (when base-config
      (let [events       (mapv event->timeline-event (:events timeline))
            chart-config (assoc base-config :timeline_events events)]
        (llm-score! chart-config prompt timeline)))))

(defn score-query-timeline
  "Compute the LLM-driven interestingness score for the given
  `(exploration-query-id, timeline-id)` pair. Returns a `double` in `[0.0, 1.0]` or `nil` when
  the call can't or shouldn't run (query not done, no result, or the shared
  [[metabase.metabot.core/llm-call-available?]] gate is closed — Metabot disabled, provider
  unconfigured, over usage limits, or the current user lacks permission) and on any failure
  (malformed response, transport error). Never throws. The caller must establish the current-user
  binding (the runner stamps the exploration creator) so the permission/usage checks resolve
  against the right user."
  [exploration-query-id timeline-id]
  (try
    (when (metabot/llm-call-available? :permission/metabot-other-tools)
      (when-let [ctx (load-context exploration-query-id timeline-id)]
        (score-loaded-context ctx)))
    (catch Throwable e
      (log/warnf e "Timeline interestingness scoring failed for query=%s timeline=%s"
                 exploration-query-id timeline-id)
      nil)))
