(ns metabase-enterprise.metabot-v3.example-question-generator
  "Native Clojure generator for example questions (prompts) for Metabot.

  Replaces the Python ai-service `/v1/example-question-generation/batch` endpoint
  when `use-native-agent` is true.

  Architecture mirrors the Python service:
  - Separate LLM call per table/metric (not one batch prompt)
  - Two distinct prompt templates: table.jinja → table.selmer, metric.jinja → metric.selmer
  - Parallel execution within batches of 10
  - 5 questions generated per item
  - Uses tool_choice pattern for structured output (matching Python's structured_completion)
  - Temperature 0.3 (matching Python default)
  - Response shape matches: `{:table_questions [{:questions [...]}] :metric_questions [{:questions [...]}]}`"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase.util.log :as log]
   [selmer.parser :as selmer]))

(set! *warn-on-reflection* true)

;;; Template loading (cached)

(def ^:private table-template-path  "metabot/prompts/example_questions_table.selmer")
(def ^:private metric-template-path "metabot/prompts/example_questions_metric.selmer")

(def ^:private template-cache
  "In-memory cache for loaded prompt templates. Map of path -> template string."
  (atom {}))

(defn- load-template [path]
  (or (get @template-cache path)
      (if-let [content (some-> (io/resource path) slurp)]
        (do (swap! template-cache assoc path content)
            content)
        (throw (ex-info "Prompt template not found" {:path path})))))

(defn clear-template-cache!
  "Clear the template cache. Useful for development/testing."
  []
  (reset! template-cache {}))

;;; Column LLM name formatting (mirrors Python ColumnSchema.get_llm_name / get_llm_description)

(defn- llm-name
  "Format column name for LLM. If it has a table-reference, format as table_reference__name."
  [{:keys [name table-reference]}]
  (if (not (str/blank? table-reference))
    (str table-reference "__" name)
    name))

(defn- llm-description
  "Format column description for LLM. If it has a table-reference, prepend 'From the related X table.'"
  [{:keys [description table-reference]}]
  (cond
    (and (not (str/blank? table-reference)) (not (str/blank? description)))
    (str "From the related " table-reference " table. " description)

    (not (str/blank? table-reference))
    (str "From the related " table-reference " table.")

    :else
    (or description "")))

(defn- enrich-column
  "Add :llm_name and :llm_description to a column map for template rendering."
  [col]
  (assoc col
         :llm_name (llm-name col)
         :llm_description (llm-description col)))

;;; Output validation

(def ^:private questions-json-schema
  "JSON Schema for the structured output tool, matching Python's ExampleQuestionGenerationSchema."
  {:type       "object"
   :properties {:questions {:type  "array"
                            :items {:type "string"}
                            :description "List of example questions. No additional explanation."}}
   :required   ["questions"]
   :additionalProperties false})

(defn- validate-questions-response!
  "Validate that LLM response has the expected shape: {:questions [string ...]}.
  Throws on invalid response so fallback can kick in."
  [response source-name]
  (when-not (and (map? response)
                 (sequential? (:questions response))
                 (every? string? (:questions response)))
    (throw (ex-info "Invalid LLM response shape for example question generation"
                    {:response response
                     :source   source-name
                     :expected "{:questions [\"string\" ...]}"}))))

;;; LLM call

(def ^:private temperature 0.3)

(defn- call-llm
  "Make a structured LLM call for example question generation.
  Delegates to the shared self/call-llm-structured infrastructure which provides
  retry logic, error handling, and OTel tracing."
  [rendered-prompt]
  (self/call-llm-structured
   "anthropic/claude-haiku-4-5"
   [{:role "user" :content rendered-prompt}]
   questions-json-schema
   temperature
   300))

;;; Per-item generation (mirrors Python generate_table_example_questions / generate_metric_example_questions)

(defn- generate-table-questions
  "Generate example questions for a single table/model."
  [table]
  (let [template (load-template table-template-path)
        rendered (selmer/render template
                                {:table_name        (:name table)
                                 :table_description (or (:description table) "")
                                 :columns           (map enrich-column (:fields table))})
        response (call-llm rendered)]
    (validate-questions-response! response (:name table))
    {:questions (vec (:questions response))}))

(defn- generate-metric-questions
  "Generate example questions for a single metric."
  [metric]
  (let [template (load-template metric-template-path)
        rendered (selmer/render template
                                {:metric_name            (:name metric)
                                 :metric_description     (or (:description metric) "")
                                 :dimensions             (map enrich-column
                                                              (:queryable-dimensions metric))
                                 :default_time_dimension (some-> (:default-time-dimension metric)
                                                                 enrich-column)})
        response (call-llm rendered)]
    (validate-questions-response! response (:name metric))
    {:questions (vec (:questions response))}))

;;; Batch processing (mirrors Python generate_example_questions_batch with asyncio.gather)

(def ^:private max-batch-size 10)

(defn- process-batch-parallel
  "Process items in parallel batches, matching Python's asyncio.gather behavior."
  [items generate-fn]
  (vec
   (mapcat
    (fn [batch]
      (let [futures (mapv #(future (generate-fn %)) batch)]
        (mapv deref futures)))
    (partition-all max-batch-size items))))

(defn generate-example-questions
  "Generate example questions natively using LLM via OpenRouter.

  Accepts the same payload shape as `metabot-v3.client/generate-example-questions`:
    {:tables  [{:name ... :fields [...]}]
     :metrics [{:name ... :queryable-dimensions [...]}]}

  Returns the same shape:
    {:table_questions  [{:questions [...]}]
     :metric_questions [{:questions [...]}]}"
  [payload]
  (log/info "Generating example questions natively"
            {:table-count  (count (:tables payload))
             :metric-count (count (:metrics payload))})
  (let [table-questions  (if (seq (:tables payload))
                           (process-batch-parallel (:tables payload) generate-table-questions)
                           [])
        metric-questions (if (seq (:metrics payload))
                           (process-batch-parallel (:metrics payload) generate-metric-questions)
                           [])]
    (log/info "Native example question generation complete"
              {:table-results  (count table-questions)
               :metric-results (count metric-questions)})
    {:table_questions  table-questions
     :metric_questions metric-questions}))
