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

(def ^:private max-tokens
  "Output-token ceiling for a single generation. The answer itself is tiny, but reasoning models spend output tokens
  reasoning *before* emitting the forced structured_output tool call, so the cap must leave room for that or the call
  returns no tool call.  Non-reasoning providers stop well under this, so the higher ceiling costs them nothing."
  2048)

(defn- call-llm
  "Make a structured LLM call for example question generation.
  Delegates to the shared self/call-llm-structured infrastructure which provides
  retry logic, error handling, and OTel tracing."
  [rendered-prompt]
  (self/call-llm-structured
   (metabot.settings/llm-metabot-provider)
   [{:role "user" :content rendered-prompt}]
   questions-json-schema
   temperature
   max-tokens
   {:request-id (str (random-uuid))
    ;; example_question_generation_batch was the name of the old ai-service api endpoint
    :source     "example_question_generation_batch"
    :tag        "example-question-generation"}))

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
  "Process items in parallel batches, matching Python's asyncio.gather behavior.
  Returns one result per item, in order (callers zip positionally): `{:ok <result>}` on success, or
  `{:error <throwable>}` when generation threw. [[generate-example-questions]] decides what to do with
  failures — drop them when there are partial successes, or rethrow when nothing was produced."
  [items generate-fn]
  (vec
   (mapcat
    (fn [batch]
      (let [futures (mapv (fn [item]
                            (future
                              (try
                                {:ok (generate-fn item)}
                                (catch Throwable e
                                  (log/warn e "Example question generation failed for one item")
                                  {:error e}))))
                          batch)]
        (mapv deref futures)))
    (partition-all max-batch-size items))))

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
  (let [table-results  (if (seq (:tables payload))
                         (process-batch-parallel (:tables payload) generate-table-questions)
                         [])
        metric-results (if (seq (:metrics payload))
                         (process-batch-parallel (:metrics payload) generate-metric-questions)
                         [])
        all-results    (concat table-results metric-results)
        errors         (keep :error all-results)
        produced       (transduce (comp (keep :ok) (map (comp count :questions)))
                                  + 0 all-results)
        ->questions    (fn [r] (or (:ok r) {:questions []}))]
    ;; If failures left us with nothing usable, surface the original error instead of an empty result —
    ;; otherwise the caller's delete+generate transaction commits and wipes existing prompts. Rethrow
    ;; the first failure so its message/cause is preserved. Partial successes (produced > 0) go through.
    (when (and (seq errors) (zero? produced))
      (throw (first errors)))
    (log/info "Native example question generation complete"
              {:table-results (count table-results)
               :metric-results (count metric-results)
               :failures (count errors)})
    {:table_questions  (mapv ->questions table-results)
     :metric_questions (mapv ->questions metric-results)}))
