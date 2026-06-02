(ns metabase.metabot.tools.query-results
  "Execute generated Metabot queries and format a compact, representative result summary for the LLM.

  When a generated query returns more rows than the LLM should see, we do not drop the data.
  Instead we down-sample the query's own result to a representative subset of real rows — the
  global minimum, the global maximum, notable statistical outliers, and evenly spaced points that
  convey the overall trend. Because the sample is drawn from the same default-constraint row window
  the client re-renders for the chart, every sampled row is a real data point on the chart the user
  is viewing, so any value the model cites maps back onto that chart."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.tools.shared.llm-representations :as llm-rep]
   [metabase.query-processor.core :as qp]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private max-llm-result-rows
  "Maximum number of rows to surface to the LLM. Larger results are down-sampled to a
  representative subset of this size."
  100)

(defn- structured-output
  [result]
  (or (:structured-output result) (:structured_output result)))

(defn- query-id
  [structured]
  (some-> (or (:query-id structured) (:query_id structured)) str))

(defn- chart-id
  [structured]
  (some-> (or (:chart-id structured) (:chart_id structured)) str))

(defn- state-query
  [memory query-id]
  (when query-id
    (let [queries (get-in memory [:state :queries] {})]
      (or (get queries query-id)
          (get queries (keyword query-id))))))

(defn- chart-query
  [memory chart-id]
  (when chart-id
    (let [charts (get-in memory [:state :charts] {})
          chart  (or (get charts chart-id)
                     (get charts (keyword chart-id)))]
      (first (:queries chart)))))

(defn query-from-result
  "Return the generated query represented by a tool result, resolving query/chart IDs from memory when needed."
  [result memory]
  (let [structured (structured-output result)]
    (when (map? structured)
      (or (:query structured)
          (:dataset_query structured)
          (state-query memory (query-id structured))
          (chart-query memory (chart-id structured))))))

(defn- executable-query
  [query]
  (when (map? query)
    (cond-> query
      (:lib/type query) lib/->legacy-MBQL)))

