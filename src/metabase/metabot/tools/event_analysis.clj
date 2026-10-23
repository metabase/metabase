(ns metabase.metabot.tools.event-analysis
  "Product analytics (event analysis) tools: `run_event_sql` runs ClickHouse SQL on top of the analysis's
  CTEs and shows the rows to the model; `suggest_analysis` proposes a change to the analysis as a card the
  user can apply. Prototype: the event analysis page is the only caller, through the `:product_analytics`
  profile."
  (:require
   [clojure.string :as str]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.query-execution :as query-execution]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.shared :as shared]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private row-limit 200)

(def ^:private max-cell-length 120)

;;; ──────────────────────────────────────────────────────────────────
;;; SQL assembly
;;; ──────────────────────────────────────────────────────────────────

(defn- strip-leading-comments
  "Drop leading whitespace and `--` / `/* */` comments, so a leading `WITH` can be detected."
  [sql]
  (loop [s (str/triml sql)]
    (cond
      (str/starts-with? s "--")
      (recur (str/triml (if-let [i (str/index-of s "\n")] (subs s (inc i)) "")))

      (str/starts-with? s "/*")
      (recur (str/triml (if-let [i (str/index-of s "*/")] (subs s (+ i 2)) "")))

      :else s)))

(defn- strip-trailing-semicolons
  [sql]
  (str/replace sql #"[\s;]+$" ""))

(defn- render-ctes
  [ctes]
  (str/join ",\n" (for [{cte-name :name, cte-sql :sql} ctes]
                    (str cte-name " AS (\n" (strip-trailing-semicolons cte-sql) "\n)"))))

(defn full-sql
  "Prepend the analysis's `ctes` (`[{:name :sql}]`, in order) to the model's `sql`. When `sql` has its own leading
  `WITH`, its CTEs are appended after ours in a single `WITH` clause."
  [ctes sql]
  (let [sql (strip-trailing-semicolons sql)]
    (if (empty? ctes)
      sql
      (let [ours (render-ctes ctes)]
        (if-let [[_ rest-of-sql] (re-matches #"(?is)with\s+(.*)" (strip-leading-comments sql))]
          (str "WITH\n" ours ",\n" rest-of-sql)
          (str "WITH\n" ours "\n" sql))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Results
;;; ──────────────────────────────────────────────────────────────────

(defn- format-cell
  [v]
  (let [s (cond
            (nil? v)    "null"
            (string? v) v
            :else       (str v))
        s (str/replace s #"[\r\n|]+" " ")]
    (if (> (count s) max-cell-length)
      (str (subs s 0 max-cell-length) "…")
      s)))

(defn- format-table
  [cols rows]
  (let [header (map :name cols)
        line   (fn [cells] (str "| " (str/join " | " cells) " |"))]
    (str/join "\n" (concat [(line header)
                            (line (repeat (count header) "---"))]
                           (map #(line (map format-cell %)) rows)))))

(defn- format-result
  [{:keys [cols rows returned truncated?]}]
  (str "<result>\n"
       (if truncated?
         (format "Showing the first %d rows; the query returned more. Aggregate further if you need all of it.\n"
                 returned)
         (format "%d row%s.\n" returned (if (= 1 returned) "" "s")))
       (format-table cols rows)
       "\n</result>"))

;;; ──────────────────────────────────────────────────────────────────
;;; run_event_sql
;;; ──────────────────────────────────────────────────────────────────

(def ^:private chart-displays ["bar" "line" "row" "table" "funnel" "pie"])

(def ^:private run-event-sql-schema
  [:map {:closed true}
   [:sql [:string {:description "ClickHouse SQL. Reference events_base and the other listed CTEs directly; don't redefine them."}]]
   [:chart {:optional true}
    [:maybe
     [:map {:closed true}
      [:title [:string {:description "A short title for the chart, shown above it."}]]
      [:display (into [:enum {:description "How to draw the result."}] chart-displays)]]]]])

(defn- native-query
  "MBQL 5 native query for `sql` on `database-id`."
  [database-id sql]
  (lib/native-query (lib-be/application-database-metadata-provider database-id) sql))

(defn run-event-sql
  "Run `sql` with the analysis's CTEs on `database-id`. Returns the tool result map."
  [{:keys [database_id ctes]} {:keys [sql chart]}]
  (let [sql'  (full-sql ctes sql)
        query (native-query database_id sql')]
    (try
      (let [page (query-execution/execute-page! query row-limit :agent)]
        (cond-> {:output (format-result page)}
          chart
          (merge (let [query-id (u/generate-nano-id)
                       legacy   (links/->legacy-mbql query)]
                   {:output            (str (format-result page)
                                            "\nThe chart \"" (:title chart) "\" is shown to the user inline.")
                    :structured-output {:query-id query-id :query legacy}
                    :data-parts        [(streaming/viz-part {:entity-id (str (random-uuid))
                                                             :query-id  query-id
                                                             :query     legacy
                                                             :display   (:display chart)
                                                             :title     (:title chart)})]}))))
      (catch Exception e
        (log/debug e "run_event_sql query failed")
        {:output (str "<error>\n" (u/truncate (or (ex-message e) "Query failed: unknown error") 2000) "\n</error>\n"
                      (when (seq ctes)
                        (format "Note: the %d CTE(s) from the context (%s) are prepended to your SQL, so line numbers in the error are offset. Fix your SQL and try again."
                                (count ctes) (str/join ", " (map :name ctes))))
                      (when chart "\nNo chart was shown."))}))))

(defn- run-event-sql-title
  [{:keys [chart]}]
  (if chart (str "Charting " (:title chart)) "Querying events"))

(mu/defn ^{:tool-name "run_event_sql"
           :scope     scope/agent-sql-run
           :title-fn  run-event-sql-title}
  run-event-sql-tool
  "Run a ClickHouse SQL query against the product analytics event data and see up to 200 result rows.

  `events_base` and the other CTEs listed in the event analysis context are already defined: reference them
  directly (`FROM events_base`), don't redefine or copy them. `events_base` is the current analysis's events with
  its date range and filters applied. You may start your SQL with your own `WITH` clause; your CTEs are added
  after the predefined ones.

  Aggregate in SQL and keep results small (a few dozen rows at most).

  Pass `chart` to also show the result to the user as an inline chart. Every chart you show should be a query
  whose rows you have seen: run the query (with `chart`) and then talk about what it returned."
  [args :- run-event-sql-schema]
  (if-let [item (memory/event-analysis-item (shared/current-memory))]
    (if (:database_id item)
      (run-event-sql item args)
      {:output "The event analysis context has no database_id, so there is nothing to query."})
    {:output "No event analysis is in context, so run_event_sql can't run. The user must be on an event analysis page."}))

;;; ──────────────────────────────────────────────────────────────────
;;; suggest_analysis
;;; ──────────────────────────────────────────────────────────────────

(def ^:private filter-operators ["=" "!=" "is-empty" "not-empty"])

(def ^:private change-schema
  [:map {:closed true}
   [:type [:enum {:description "The kind of change. Which other keys apply depends on it."}
           "filter" "step-filter" "breakout" "steps" "date_range" "counting" "funnel.window"]]
   [:step {:optional true}
    [:maybe [:int {:description "step-filter only: the 1-based step the filter applies to."}]]]
   [:column {:optional true}
    [:maybe [:string {:description "filter, step-filter, breakout: a pa_events_resolved column name. For breakout, null removes the breakout."}]]]
   [:operator {:optional true}
    [:maybe (into [:enum {:description "filter, step-filter: the operator."}] filter-operators)]]
   [:values {:optional true}
    [:maybe [:sequential {:description "filter, step-filter: the values for = and !=."} :string]]]
   [:segments {:optional true}
    [:maybe [:sequential {:description "steps: saved segment names, in step order."} :string]]]
   [:value {:optional true}
    [:maybe [:or {:description (str "date_range: e.g. \"past30days\". counting: \"person\", \"session\" or \"event\". "
                                    "funnel.window: {\"value\": 7, \"unit\": \"day\"}.")}
             :string
             [:map {:closed true}
              [:value number?]
              [:unit [:enum "minute" "hour" "day" "week" "month"]]]]]]])

(def ^:private suggest-analysis-schema
  [:map {:closed true}
   [:title [:string {:description "Short name for the suggested analysis, e.g. \"Pricing → Signed up, anonymous visitors only\"."}]]
   [:why [:string {:description "One line on why this analysis is worth a look."}]]
   [:kind {:optional true}
    [:maybe [:enum {:description "The analysis kind. Omit to keep the current one."}
             "funnel" "paths" "habit" "lifecycle" "cohorts"]]]
   [:changes [:sequential {:description "Changes to apply to the current analysis."} change-schema]]])

(defn- drop-nil-vals
  [m]
  (into {} (remove (comp nil? val)) m))

(defn- suggest-analysis-title
  [{:keys [title]}]
  (str "Suggesting " title))

(mu/defn ^{:tool-name "suggest_analysis"
           :title-fn  suggest-analysis-title}
  suggest-analysis-tool
  "Suggest a change to the event analysis the user is looking at. It's shown as a card with Apply and Open in new
  tab buttons; nothing changes until the user clicks one. Use it for any next step that is a change to the
  analysis, instead of describing the change in words.

  Column names are columns of the event table (`pa_events_resolved`). `segments` are saved segment names from the
  context. `step` is 1-based. A `breakout` with a null column removes the breakout."
  [{:keys [title why kind changes]} :- suggest-analysis-schema]
  (let [data (cond-> {:id      (str (random-uuid))
                      :title   title
                      :why     why
                      :changes (mapv (fn [change]
                                       ;; keep an explicit `column: null` (removes a breakout); drop other nils
                                       (cond-> (drop-nil-vals change)
                                         (and (= "breakout" (:type change)) (nil? (:column change)))
                                         (assoc :column nil)))
                                     changes)}
               kind (assoc :kind kind))]
    {:output     "Shown to the user as a card with Apply and Open in new tab buttons. Don't repeat its contents."
     :data-parts [(streaming/event-analysis-part data)]}))
