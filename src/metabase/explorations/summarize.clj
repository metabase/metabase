(ns metabase.explorations.summarize
  "One-shot LLM summarization of a completed exploration thread.

  Invoked from `metabase.explorations.task.runner` after a thread has reached
  terminal state. Loads the thread context (user prompt,
  selected metrics/dimensions/timelines, every `done` query and its
  pre-computed interestingness scores), pre-filters down to the top-K most
  question-relevant charts using `contextual_interestingness_score` (LLM-judged
  against the user's prompt) with a fallback to the deterministic
  `interestingness_score`, builds a single structured-output prompt, and writes
  the result into the thread's existing Findings document — including embedded
  charts for the LLM-featured selections.

  No agent / no tool-calling: the inputs are bounded and the contextual
  interestingness scorer has already done LLM-based question-relevance ranking
  per chart, so a single structured call is sufficient. Failure is fail-soft —
  if anything goes wrong the document is left untouched."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.interestingness.core :as interestingness]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.queries.core :as queries]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.request.core :as request]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(def ^:private model "anthropic/claude-haiku-4-5")
(def ^:private temperature 0.2)
(def ^:private max-tokens 4096)

(def ^:private max-charts-in-prompt
  "Hard cap on charts included in the LLM prompt. Picked from the top of the
  contextual / deterministic interestingness ranking."
  50)

(def ^:private max-featured-charts
  "Hard cap on charts the rendered document will embed, regardless of how many
  the model returns. Keeps the Findings doc readable and bounds card creation."
  6)

(defn- deserialize-result
  "Inverse of [[cache.impl/do-with-serialization]] for the runner's
  single-frame nippy+gzip blob."
  [^bytes result-bytes]
  (with-open [is (ByteArrayInputStream. result-bytes)]
    (cache.impl/with-reducible-deserialized-results [[qp-result _] is]
      qp-result)))

(defn- chart-rank-score
  "Sort key for a hydrated query: prefer the LLM-judged contextual score, fall
  back to the deterministic interestingness, then 0. Higher is better."
  [q]
  (or (:contextual_interestingness_score q)
      (:interestingness_score q)
      0.0))

(defn- load-result-rows
  "Returns `{exploration_query_id {:result_data bytes :chart_stats m}}` for the
  given ids. `chart_stats` is the cached deep-stats blob written by the runner
  alongside the result; we read it directly instead of recomputing."
  [query-ids]
  (when (seq query-ids)
    (into {}
          (map (fn [{:keys [exploration_query_id result_data chart_stats]}]
                 [exploration_query_id {:result_data result_data
                                        :chart_stats chart_stats}]))
          (t2/select [:model/ExplorationQueryResult
                      :exploration_query_id :result_data :chart_stats]
                     :exploration_query_id [:in query-ids]))))

(def ^:private max-data-points-per-series
  "Cap on how many (x, y) pairs to dump per series. For longer series we pick
  evenly-spaced indices so the model still sees the actual shape (start, middle,
  end + a uniform sample) rather than only stats. Picked so a typical chart
  block stays well under ~1KB even at the cap."
  40)

(defn- downsample-pairs
  "Given parallel `x-values` and `y-values`, return a vector of `[x y]` pairs
  truncated to at most `n` evenly-spaced indices. Always preserves first and
  last so trend endpoints are exact."
  [x-values y-values n]
  (let [pairs (mapv vector x-values y-values)
        cnt   (count pairs)]
    (if (<= cnt n)
      pairs
      (let [step    (/ (dec cnt) (double (dec n)))
            indices (->> (range n)
                         (mapv #(int (Math/round (* step (double %)))))
                         distinct
                         vec)]
        (mapv pairs indices)))))

(defn- format-pair
  [[x y]]
  (str (cond
         (nil? x)    "null"
         (number? x) x
         :else       (str x))
       "=" (cond
             (nil? y)    "null"
             (number? y) y
             :else       (str y))))

(defn- pct-change
  "Percent change from `from` to `to`, or nil when undefined (zero base)."
  [from to]
  (when (and (number? from) (number? to) (not (zero? from)))
    (* 100.0 (/ (- to from) (Math/abs (double from))))))

(defn- format-pct
  [n]
  (if n
    (format "%+.1f%%" (double n))
    "n/a (zero base)"))

(defn- compute-key-points
  "Derive labeled facts the model commonly needs but tends to miscompute or
  hallucinate: argmax (peak), argmin (trough), first/last endpoints, mean +
  count of points above mean. All claims are pre-computed so the model can
  quote them verbatim instead of doing argmax-over-list arithmetic.

  Returns nil for empty/non-numeric series."
  [x-values y-values]
  (let [pairs (filter (fn [[_ y]] (number? y)) (map vector x-values y-values))]
    (when (seq pairs)
      (let [ys       (mapv second pairs)
            n        (count pairs)
            max-y    (apply max ys)
            min-y    (apply min ys)
            peak     (first (filter #(= (second %) max-y) pairs))
            trough   (first (filter #(= (second %) min-y) pairs))
            first-pt (first pairs)
            last-pt  (last pairs)
            mean     (/ (reduce + 0.0 ys) n)
            above    (count (filter #(> % mean) ys))]
        {:peak       peak
         :trough     trough
         :first      first-pt
         :last       last-pt
         :n          n
         :mean       mean
         :above-mean above}))))

(defn- render-key-points-section
  "Render the per-series key-points block. These are pre-computed answers to
  the questions the model is most likely to get wrong on its own
  (argmax/argmin, percent change with small base values, mean comparisons)."
  [cfg]
  (let [series  (:series cfg)
        entries (for [[sname {:keys [x_values y_values]}] series
                      :let [kp (compute-key-points x_values y_values)]
                      :when kp]
                  (let [{:keys [peak trough first last n mean above-mean]} kp
                        [px pv] peak
                        [tx tv] trough
                        [fx fv] first
                        [lx lv] last
                        change   (pct-change fv lv)]
                    (str "- " sname ":\n"
                         "  - Peak (max y): " pv " at " px "\n"
                         "  - Trough (min y): " tv " at " tx "\n"
                         "  - First point: " fv " at " fx "\n"
                         "  - Last point: " lv " at " lx "\n"
                         "  - First → Last: " fv " → " lv
                         " (" (format-pct change) ")\n"
                         "  - Mean: " (format "%.2f" (double mean))
                         "; " above-mean " of " n " points are above the mean")))]
    (when (seq entries)
      (str "**Key points (pre-computed — quote these verbatim, don't re-derive)**:\n"
           (str/join "\n" entries)))))

(defn- render-data-points
  "Render the verbatim (x, y) sequence for each series in `cfg`. Sequences over
  `max-data-points-per-series` are evenly downsampled with first/last preserved;
  the header notes when downsampling happened so the model knows it's a sample."
  [cfg]
  (let [series (:series cfg)]
    (when (seq series)
      (str "**Actual data points (chronological)** — every numeric claim and date in your output MUST appear in this list verbatim:\n"
           (str/join
            "\n"
            (for [[sname {:keys [x_values y_values]}] series
                  :let [orig-count (count x_values)
                        pairs      (downsample-pairs x_values y_values max-data-points-per-series)
                        downsampled? (< (count pairs) orig-count)]]
              (str "- " sname
                   (when downsampled?
                     (str " (downsampled from " orig-count " to " (count pairs)
                          " evenly-spaced points; first and last preserved)"))
                   ":\n  "
                   (str/join " | " (map format-pair pairs)))))))))

(defn- chart-block
  "Build the per-chart prompt block: name, Markdown chart representation
  (rendered from the runner-cached deep stats), pre-computed key points, and
  the verbatim (x, y) data points. The data points are what the model must
  ground its analysis on — without them it can only see summary stats and
  tends to confabulate intermediate values that look plausible but don't match
  the chart. Returns nil when the cached stats are missing (chart-config
  couldn't be built at execution time) or anything throws."
  [query result-data chart-stats]
  (try
    (when (and result-data chart-stats)
      (let [qp-result (deserialize-result result-data)
            cfg       (explorations.interestingness/qp-result->chart-config query qp-result)]
        (when cfg
          (let [repr    (interestingness/generate-representation
                         {:title        (:title cfg)
                          :display-type (:display_type cfg)
                          :stats        chart-stats})
                key-pts (render-key-points-section cfg)
                points  (render-data-points cfg)
                extras  (str/join "\n\n" (remove nil? [key-pts points]))]
            {:exploration-query-id (:id query)
             :name                 (:name query)
             :representation       (cond-> repr
                                     (seq extras) (str "\n\n" extras))}))))
    (catch Throwable e
      (log/warnf e "Could not build chart block for ExplorationQuery %d" (:id query))
      nil)))

(defn- selection-context
  "Plain-text recap of metric / dimension / timeline names selected on the
  thread, used to remind the LLM what the user was looking at."
  [thread-id]
  (let [metrics    (->> (t2/query
                         {:select    [[:c.name :name]]
                          :from      [[:exploration_thread_metric :m]]
                          :left-join [[:report_card :c] [:= :c.id :m.card_id]]
                          :where     [:= :m.exploration_thread_id thread-id]
                          :order-by  [[:m.position :asc]]})
                        (keep :name))
        dimensions (->> (t2/select [:model/ExplorationThreadDimension :display_name :dimension_id]
                                   :exploration_thread_id thread-id
                                   {:order-by [[:position :asc]]})
                        (map (fn [d] (or (:display_name d) (:dimension_id d))))
                        (remove nil?))
        timelines  (->> (t2/query
                         {:select    [[:t.name :name]]
                          :from      [[:exploration_thread_timeline :ett]]
                          :left-join [[:timeline :t] [:= :t.id :ett.timeline_id]]
                          :where     [:= :ett.exploration_thread_id thread-id]
                          :order-by  [[:ett.position :asc]]})
                        (keep :name))]
    (cond-> []
      (seq metrics)    (conj (str "Metrics:    " (str/join ", " metrics)))
      (seq dimensions) (conj (str "Dimensions: " (str/join ", " dimensions)))
      (seq timelines)  (conj (str "Timelines:  " (str/join ", " timelines))))))

(defn- build-prompt
  "Assemble the single user message: rubric → user question → selections →
  per-chart blocks. The model is told it's seeing a pre-ranked top-K so it can
  flag what's missing."
  [{:keys [thread-prompt selections blocks total-chart-count]}]
  (let [intro (str "You are summarizing the findings from a completed Metabase data exploration.\n"
                   "\n"
                   "GOAL: Help the user answer their question. The user picked a set of metrics,\n"
                   "dimensions, and (optionally) timelines, and the system generated one chart per\n"
                   "(metric × dimension × segment) combination. You see the most question-relevant\n"
                   "" max-charts-in-prompt " of those charts (out of " total-chart-count
                   " total), pre-ranked by an upstream relevance scorer.\n"
                   "\n"
                   "GROUNDING — NON-NEGOTIABLE:\n"
                   "Each chart block contains a verbatim list of `(x, y)` data points labeled\n"
                   "**Actual data points (chronological)**. EVERY numeric value, date, label, peak,\n"
                   "trough, comparison, and percentage you cite MUST come from those lists. Do NOT\n"
                   "interpolate, extrapolate, or invent values that aren't in the list. If a list\n"
                   "is downsampled (the header will say so), only cite values that actually appear\n"
                   "in the sample — do not guess what's between them. If the data doesn't support\n"
                   "a claim, don't make the claim. A shorter summary that's correct beats a longer\n"
                   "one that fabricates.\n"
                   "\n"
                   "Before writing each sentence with a number/date in it, find the matching point\n"
                   "in the data list. If you can't find it, drop the sentence.\n"
                   "\n"
                   "DELIVERABLES (JSON, per the supplied schema):\n"
                   "- summary: 2-5 short paragraphs of analysis. Focus on what the charts collectively\n"
                   "  reveal about the user's question. Cite specific values, peaks, and trends —\n"
                   "  but only ones that appear verbatim in the data points lists. Don't describe\n"
                   "  each chart individually here — that's what featured_charts is for.\n"
                   "- featured_charts: up to " max-featured-charts " charts most useful for answering\n"
                   "  the question, ordered by importance. For each: exploration_query_id, why_chosen\n"
                   "  (1 sentence on why this chart matters for the question), and what_it_shows\n"
                   "  (1-2 sentences on the actual finding using values from the data points list:\n"
                   "  peak/trough values with their actual dates, first→last comparison, noteworthy\n"
                   "  structure). Only include charts that materially advance the analysis.\n"
                   "- next_steps: 2-5 concrete suggestions for further exploration — additional\n"
                   "  metrics to add, dimensions to break out by, segments to filter to, or timelines\n"
                   "  whose events might explain notable moments. Only suggest things plausibly\n"
                   "  reachable from the current data.\n"
                   "\n"
                   "TONE & CALIBRATION (the user can see the charts — tell them what the data MEANS):\n"
                   "- Lead with the single most important finding. Then supporting context. Then\n"
                   "  what to do about it.\n"
                   "- 2-3 sentences for routine patterns. Expand only for genuine surprises.\n"
                   "- Don't list statistics (mean, std-dev, etc.) at the user — they can read the chart.\n"
                   "  Use those numbers to support the *insight*, not as the insight itself.\n"
                   "  GOOD: \"Revenue dropped 42% after the pricing change — investigate Q4 deals.\"\n"
                   "  BAD:  \"The mean is 45.2, std dev 12.8, trend -15%, with peaks at...\".\n"
                   "- If a chart has a `**Note**:` warning about small values, high variance, or\n"
                   "  limited data points, be cautious — small denominators make percentage changes\n"
                   "  exaggerated and unreliable. Say so explicitly when it applies.\n"
                   "- If nothing is notable, say so briefly and stop. A null finding is a finding.\n"
                   "- Connect timeline events to data changes only if the effect is visible in the\n"
                   "  data points around the event date.\n"
                   "\n"
                   "STYLE: Direct, analytical, specific. Avoid hedging language like 'it appears'\n"
                   "and 'might suggest'. Use plain prose, no bullet points or headings inside the\n"
                   "summary text — the rendering layer handles structure.\n"
                   "\n"
                   "---\n\n")
        question (if (str/blank? thread-prompt)
                   "USER QUESTION: (none provided — infer from the metrics/dimensions selected)\n"
                   (str "USER QUESTION:\n" thread-prompt "\n"))
        sel-text (if (seq selections)
                   (str "SELECTIONS:\n" (str/join "\n" selections) "\n")
                   "")
        chart-md (str/join
                  "\n\n---\n\n"
                  (map-indexed
                   (fn [i {:keys [exploration-query-id name representation]}]
                     (str "### Chart #" (inc i) "\n"
                          "exploration_query_id: " exploration-query-id "\n"
                          "name: " name "\n\n"
                          representation))
                   blocks))]
    (str intro question "\n" sel-text "\n---\n\nCHARTS:\n\n" chart-md)))

(def ^:private response-schema
  {:type       "object"
   :properties {:summary         {:type        "array"
                                  :items       {:type "string"}
                                  :description "2-5 short paragraphs of overall analysis."}
                :featured_charts {:type        "array"
                                  :description (str "Up to " max-featured-charts
                                                    " charts most useful for answering the question.")
                                  :items       {:type       "object"
                                                :properties {:exploration_query_id {:type "integer"}
                                                             :why_chosen           {:type "string"}
                                                             :what_it_shows        {:type "string"}}
                                                :required   ["exploration_query_id"
                                                             "why_chosen"
                                                             "what_it_shows"]}}
                :next_steps      {:type        "array"
                                  :items       {:type "string"}
                                  :description "Concrete suggestions for further exploration."}}
   :required   ["summary" "featured_charts" "next_steps"]})

;;; -------------------------------------------- prose-mirror rendering --------------------------------------------

(defn- pm-paragraph [text]
  {:type "paragraph" :content [{:type "text" :text text}]})

(defn- pm-heading [level text]
  {:type "heading" :attrs {:level level} :content [{:type "text" :text text}]})

(defn- pm-bullet-list [items]
  {:type    "bulletList"
   :content (mapv (fn [item]
                    {:type "listItem"
                     :content [(pm-paragraph item)]})
                  items)})

(defn- pm-card-embed [card-id]
  {:type    "resizeNode"
   :content [{:type "cardEmbed" :attrs {:id card-id :name nil}}]})

(defn- materialize-chart-card!
  "Create a real Card in `doc`'s collection for `eq` (an `ExplorationQuery`),
  associated with the document. Mirrors the `/append` endpoint logic so the
  embedded chart behaves identically. Caller must establish a current-user
  binding (via [[metabase.request.core/with-current-user]]) before invoking."
  [doc eq]
  (let [src-card (t2/select-one [:model/Card :name :display :visualization_settings]
                                :id (:card_id eq))]
    (queries/create-card!
     {:name                   (or (:name eq) (:name src-card) "Chart")
      :type                   :question
      :dataset_query          (:dataset_query eq)
      :display                (or (some-> (:display eq) keyword)
                                  (:display src-card)
                                  :table)
      :visualization_settings (or (:visualization_settings eq)
                                  (:visualization_settings src-card)
                                  {})
      :collection_id          (:collection_id doc)
      :document_id            (:id doc)}
     @api/*current-user*)))

(defn- render-document
  "Build the prose-mirror doc body from the LLM response. `eq-by-id` maps
  exploration_query_id → ExplorationQuery row; only ids the LLM actually
  references get a card materialized."
  [{:keys [summary featured_charts next_steps]} eq-by-id doc]
  (let [summary-paragraphs (mapv pm-paragraph (or summary []))
        featured           (->> (or featured_charts [])
                                (take max-featured-charts)
                                (keep (fn [{:keys [exploration_query_id why_chosen what_it_shows]}]
                                        (when-let [eq (get eq-by-id exploration_query_id)]
                                          (let [card (materialize-chart-card! doc eq)]
                                            [(pm-heading 3 (or (:name eq) "Chart"))
                                             (pm-paragraph (str "Why: " why_chosen))
                                             (pm-paragraph (str "Finding: " what_it_shows))
                                             (pm-card-embed (:id card))])))))
        featured-content   (vec (mapcat identity featured))
        next-section       (when (seq next_steps)
                             [(pm-heading 2 "Suggested next steps")
                              (pm-bullet-list next_steps)])]
    {:type    "doc"
     :content (vec (concat [(pm-heading 2 "Summary")]
                           summary-paragraphs
                           (when (seq featured-content)
                             (cons (pm-heading 2 "Most relevant charts") featured-content))
                           next-section))}))

;;; ---------------------------------------------- main entry point ----------------------------------------------

(defn- find-findings-document
  "Return the thread's existing Findings document (the one auto-created on
  exploration creation), or nil if none exists / it's been archived."
  [thread-id]
  (->> (t2/select :model/Document
                  :exploration_thread_id thread-id
                  :archived false
                  {:order-by [[:created_at :asc] [:id :asc]]
                   :limit    1})
       first))

(defn summarize-thread!
  "One-shot generation of the Findings document for `thread-id`. Returns
  `:ok` on success, a keyword reason on graceful skip, or `nil` on failure
  (logged but never thrown)."
  [thread-id]
  (try
    (cond
      (not (metabot.settings/llm-metabot-configured?))
      (do (log/infof "Skipping summarization for thread %d: LLM not configured" thread-id)
          :skip-no-llm)

      :else
      (let [thread (t2/select-one [:model/ExplorationThread :id :prompt :exploration_id]
                                  :id thread-id)
            doc    (find-findings-document thread-id)]
        (cond
          (nil? thread)
          (do (log/warnf "Thread %d not found" thread-id) nil)

          (nil? doc)
          (do (log/warnf "No Findings document found for thread %d" thread-id)
              :skip-no-doc)

          :else
          (let [exploration (t2/select-one [:model/Exploration :creator_id]
                                           :id (:exploration_id thread))
                done-queries (->> (t2/hydrate
                                   (t2/select :model/ExplorationQuery
                                              :exploration_thread_id thread-id
                                              :status "done")
                                   :interestingness_score
                                   :contextual_interestingness_score)
                                  (sort-by chart-rank-score >))
                top-queries  (vec (take max-charts-in-prompt done-queries))
                result-rows  (load-result-rows (map :id top-queries))
                blocks       (vec (keep (fn [q]
                                          (let [{:keys [result_data chart_stats]} (get result-rows (:id q))]
                                            (chart-block q result_data chart_stats)))
                                        top-queries))]
            (cond
              (empty? blocks)
              (do (log/infof "No usable chart blocks for thread %d; nothing to summarize" thread-id)
                  :skip-no-charts)

              :else
              (let [prompt   (build-prompt {:thread-prompt     (:prompt thread)
                                            :selections        (selection-context thread-id)
                                            :blocks            blocks
                                            :total-chart-count (count done-queries)})
                    response (metabot.self/call-llm-structured
                              model
                              [{:role "user" :content prompt}]
                              response-schema
                              temperature
                              max-tokens
                              {:request-id (str (random-uuid))
                               :source     "exploration"
                               :tag        "exploration-summarize"})
                    eq-by-id (into {} (map (juxt :id identity)) top-queries)]
                (if-not (map? response)
                  (do (log/warnf "Summarization for thread %d: malformed LLM response %s"
                                 thread-id (pr-str response))
                      nil)
                  (request/with-current-user (:creator_id exploration)
                    (let [body  (render-document response eq-by-id doc)
                          ;; Re-fetch as a full Toucan2 instance so `define-after-update`
                          ;; on `:model/Document` receives an instance (not a TransientRow)
                          ;; and the revisions event handler can record a revision row
                          ;; instead of logging "object must be a model instance".
                          fresh (t2/select-one :model/Document :id (:id doc))]
                      (t2/update! :model/Document
                                  (assoc fresh
                                         :document     body
                                         :content_type prose-mirror/prose-mirror-content-type))
                      (log/infof "Wrote summary for thread %d to document %d" thread-id (:id doc))
                      :ok)))))))))
    (catch Throwable e
      (log/errorf e "summarize-thread! failed for thread %d" thread-id)
      nil)))