(defn- prepare-query
  "Prepare `query` for execution over the standard userland row window — the same default
  constraints (2000 unaggregated / 10000 aggregated rows) the client applies when it re-renders
  the chart. Sampling from this identical window guarantees the rows we surface to the LLM are
  real points on the user's chart."
  [query]
  (-> query
      (update-in [:middleware :js-int-to-string?] (fnil identity true))
      qp/userland-query-with-default-constraints
      (update :info merge {:executed-by api/*current-user-id*
                           :context     :agent})))

(defn- result-column
  [{:keys [name display_name display-name base_type base-type
           effective_type effective-type semantic_type semantic-type description]}]
  {:name         name
   :display_name (or display_name display-name name)
   :type         (or effective_type effective-type base_type base-type semantic_type semantic-type)
   :description  description})

(defn- failed?
  [status]
  (= "failed" (some-> status name)))

;;; ---------------------------------------- Representative sampling ----------------------------------------

(defn- ->number
  "Coerce a cell value to a double for sampling math, or nil when non-numeric. Handles the
  stringified integers produced by the js-int-to-string middleware."
  [v]
  (cond
    (number? v) (double v)
    (string? v) (try (Double/parseDouble (str/trim v)) (catch Exception _ nil))
    :else       nil))

(defn- value-column-index
  "Index of the column used as the data point's value — the last column, matching the
  data-point link machinery."
  [result_columns]
  (max 0 (dec (count result_columns))))

(defn- representative-indices
  "Choose up to `target` representative row indices (0-based) for `values`, a vector aligned with
  the result rows where each entry is the row's numeric value-column value (or nil when
  non-numeric). Always keeps the first and last row; when numeric values are present also keeps the
  global minimum, the global maximum, and the most extreme statistical outliers; fills any
  remaining budget with evenly spaced indices so the overall trend stays visible. Returns indices
  sorted ascending."
  [values target]
  (let [n (count values)]
    (if (<= n target)
      (vec (range n))
      (let [keep  (java.util.TreeSet.)
            add!  (fn [i] (when (and (<= 0 i) (< i n)) (.add keep (int i))))
            pairs (keep-indexed (fn [i v] (when (some? v) [i v])) values)]
        (add! 0)
        (add! (dec n))
        (when (seq pairs)
          (let [vs   (mapv second pairs)
                mean (/ (reduce + vs) (count vs))
                sd   (Math/sqrt (/ (reduce + (map (fn [v] (let [d (- v mean)] (* d d))) vs))
                                   (count vs)))
                ;; reserve at most a quarter of the budget for outliers so the trend samples
                ;; aren't crowded out
                budget (quot target 4)]
            (add! (first (apply min-key second pairs)))
            (add! (first (apply max-key second pairs)))
            (when (pos? sd)
              (doseq [i (->> pairs
                             (map (fn [[i v]] [i (/ (Math/abs (double (- v mean))) sd)]))
                             (filter (fn [[_ z]] (>= z 2.0)))
                             (sort-by second >)
                             (take budget)
                             (map first))]
                (add! i)))))
        ;; fill the rest of the budget with evenly spaced indices to preserve the overall shape
        (let [remaining (- target (.size keep))]
          (when (pos? remaining)
            (let [step (/ (double (dec n)) (inc remaining))]
              (dotimes [k remaining]
                (add! (Math/round (* step (double (inc k)))))))))
        ;; rounding collisions can leave us short; backfill deterministically
        (loop [i 0]
          (when (and (< (.size keep) target) (< i n))
            (add! i)
            (recur (inc i))))
        (vec keep)))))

(defn- sample-summary
  "Down-sample a completed summary to at most `max-llm-result-rows` representative rows, preserving
  order. Marks the summary `:sampled?` with the `:total-row-count` when sampling actually occurs;
  otherwise returns the summary unchanged."
  [{:keys [rows result_columns] :as summary}]
  (let [n (count rows)]
    (if (<= n max-llm-result-rows)
      summary
      (let [vci    (value-column-index result_columns)
            values (mapv (fn [row] (->number (nth row vci nil))) rows)
            idxs   (representative-indices values max-llm-result-rows)]
        (assoc summary
               :rows            (mapv #(nth rows %) idxs)
               :sampled?        true
               :total-row-count (or (:row_count summary) n))))))

(defn- full-result-summary
  "Build a complete summary (all rows within the userland window) from a raw QP result."
  [{:keys [status error row_count running_time data]}]
  (if (failed? status)
    {:status :failed
     :error  (or error "Query execution failed")}
    {:status         :completed
     :row_count      row_count
     :running_time   running_time
     :result_columns (mapv result-column (:cols data))
     :rows           (mapv vec (:rows data))}))

(defn- summarize
  "Summarize a raw QP result, down-sampling large results to a representative subset."
  [result]
  (let [summary (full-result-summary result)]
    (cond-> summary
      (= :completed (:status summary)) sample-summary)))

(defn execute-query
  "Execute `query` over the standard userland row window (the same window the client re-renders for
  the chart) and return a compact LLM-facing summary. Results larger than the LLM row budget are
  down-sampled to a representative set of real rows — the minimum, the maximum, notable outliers,
  and evenly spaced points that convey the overall trend. Execution errors are captured as failed
  summaries so a generated query still gives the model actionable feedback instead of aborting the
  tool call."
  [query]
  (if-let [query (executable-query query)]
    (try
      (summarize (qp/process-query (prepare-query query)))
      (catch Exception e
        (log/warn e "Metabot generated query execution failed")
        {:status :failed
         :error  (or (ex-message e) "Query execution failed")}))
    {:status :failed
     :error  "Tool result did not include an executable query."}))

(defn execute-query-full
  "Execute `query` over the standard userland row window and return the complete summary with every
  row (no down-sampling). Used when a caller must scan the whole result, e.g. to resolve a selection
  filter against a chart's own rows."
  [query]
  (if-let [query (executable-query query)]
    (try
      (full-result-summary (qp/process-query (prepare-query query)))
      (catch Exception e
        (log/warn e "Metabot full query execution failed")
        {:status :failed
         :error  (or (ex-message e) "Query execution failed")}))
    {:status :failed
     :error  "Tool input did not include an executable query."}))

;;; ---------------------------------------- Data point links ----------------------------------------

(defn- column-name
  [column]
  (or (:name column) (:display_name column)))

(defn- data-point-link
  "Build a data point URL. The single-arity form targets the row's value column; the two-arity form
  targets a specific 0-based column within the row, letting the LLM link any cell (a name, category,
  date, etc.) and not just the value column."
  ([data-point-id]
   (str "metabase://data-point/" data-point-id))
  ([data-point-id column-index]
   (str "metabase://data-point/" data-point-id "/" column-index)))

(defn- data-point-source
  "Where a data point came from, so the chat can re-render its source question when the chart isn't on
  screen (e.g. it was produced by a silent query or in an earlier, now-unmounted turn). `reference`
  is the optional `{:type ... :id ...}` from [[query-reference]]; `query` is the executed query used
  to build a renderable `/question#` URL. Returns nil when there's no query to render."
  [reference query]
  (when query
    (cond-> {:question_url (streaming/query->question-url query)}
      (:type reference) (assoc :type (:type reference))
      (:id reference)   (assoc :id (:id reference)))))

(defn- data-point-target
  ([columns row value-column-index]
   (data-point-target columns row value-column-index nil))
  ([columns row value-column-index source]
   (cond-> {:columns            (mapv column-name columns)
            :row                row
            :value_column_index value-column-index}
     source (assoc :source source))))

(defn- markdown-link
  [label url]
  (str "[" label "](" url ")"))

(defn- column-index-legend
  "A compact, 0-based column index legend the LLM uses to build column-scoped data point URLs, e.g.
  \"0=Created At, 1=Customer, 2=Total\"."
  [result_columns]
  (->> result_columns
       (map-indexed (fn [index column]
                      (str index "=" (or (:display_name column) (:name column)))))
       (str/join ", ")))

(defn- data-point-link-instructions
  "Tell the LLM how to reference any cell — not just the value column — using the
  metabase://data-point/{id}/{column_index} scheme. The value column is already linked with its
  index, so the model can reuse a row's id with another column's index to link names, categories,
  dates, etc."
  [result_columns]
  (str "Linked result values contain metabase://data-point URLs. Each row's value column is linked as "
       "metabase://data-point/{id}/{column_index}, where column_index is 0-based. To reference ANY "
       "other value in the same row — a name, category, date, or any cell — reuse that row's {id} with "
       "the target column's index instead. Columns (0-based): " (column-index-legend result_columns) ". "
       "Link every specific value you mention, and choose natural link text for your answer.\n"))

(defn- data-point-link-rows
  ([summary]
   (data-point-link-rows summary nil))
  ([{:keys [result_columns rows]} source]
   (when (and (seq result_columns) (seq rows))
     (let [value-column-index (dec (count result_columns))]
       (mapv (fn [row]
               (let [data-point-id (str (random-uuid))]
                 {:id                 data-point-id
                  :value-column-index value-column-index
                  :target             (data-point-target result_columns row value-column-index source)}))
             rows)))))

(defn- data-point-state
  [link-rows]
  (into {}
        (map (juxt :id :target))
        link-rows))

(defn- linked-summary
  "Wrap each row's value column in a column-scoped data point link. The trailing column index makes
  the metabase://data-point/{id}/{column_index} scheme explicit, so the LLM can reuse a row's id to
  link any other column in the same row (see [[data-point-link-instructions]])."
  [summary link-rows]
  (if (seq link-rows)
    (update summary :rows
            (fn [rows]
              (mapv (fn [row {:keys [id value-column-index]}]
                      (let [row (vec row)
                            vci (or value-column-index (dec (count row)))]
                        (assoc row vci
                               (markdown-link (str (nth row vci nil))
                                              (data-point-link id vci)))))
                    rows
                    link-rows)))
    summary))

(defn- query-reference
  [structured]
  (when (map? structured)
    (cond
      (query-id structured)
      (let [id (query-id structured)]
        {:type "query"
         :id   id
         :url  (str "metabase://query/" id)})

      (chart-id structured)
      (let [id (chart-id structured)]
        {:type "chart"
         :id   id
         :url  (str "metabase://chart/" id)}))))

;;; ---------------------------------------- XML formatting ----------------------------------------

(defn- sampled-execution-note
  [rows-returned total-row-count]
  (str "Showing a representative sample of " rows-returned " rows out of " total-row-count " total. "
       "The sample includes the minimum, the maximum, notable outliers, and evenly spaced rows so the "
       "overall trend stays visible. Every sampled row is a real data point on the chart the user is "
       "viewing, so you may reference these values — including the minimum and maximum — and link them "
       "with their metabase://data-point URLs. Rows between the sampled points are not shown; if you "
       "need an exact count, ranking, or other aggregate over the full result, run a follow-up "
       "aggregate query (for notebook queries, use execute_notebook_query_silently).\n"))

(defn- execution-summary->xml
  [{:keys [status error row_count running_time sampled? total-row-count] :as summary} data-point-links reference]
  (if (failed? status)
    (str "<query_execution status=\"failed\">\n"
         (llm-rep/escape-xml error)
         "\n</query_execution>")
    (str "<query_execution status=\"completed\" rows_returned=\"" (count (:rows summary)) "\""
         (when sampled?
           " sampled=\"true\"")
         (when (some? row_count)
           (str " row_count=\"" row_count "\""))
         (when (and sampled? (some? total-row-count))
           (str " total_row_count=\"" total-row-count "\""))
         (when (some? running_time)
           (str " running_time_ms=\"" running_time "\""))
         (when reference
           (str " reference_type=\"" (:type reference) "\""
                " reference_id=\"" (llm-rep/escape-xml (:id reference)) "\""))
         ">\n"
         (if sampled?
           (sampled-execution-note (count (:rows summary)) (or total-row-count row_count))
           (str "Showing all " (count (:rows summary)) " rows from executing the generated query.\n"))
         (when reference
           (str "Full result reference: [" (:type reference) " " (:id reference) "](" (:url reference) ").\n"))
         (when (seq data-point-links)
           (data-point-link-instructions (:result_columns summary)))
         (llm-rep/query-result->xml (linked-summary summary data-point-links))
         "\n</query_execution>")))

(defn- insert-into-result-block
  [output execution-xml]
  (if (str/includes? output "</result>")
    (str/replace-first output #"</result>" (str execution-xml "\n</result>"))
    (str output "\n" execution-xml)))

(defn enrich-tool-result
  "If a tool generated a query or chart, execute the backing query and append the result summary to
  the text that will be sent back to the LLM. Large results are down-sampled to a representative set
  of real rows so the model always has chart-mapped data points to cite."
  [result memory]
  (if-let [query (query-from-result result memory)]
    (let [structured       (structured-output result)
          reference        (query-reference structured)
          summary          (execute-query query)
          source           (data-point-source reference query)
          data-point-links (data-point-link-rows summary source)
          execution-xml    (execution-summary->xml summary data-point-links reference)]
      (cond-> (update result :output #(insert-into-result-block (or % "") execution-xml))
        (seq data-point-links)
        (update :structured-output merge {:data-points (data-point-state data-point-links)})))
    result))

(defn format-untruncated-execution-result
  "Format a query execution summary for an agent-only (silent) tool result. `query`, when supplied, is
  the executed query used to tag each data point with a renderable source so the chat can re-render
  this silently-run query on demand (its chart is never created in the conversation)."
  ([summary]
   (format-untruncated-execution-result summary nil))
  ([summary query]
   (let [source           (data-point-source nil query)
         data-point-links (data-point-link-rows summary source)]
     (cond-> {:output (execution-summary->xml summary data-point-links nil)}
       (seq data-point-links)
       (assoc :structured-output {:data-points (data-point-state data-point-links)})))))
