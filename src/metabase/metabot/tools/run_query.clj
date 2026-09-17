(ns metabase.metabot.tools.run-query
  "The `run_query` tool: execute a query and hand its rows to the model, and only to the model."
  (:require
   [clojure.string :as str]
   [metabase.api-scope.core :as api-scope]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.query-execution :as query-execution]
   [metabase.metabot.tools.recovery-hints :as recovery-hints]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.sql.create :as sql.create]
   [metabase.metabot.tools.util :as tools.u]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private run-query-args-schema
  [:map {:closed true}
   [:reasoning {:optional true} [:maybe :string]]
   [:query_id {:optional true}
    [:maybe [:string {:description "The id of a query created earlier in this conversation. Exactly one of query_id | query | database_id + sql."}]]]
   [:query {:optional true}
    [:maybe (mu/with construct/LLMExternalQuery
                     {:json-schema (assoc construct/construct-notebook-query-json-schema
                                          :description "A fresh MBQL 5 query object in the same shape construct_notebook_query takes. Exactly one of query_id | query | database_id + sql.")})]]
   [:database_id {:optional true}
    [:maybe [:int {:description "With sql: the database to run it against."}]]]
   [:sql {:optional true}
    [:maybe [:string {:description "A SELECT to run as raw SQL, when MBQL cannot express it. Requires database_id. Exactly one of query_id | query | database_id + sql."}]]]
   [:row_limit {:optional true}
    [:maybe [:int {:min 1 :max query-execution/max-row-limit
                   :description "Rows to return (default 100, max 500). If the result is truncated, aggregate or narrow the query instead of raising this."}]]]])

(def ^:private result-instructions
  (str "These rows are visible only to you; the user has not seen them. Cite only values that appear above. "
       "If this result answers the user's question, show it to them by building a chart or query from this "
       "query_id with the chart and query tools instead of repeating the table in prose. If the result was "
       "truncated, aggregate or narrow the query rather than paging through rows."))

(defn- input-shape
  [{:keys [query_id query database_id sql]}]
  (let [given (cond-> #{}
                query_id                (conj :query_id)
                query                   (conj :query)
                (or database_id sql)    (conj :sql))]
    (cond
      (not= 1 (count given)) :ambiguous
      query_id               :query_id
      query                  :query
      (and database_id sql)  :sql
      :else                  :ambiguous)))

(defn- resolve-query
  "Return `{:query-id .. :query ..}` for the tool input, or `{:output ..}` telling the model what was
  wrong with it."
  [{:keys [query_id query database_id sql] :as args}]
  (case (input-shape args)
    :ambiguous
    {:output (str "Pass exactly one of: query_id (a query from this conversation), query (an MBQL query "
                  "object), or database_id together with sql.")}

    :query_id
    (if-let [stored (get (shared/current-queries-state) query_id)]
      {:query-id query_id :query stored}
      {:output (str "Unknown query_id " query_id ". Available: "
                    (str/join ", " (sort (map str (keys (shared/current-queries-state))))))})

    :query
    (let [{:keys [structured-output]} (construct/execute-representations-query
                                       query {:recovery-hint recovery-hints/recovery-hint})]
      {:query-id (u/generate-nano-id) :query (:query structured-output)})

    :sql
    (do
      (when-not (api-scope/scope-matches? scope/*current-user-scope* scope/agent-sql-run)
        (throw (ex-info (tru "You do not have permission to run SQL queries.")
                        {:agent-error? true :terminal-error? true})))
      (let [{:keys [validation-result action-result]} (sql.create/create-sql-query
                                                       {:database-id database_id :sql sql})
            {:keys [valid? dialect error-message]}   validation-result]
        (if valid?
          {:query-id (:query-id action-result) :query (:query action-result)}
          {:output (instructions/sql-validation-error-instructions dialect error-message)})))))

(mu/defn ^{:tool-name  "run_query"
           :scope      scope/agent-query-run
           :available? #'metabot.settings/metabot-query-execution-enabled}
  run-query-tool
  "Run a query and read its rows yourself. Nothing is shown to the user. Use it when your answer has to state a
  value (a count, a top item, a comparison, a trend), when a query's execution receipt looks wrong (an error,
  zero rows, an all-null column) and you need to see more before fixing it, or to check a specific value exists
  before filtering on it. Do not use it to re-run a query whose receipt already answered the question, or to
  scan a large result: aggregate instead. Pass exactly one of query_id (a query from this conversation), query (an
  MBQL 5 query object, same shape as construct_notebook_query), or database_id with sql. The result returns a
  query_id you can pass to the chart and query tools to show the user."
  [{:keys [row_limit] :as args} :- run-query-args-schema]
  (try
    (let [{:keys [output query-id query]} (resolve-query args)]
      (if output
        {:output output}
        (let [limit     (or row_limit query-execution/default-row-limit)
              execution (query-execution/execute query limit)
              xml       (query-execution/execution->xml execution limit)]
          (if (= :completed (:status execution))
            {:output            (str xml "\n<instructions>\n" result-instructions "\n</instructions>")
             :structured-output {:query-id    query-id
                                 :query       query
                                 :result-type :query
                                 :execution   (query-execution/execution-summary execution)}}
            {:output xml}))))
    (catch clojure.lang.ExceptionInfo e
      (tools.u/handle-agent-error e))))
