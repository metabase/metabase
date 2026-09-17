(ns metabase.metabot.tools.query-execution
  "Run a Metabot-authored query on the agent's behalf and render the outcome for the LLM.

  Two consumers share this: the execution receipt that query-producing tools attach automatically
  (a few rows, enough to tell whether the query ran and returned plausible data) and the
  `run_query` tool (more rows, for answering a question from the data). Neither shows anything to
  the user; the rendered block only ever goes into a tool's `:output`."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.driver.settings :as driver.settings]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.query-processor.core :as qp]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def receipt-row-limit
  "Rows an execution receipt returns. Small on purpose: a receipt validates a query, it does not
  answer from it, and it is stored verbatim in conversation history."
  10)

(def default-row-limit
  "Rows `run_query` returns when the model does not ask for a specific number."
  100)

(def max-row-limit
  "Upper bound on rows a single `run_query` call may return."
  500)

(def ^:private timeout-ms
  "Agent-driven executions get a shorter timeout than the instance default so a slow warehouse
  degrades a turn instead of stalling it."
  30000)

(def ^:private max-cell-chars 200)

;;; ------------------------------------------------ Execution ------------------------------------------------

(def ^:private passthrough-keys
  "The only keys of a stored query forwarded to the QP. `:middleware`, `:info` and `:constraints`
  are ours to set: the query map originates from an LLM tool call, and one that could name its own
  `:info` would forge the `query_execution` attribution row."
  [:lib/type :database :stages :parameters])

