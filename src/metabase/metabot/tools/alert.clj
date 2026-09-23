(ns metabase.metabot.tools.alert
  "Tools for the `:alert` profile, which a triggered alert runs in the background to interpret its
  results or decide whether to deliver them.

  The model can look beyond the alert's own results: it finds other content with the usual search
  and metadata tools, builds queries with `construct_notebook_query`, and runs them with
  [[run-query-tool]]. It finishes by calling the submit tool for its task, whose structured output
  is the answer the notification reads."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.shared :as shared]
   [metabase.notification.ai-summary :as ai-summary]
   [metabase.query-processor :as qp]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private default-row-limit 50)

(def ^:private max-row-limit 200)

(def ^:private query-passthrough-keys
  "Only these keys of a stored query reach the QP; constraints and attribution are this tool's to
  set. Mirrors `metabase.mcp.v2.tools.query`."
  [:lib/type :database :stages :parameters])

(defn- execute
  [query row-limit]
  (qp/process-query
   (-> (select-keys query query-passthrough-keys)
       qp/userland-query-with-default-constraints
       (assoc :constraints {:max-results           row-limit
                            :max-results-bare-rows row-limit}
              :info        {:executed-by api/*current-user-id*
                            :context     :agent}))))

(defn- result->output
  "The same rendering the alert's own results get: chart stats when the result has a chartable
  shape, then the row excerpt."
  [result]
  (if-let [excerpt (ai-summary/result->excerpt result)]
    (str/join "\n\n" (remove nil? [(ai-summary/result->chart-analysis {:name "Query result"} result)
                                   (str "## Rows\n" excerpt)]))
    "The query returned no rows."))

(mu/defn ^{:tool-name "run_query"
           :scope     scope/agent-query-execute}
  run-query-tool
  "Run a query you built earlier in this conversation (with construct_notebook_query) and see its
  results: chart statistics when the result has a chartable shape, then up to 50 rows.

  Use this to check the alert's data against other data, e.g. the same period last year, or what
  another model shows right now."
  [{:keys [query_id row_limit]} :- [:map {:closed true}
                                    [:query_id [:string {:description "The query-id returned when the query was built."}]]
                                    [:row_limit {:optional true}
                                     [:maybe [:int {:min 1 :max max-row-limit
                                                    :description (str "Most rows to fetch. Defaults to "
                                                                      default-row-limit ".")}]]]]]
  (try
    (let [query  (memory/find-query (shared/current-memory) query_id)
          result (execute query (or row_limit default-row-limit))]
      (if (= :completed (:status result))
        {:output            (result->output result)
         :structured-output {:query-id query_id
                             :row-count (count (get-in result [:data :rows]))}}
        {:output (str "The query failed: " (or (:error result) "unknown error"))}))
    (catch Exception e
      (log/debug e "run_query failed")
      {:output (str "The query could not be run: " (ex-message e))})))

(mu/defn ^{:tool-name "submit_alert_summary"}
  submit-alert-summary-tool
  "Finish the alert-summary task by submitting your interpretation. Call this exactly once, when you
  are done; it ends your turn."
  [{:keys [summary title]} :- [:map {:closed true}
                               [:summary [:string {:description "The interpretation, as plain text or light markdown."}]]
                               [:title {:optional true}
                                [:maybe [:string {:description "The alert's title, only when your task asks for one."}]]]]]
  {:output            "Summary submitted."
   :structured-output (cond-> {:summary summary}
                        title (assoc :title title))})

(mu/defn ^{:tool-name "submit_send_decision"}
  submit-send-decision-tool
  "Finish the send-decision task by submitting your decision. Call this exactly once, when you are
  done; it ends your turn. Fill the fields in order: work through the rule in `reason` before
  committing to `verdict`, then write `explanation` for the recipient."
  [{:keys [reason verdict explanation]}
   :- [:map {:closed true}
       [:reason [:string {:description (str "Work through what the owner's rule asks for and what the "
                                            "data actually shows. Not shown to anyone.")}]]
       [:verdict [:string {:description (str "Exactly one of: deliver, suppress. Say suppress when the "
                                             "owner's rule clearly indicates they do not want this "
                                             "firing; otherwise deliver.")}]]
       [:explanation [:string {:description (str "One short sentence, max 25 words, telling the recipient "
                                                 "why this alert cleared their rule. Written to them, in "
                                                 "plain language, naming the values that mattered. No "
                                                 "preamble.")}]]]]
  {:output            "Decision submitted."
   :structured-output {:reason reason :verdict verdict :explanation explanation}})

(defn alert-system-context
  "System-prompt template vars for the `:alert` profile: the caller's instructions for this task.
  Wired as the profile's `:system-prompt-context` hook."
  [context]
  {:alert_instructions (:alert_instructions context)})
