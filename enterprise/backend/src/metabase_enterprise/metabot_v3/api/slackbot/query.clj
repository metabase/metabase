(ns metabase-enterprise.metabot-v3.api.slackbot.query
  "Ad-hoc query execution and visualization for slackbot."
  (:require
   [metabase.api.common :as api]
   [metabase.channel.render.core :as channel.render]
   [metabase.formatter.core :as formatter]
   [metabase.lib.core :as lib]
   [metabase.query-processor :as qp]
   [metabase.query-processor.schema :as qp.schema]))

(set! *warn-on-reflection* true)

(defn execute-adhoc-query
  "Execute an ad-hoc MBQL query in the context of Slackbot and return results."
  [query]
  (qp/process-query
   (-> query
       qp/userland-query-with-default-constraints
       (update :info merge {:executed-by api/*current-user-id*
                            :context     :slackbot}))))

(defn- generate-adhoc-png
  "Render query results to PNG."
  [results display]
  (let [adhoc-card {:display                display
                    :visualization_settings {}}]
    (channel.render/render-adhoc-card-to-png
     adhoc-card
     results
     1280
     {:channel.render/padding-x 32})))

;;; ------------------------------------------ Slack Table Blocks ----------------------------------------------------
;;; See https://docs.slack.dev/reference/block-kit/blocks/table-block/

(def slack-table-row-limit
  "Maximum data rows for Slack table blocks.
   Slack allows 100 total rows including header, so we use 99 for data."
  99)

(def ^:private slack-table-max-cols
  "Maximum number of columns Slack table blocks support."
  20)

(defn- normalize-column
  "Normalize column metadata from the wire format for use with formatters and type checks."
  [col]
  (lib/normalize ::qp.schema/result-metadata.column col))

(defn- numeric-column?
  [col]
  (let [{:keys [base_type effective_type]} (normalize-column col)]
    (isa? (or effective_type base_type) :type/Number)))

(defn- create-cell-formatters
  "Create formatter functions for each column using the standard formatter utility."
  [cols timezone-id viz-settings]
  (mapv #(formatter/create-formatter timezone-id (normalize-column %) viz-settings) cols))

(defn- format-cell
  "Format a cell value for Slack table display.
   Empty values are replaced with \"-\" since Slack requires non-empty text."
  [value formatter]
  (let [formatted (if (nil? value)
                    ""
                    (str (formatter value)))]
    (if (= formatted "")
      "-"
      formatted)))

(defn- make-column-settings
  "Generate column settings for Slack table. Numbers are right-aligned."
  [cols]
  (mapv (fn [col]
          (if (numeric-column? col)
            {:align "right"}
            {:align "left"}))
        cols))

(defn- make-table-row
  "Create a Slack table row from values and formatters."
  [row formatters]
  (mapv (fn [value fmt]
          {:type "raw_text"
           :text (format-cell value fmt)})
        row
        formatters))

(defn format-results-as-table-blocks
  "Format query results as Slack table blocks.
   Truncates results if they exceed Slack's limits (100 rows, 20 columns).
   Works for any result shape including single-cell scalars.
   Filters hidden columns and handles FK remapping."
  [results]
  (let [{:keys [cols rows]} (:data results)
        timezone-id         (get results :results_timezone)
        viz-settings        {}
        ;; Prepare data: filter hidden columns, handle FK remapping
        {:keys [cols rows]} (channel.render/prepare-table-data cols rows)
        ;; Now apply truncation limits
        display-cols        (vec (take slack-table-max-cols cols))
        display-rows        (take slack-table-row-limit rows)
        truncated-rows      (map #(vec (take slack-table-max-cols %)) display-rows)
        ;; Format for display
        formatters          (create-cell-formatters display-cols timezone-id viz-settings)
        headers             (mapv #(str (or (:display_name %) (:name %) "")) display-cols)
        header-row          (mapv (fn [h] {:type "raw_text" :text (str h)}) headers)
        data-rows           (mapv #(make-table-row % formatters) truncated-rows)
        all-rows            (into [header-row] data-rows)
        column-settings     (make-column-settings display-cols)]
    [{:type            "table"
      :rows            all-rows
      :column_settings column-settings}]))

(defn generate-adhoc-output
  "Generate output for an ad-hoc query based on output-mode.
   Returns a map with :type (:table or :image) and :content.

   output-mode:
   - :image - Execute query fresh and render as PNG. Pre-fetched rows are NOT allowed
             (will throw) because static viz needs full results, not the 100-row limited
             data returned to the agent.
   - :table - Render as Slack table blocks. Pre-fetched rows are REQUIRED (will throw
             if missing) because table output uses the limited data returned to the agent.
             Works for any result shape including scalars."
  [query & {:keys [display output-mode rows result-columns]
            :or   {display     :table
                   output-mode :table}}]
  (let [display (keyword display)]
    (case output-mode
      :image
      (do
        (when (seq result-columns)
          (throw (ex-info "Pre-fetched rows not allowed for :image output-mode. Static visualizations require fresh query execution for full results."
                          {:output-mode output-mode})))
        (let [results (execute-adhoc-query query)]
          {:type    :image
           :content (generate-adhoc-png results display)}))

      :table
      (do
        (when-not (seq result-columns)
          (throw (ex-info "Pre-fetched rows required for :table output-mode. Query must be executed with execute=true."
                          {:output-mode output-mode})))
        {:type    :table
         :content (format-results-as-table-blocks {:data {:cols result-columns
                                                          :rows (or rows [])}})}))))