(def ^:private variable-tag-types
  "Template-tag types that need a value to run. A `:dimension` field filter substitutes `1 = 1`
  when unbound, and card/snippet tags splice SQL, so those run fine without one."
  #{:text :number :date :boolean :temporal-unit})

(defn- unbound-variable-tags
  [query]
  (->> (let [tags (lib/template-tags query)]
         (if (map? tags) (vals tags) tags))
       (filter #(and (variable-tag-types (:type %)) (nil? (:default %))))
       (map :name)
       sort))

(defn- prepare
  [query row-limit]
  (-> (select-keys query passthrough-keys)
      (assoc :middleware {:js-int-to-string? true})
      qp/userland-query-with-default-constraints
      (assoc :constraints {:max-results           row-limit
                           :max-results-bare-rows row-limit}
             :info        {:executed-by api/*current-user-id*
                           :context     :agent})))

(defn- timeout-error?
  [error elapsed-ms]
  (or (>= elapsed-ms timeout-ms)
      (boolean (re-find #"(?i)cancel|timed? ?out" (str error)))))

(defn- failure
  [error elapsed-ms]
  {:status          (if (timeout-error? error elapsed-ms) :timeout :failed)
   :error           (str error)
   :running-time-ms elapsed-ms})

(defn execute
  "Run `query` (any query map a Metabot tool stores in state) as the current user and return
  `{:status :completed :cols :rows :returned :truncated? :running-time-ms}`, where `rows` holds at
  most `row-limit` rows and `truncated?` reports whether the query had more. Other statuses are
  `:failed` (with `:error`), `:timeout` (with `:error`) and `:skipped` (with `:reason`, for a native
  query whose variables have no value). Never throws."
  [query row-limit]
  (let [timer (u/start-timer)]
    (try
      (let [normalized (lib-be/normalize-query query)
            unbound    (when (lib/native-only-query? normalized)
                         (unbound-variable-tags normalized))]
        (if (seq unbound)
          {:status :skipped
           :reason (str "The query has template variables with no value: "
                        (str/join ", " (map #(str "{{" % "}}") unbound))
                        ". Give each a default value to run it.")}
          (let [result   (binding [driver.settings/*query-timeout-ms* timeout-ms]
                           (qp/process-query (prepare normalized (inc row-limit))))
                elapsed  (long (u/since-ms timer))]
            (if (= :completed (:status result))
              (let [all-rows   (vec (get-in result [:data :rows]))
                    truncated? (> (count all-rows) row-limit)
                    rows       (cond-> all-rows truncated? (subvec 0 row-limit))]
                {:status          :completed
                 :cols            (get-in result [:data :cols])
                 :rows            rows
                 :returned        (count rows)
                 :truncated?      truncated?
                 :running-time-ms (or (:running_time result) elapsed)})
              (failure (or (:error result) "Query execution failed") elapsed)))))
      (catch Throwable e
        (log/warn e "Metabot query execution failed")
        (failure (or (ex-message e) "Query execution failed")
                 (long (u/since-ms timer)))))))

;;; ------------------------------------------------ Rendering ------------------------------------------------

(defn narrate
  "The one sentence the model reads first: how many rows came back and whether the limit was the
  reason it stopped there, so it never has to infer either."
  [{:keys [status returned truncated? error reason]} row-limit]
  (case status
    :completed (if truncated?
                 (format (str "Returned %d rows, reaching the row limit of %d, so more rows may exist. "
                              "Narrow the query, aggregate, or raise row_limit for more.")
                         returned row-limit)
                 (format "Returned all %d rows matching this query. The row limit of %d was not reached and nothing was truncated."
                         returned row-limit))
    :failed    (str "The query failed to run: " error)
    :timeout   (str "The query did not finish within " (quot timeout-ms 1000)
                    " seconds and was cancelled: " error
                    ". Narrow it (filter, aggregate, add a limit) before running it again.")
    :skipped   (str "The query was not run. " reason)))

(defn- cols-table
  [cols]
  (llm-shape/format-fields-table
   (for [{:keys [name display_name base_type effective_type]} cols]
     {:name         name
      :display_name display_name
      :type         (u/qualified-name (or effective_type base_type))})
   {:columns {:name "Name" :display_name "Display Name" :type "Type"}}))

(defn- cell
  [v]
  (let [s (llm-shape/escape-xml-content (str v))
        s (if (> (count s) max-cell-chars) (str (subs s 0 max-cell-chars) "…") s)]
    (str/replace s "|" "\\|")))

(defn- rows-table
  [cols rows]
  (let [line #(str "| " (str/join " | " %) " |")]
    (str/join "\n"
              (into [(line (map :name cols))
                     (line (map (fn [{:keys [name]}] (apply str (repeat (max 3 (count name)) "-"))) cols))]
                    (map (fn [row] (line (map #(if (nil? %) "" (cell %)) row))))
                    rows))))

(defn- null-summary
  [cols rows]
  (when (seq rows)
    (let [n      (count rows)
          counts (map-indexed (fn [i col] [(:name col) (count (filter #(nil? (nth % i nil)) rows))]) cols)
          nulls  (filter (comp pos? second) counts)]
      (when (seq nulls)
        (str "Nulls over the returned rows: "
             (str/join ", " (for [[name c] nulls]
                              (str name "=" c "/" n (when (= c n) " (all null)"))))
             ".")))))

(defn execution->xml
  "Render an [[execute]] result as the `<query_execution>` block a tool puts in its `:output`. Rows
  sit inside `<rows count=\"N\">` so history persistence can drop large ones later."
  [{:keys [status cols rows returned truncated? running-time-ms] :as execution} row-limit]
  (if (= :completed status)
    (str "<query_execution status=\"completed\" returned=\"" returned "\" truncated=\"" (boolean truncated?)
         "\" limit=\"" row-limit "\"" (when running-time-ms (str " running_time_ms=\"" running-time-ms "\"")) ">\n"
         (narrate execution row-limit) "\n"
         (when (seq cols) (str "### Columns\n" (cols-table cols) "\n"))
         "<rows count=\"" returned "\">\n"
         (if (seq rows) (str (rows-table cols rows) "\n") "(no rows)\n")
         "</rows>\n"
         (some-> (null-summary cols rows) (str "\n"))
         "</query_execution>")
    (str "<query_execution status=\"" (name status) "\">\n"
         (llm-shape/escape-xml-content (narrate execution row-limit)) "\n"
         "</query_execution>")))

(defn execution-summary
  "The part of an execution worth keeping in structured output: outcome and counts, never rows."
  [{:keys [status returned truncated?]}]
  (cond-> {:status (name status)}
    (some? returned) (assoc :returned returned :truncated (boolean truncated?))))

(defn insert-into-result-block
  "Splice `xml` into `output` inside its `<result>` element when it has one, else append it."
  [output xml]
  (if (str/includes? output "</result>")
    (str/replace-first output "</result>" (str xml "\n</result>"))
    (str output "\n" xml)))

(defn strip-large-rows
  "Replace every `<rows count=\"N\">` body with more than `max-rows` rows by a note. Conversation
  history replays tool output on every later turn, so `run_query` results would otherwise be paid
  for again and again; the note tells the model how to get them back."
  [output max-rows]
  (str/replace output
               #"(?s)<rows count=\"(\d+)\">.*?</rows>"
               (fn [[whole n]]
                 (if (> (parse-long n) max-rows)
                   (str "<rows omitted=\"true\" count=\"" n "\">"
                        "Rows were dropped from the stored history; call run_query again if you need them."
                        "</rows>")
                   whole))))
