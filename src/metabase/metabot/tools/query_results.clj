(ns metabase.metabot.tools.query-results
  "Execute generated Metabot queries and format a compact result summary for the LLM."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.shared.llm-representations :as llm-rep]
   [metabase.query-processor.core :as qp]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private max-llm-result-rows 100)
(def ^:private overflow-detection-result-rows (inc max-llm-result-rows))

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
  [query]
  (-> query
      (update-in [:middleware :js-int-to-string?] (fnil identity true))
      qp/userland-query-with-default-constraints
      (assoc :constraints {:max-results           overflow-detection-result-rows
                           :max-results-bare-rows overflow-detection-result-rows})
      (update :info merge {:executed-by api/*current-user-id*
                           :context     :agent})))

(defn- prepare-untruncated-query
  [query]
  (-> query
      (dissoc :constraints)
      (update :middleware dissoc :add-default-userland-constraints?)
      (update-in [:middleware :js-int-to-string?] (fnil identity true))
      qp/userland-query
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

(defn- query-result-summary
  [{:keys [status error row_count running_time data]}]
  (if (failed? status)
    {:status :failed
     :error  (or error "Query execution failed")}
    (let [rows      (mapv vec (take overflow-detection-result-rows (:rows data)))
          too-large (or (> (count rows) max-llm-result-rows)
                        (and (number? row_count) (> row_count max-llm-result-rows)))]
      {:status         :completed
       :row_count      row_count
       :running_time   running_time
       :result_columns (when-not too-large (mapv result-column (:cols data)))
       :rows           (if too-large [] rows)
       :truncated?     (boolean too-large)})))

(defn- untruncated-query-result-summary
  [{:keys [status error row_count running_time data]}]
  (if (failed? status)
    {:status :failed
     :error  (or error "Query execution failed")}
    {:status         :completed
     :row_count      row_count
     :running_time   running_time
     :result_columns (mapv result-column (:cols data))
     :rows           (mapv vec (:rows data))}))

(defn- column-name
  [column]
  (or (:name column) (:display_name column)))

(defn- data-point-link
  [data-point-id]
  (str "metabase://data-point/" data-point-id))

(defn- data-point-target
  [columns row value-column-index]
  {:columns            (mapv column-name columns)
   :row                row
   :value_column_index value-column-index})

(defn- markdown-link
  [label url]
  (str "[" label "](" url ")"))

(defn- data-point-link-rows
  [{:keys [result_columns rows]}]
  (when (and (seq result_columns) (seq rows))
    (let [value-column-index (dec (count result_columns))]
      (mapv (fn [row]
              (let [data-point-id (str (random-uuid))]
                {:id          data-point-id
                 :target      (data-point-target result_columns row value-column-index)
                 :url         (data-point-link data-point-id)}))
            rows))))

(defn- data-point-state
  [link-rows]
  (into {}
        (map (juxt :id :target))
        link-rows))

(defn- linked-summary
  [summary link-rows]
  (if (seq link-rows)
    (update summary :rows
            (fn [rows]
              (mapv (fn [row {:keys [url]}]
                      (let [value-column-index (dec (count row))]
                        (assoc row value-column-index (markdown-link (str (nth row value-column-index nil)) url))))
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

(defn execute-query
  "Execute `query` with a small row cap and return a compact LLM-facing summary.
  Execution errors are captured as failed summaries so a generated query still
  gives the model actionable feedback instead of aborting the tool call."
  [query]
  (if-let [query (executable-query query)]
    (try
      (query-result-summary (qp/process-query (prepare-query query)))
      (catch Exception e
        (log/warn e "Metabot generated query execution failed")
        {:status :failed
         :error  (or (ex-message e) "Query execution failed")}))
    {:status :failed
     :error  "Tool result did not include an executable query."}))

(defn execute-query-untruncated
  "Execute `query` without Metabot preview row caps and return all rows available from QP."
  [query]
  (if-let [query (executable-query query)]
    (try
      (untruncated-query-result-summary (qp/process-query (prepare-untruncated-query query)))
      (catch Exception e
        (log/warn e "Metabot silent query execution failed")
        {:status :failed
         :error  (or (ex-message e) "Query execution failed")}))
    {:status :failed
     :error  "Tool input did not include an executable query."}))

(defn- execution-summary->xml
  [{:keys [status error row_count running_time truncated?] :as summary} data-point-links reference]
  (if (failed? status)
    (str "<query_execution status=\"failed\">\n"
         (llm-rep/escape-xml error)
         "\n</query_execution>")
    (str "<query_execution status=\"completed\" rows_returned=\"" (count (:rows summary)) "\""
         (when truncated?
           " truncated=\"true\" results_omitted=\"true\"")
         (when (some? row_count)
           (str " row_count=\"" row_count "\""))
         (when (some? running_time)
           (str " running_time_ms=\"" running_time "\""))
         (when reference
           (str " reference_type=\"" (:type reference) "\""
                " reference_id=\"" (llm-rep/escape-xml (:id reference)) "\""))
         ">\n"
         (if truncated?
           (str "The generated query returned more than " max-llm-result-rows " rows, so the results are omitted. "
                "Do not answer from omitted result data. "
                (if reference
                  (str "Your next step MUST be a tool call, without asking the user for permission first: use the referenced " (:type reference)
                       " with an additional query execution tool call (for notebook queries, use execute_notebook_query_silently), or run a follow-up aggregate, sort, "
                       "or filter query, to inspect the full result. Do not produce a final answer until that tool call returns.\n")
                  (str "Your next step MUST be a tool call, without asking the user for permission first: use an additional query execution tool call (for notebook queries, use execute_notebook_query_silently), "
                       "or run a follow-up aggregate, sort, or filter query, to inspect the full result. "
                       "Do not produce a final answer until that tool call returns.\n")))
           (str "Showing all " (count (:rows summary)) " rows from executing the generated query.\n"))
         (when reference
           (str "Full result reference: [" (:type reference) " " (:id reference) "](" (:url reference) ").\n"))
         (when-not truncated?
           (str (when (seq data-point-links)
                  "Linked result values contain metabase://data-point URLs. Use those URLs when mentioning specific generated values, but choose natural link text for your answer.\n")
                (llm-rep/query-result->xml (linked-summary summary data-point-links))))
         "\n</query_execution>")))

(defn- insert-into-result-block
  [output execution-xml]
  (if (str/includes? output "</result>")
    (str/replace-first output #"</result>" (str execution-xml "\n</result>"))
    (str output "\n" execution-xml)))

(defn enrich-tool-result
  "If a tool generated a query or chart, execute the backing query and append the
  result summary to the text that will be sent back to the LLM."
  [result memory]
  (if-let [query (query-from-result result memory)]
    (let [structured       (structured-output result)
          reference        (query-reference structured)
          summary          (execute-query query)
          data-point-links (data-point-link-rows summary)
          execution-xml    (execution-summary->xml summary data-point-links reference)]
      (cond-> (update result :output #(insert-into-result-block (or % "") execution-xml))
        (seq data-point-links)
        (update :structured-output merge {:data-points (data-point-state data-point-links)})))
    result))

(defn format-untruncated-execution-result
  "Format an untruncated query execution summary for an agent-only tool result."
  [summary]
  (let [data-point-links (data-point-link-rows summary)]
    (cond-> {:output (execution-summary->xml summary data-point-links nil)}
      (seq data-point-links)
      (assoc :structured-output {:data-points (data-point-state data-point-links)}))))
