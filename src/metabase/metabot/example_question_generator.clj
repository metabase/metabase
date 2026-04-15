(ns metabase.metabot.example-question-generator
  "Native Clojure generator for example questions (prompts) for Metabot.

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
   [metabase.metabot.self :as self]
   [metabase.metabot.settings :as metabot.settings]
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
  retry logic, error handling, and OTel tracing.
  When `usage-atom` is provided, token usage for this call is captured into it."
  [rendered-prompt usage-atom]
  (self/call-llm-structured
   (metabot.settings/llm-metabot-provider)
   [{:role "user" :content rendered-prompt}]
   questions-json-schema
   temperature
   300
   (cond-> {:request-id (str (random-uuid))
            ;; example_question_generation_batch was the name of the old ai-service api endpoint
            :source     "example_question_generation_batch"
            :tag        "example-question-generation"}
     usage-atom (assoc :usage-atom usage-atom))))

;;; Per-item generation (mirrors Python generate_table_example_questions / generate_metric_example_questions)

(defn- generate-table-questions
  "Generate example questions for a single table/model."
  [table usage-atom]
  (let [template (load-template table-template-path)
        rendered (selmer/render template
                                {:table_name        (:name table)
                                 :table_description (or (:description table) "")
                                 :columns           (map enrich-column (:fields table))})
        response (call-llm rendered usage-atom)]
    (validate-questions-response! response (:name table))
    {:questions (vec (:questions response))}))

(defn- generate-metric-questions
  "Generate example questions for a single metric."
  [metric usage-atom]
  (let [template (load-template metric-template-path)
        rendered (selmer/render template
                                {:metric_name            (:name metric)
                                 :metric_description     (or (:description metric) "")
                                 :dimensions             (map enrich-column
                                                              (:queryable-dimensions metric))
                                 :default_time_dimension (some-> (:default-time-dimension metric)
                                                                 enrich-column)})
        response (call-llm rendered usage-atom)]
    (validate-questions-response! response (:name metric))
    {:questions (vec (:questions response))}))

;;; Batch processing (mirrors Python generate_example_questions_batch with asyncio.gather)

(def ^:private max-batch-size 10)

(defn- merge-usage
  "Merge two usage maps by summing :prompt and :completion per model."
  [a b]
  (merge-with (fn [x y]
                {:prompt     (+ (:prompt x 0) (:prompt y 0))
                 :completion (+ (:completion x 0) (:completion y 0))})
              a b))

(defn- process-batch-parallel
  "Process items in parallel batches, matching Python's asyncio.gather behavior.
  Returns {:results [...] :usage {model {:prompt X :completion Y}}}."
  [items generate-fn]
  (let [all-usage (atom {})]
    {:results
     (vec
      (mapcat
       (fn [batch]
         (let [futures (mapv (fn [item]
                               (let [usage-atom (atom {})]
                                 (future
                                   (let [result (generate-fn item usage-atom)]
                                     (swap! all-usage merge-usage @usage-atom)
                                     result))))
                             batch)]
           (mapv deref futures)))
       (partition-all max-batch-size items)))
     :usage @all-usage}))

(defn generate-example-questions
  "Generate example questions natively using LLM via OpenRouter.

  Accepts a payload of the shape:
    {:tables  [{:name ... :fields [...]}]
     :metrics [{:name ... :queryable-dimensions [...]}]}

  Returns:
    {:table_questions  [{:questions [...]}]
     :metric_questions [{:questions [...]}]}"
  [payload]
  (log/info "Generating example questions natively"
            {:table-count  (count (:tables payload))
             :metric-count (count (:metrics payload))})
  (let [{table-questions :results table-usage :usage}
        (if (seq (:tables payload))
          (process-batch-parallel (:tables payload) generate-table-questions)
          {:results [] :usage {}})
        {metric-questions :results metric-usage :usage}
        (if (seq (:metrics payload))
          (process-batch-parallel (:metrics payload) generate-metric-questions)
          {:results [] :usage {}})]
    (log/info "Native example question generation complete"
              {:table-results  (count table-questions)
               :metric-results (count metric-questions)})
    {:table_questions  table-questions
     :metric_questions metric-questions
     :usage            (merge-usage table-usage metric-usage)}))
