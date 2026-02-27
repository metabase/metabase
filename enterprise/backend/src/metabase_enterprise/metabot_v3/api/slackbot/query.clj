(ns metabase-enterprise.metabot-v3.api.slackbot.query
  "Ad-hoc query execution and visualization for slackbot."
  (:require
   [metabase.api.common :as api]
   [metabase.channel.render.core :as channel.render]
   [metabase.formatter.core :as formatter]
   [metabase.lib.core :as lib]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.schema :as qp.schema]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- throw-on-failed-query!
  [results]
  (when (= :failed (:status results))
    (throw (ex-info (or (:error results) "Query execution failed")
                    (select-keys results [:error :status])))))

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
   Filters hidden columns and handles FK remapping.
   Adds a context block with truncation message if results were truncated."
  [results]
  (let [{:keys [cols rows]} (:data results)
        timezone-id         (get results :results_timezone)
        viz-settings        {}
        ;; Prepare data: filter hidden columns, handle FK remapping
        {:keys [cols rows]} (channel.render/prepare-table-data cols rows)
        total-rows          (count rows)
        ;; Apply truncation limits
        display-cols        (vec (take slack-table-max-cols cols))
        display-rows        (take slack-table-row-limit rows)
        truncated-rows      (map #(vec (take slack-table-max-cols %)) display-rows)
        displayed-rows      (count truncated-rows)
        ;; Format for display
        formatters          (create-cell-formatters display-cols timezone-id viz-settings)
        headers             (mapv #(str (or (:display_name %) (:name %) "")) display-cols)
        header-row          (mapv (fn [h] {:type "raw_text" :text (str h)}) headers)
        data-rows           (mapv #(make-table-row % formatters) truncated-rows)
        all-rows            (into [header-row] data-rows)
        column-settings     (make-column-settings display-cols)
        table-block         {:type            "table"
                             :rows            all-rows
                             :column_settings column-settings}
        rows-truncated?     (> total-rows displayed-rows)]
    (if rows-truncated?
      [table-block
       {:type     "context"
        :elements [{:type "mrkdwn"
                    :text (format "Showing %d of %d rows" displayed-rows total-rows)}]}]
      [table-block])))

(def ^:private chart-display-types
  "Display types that should render as PNG images rather than Slack tables."
  #{:bar :line :pie :area :row :scatter :funnel :waterfall :combo :progress :gauge})

(defn generate-adhoc-output
  "Generate output for an ad-hoc query based on display type.
   Returns a map with :type (:table or :image) and :content.
   Always executes the query directly.

   - Chart display types (bar, line, pie, etc.) render as PNG
   - Table display (or nil) renders as native Slack table blocks"
  [query & {:keys [display]
            :or   {display :table}}]
  (let [display (keyword display)
        results (execute-adhoc-query query)]
    (throw-on-failed-query! results)
    (if (contains? chart-display-types display)
      {:type    :image
       :content (generate-adhoc-png results display)}
      {:type    :table
       :content (format-results-as-table-blocks results)})))

;;; ------------------------------------------ Saved Card Visualization ----------------------------------------------------

(def ^:private supported-png-display-types
  "Display types that can be rendered as PNG images for Slack.
   These correspond to the render methods in channel.render.body and
   frontend static-viz components. Map types (pin_map, state, country)
   are explicitly unsupported per channel.render.card/detect-pulse-chart-type."
  #{:scalar :smartscalar :gauge :progress
    :bar :line :area :combo :row :pie
    :scatter :boxplot :waterfall :funnel :sankey})

(defn pulse-card-query-results
  "Execute a query for a saved card, returning results suitable for rendering."
  {:arglists '([card])}
  [{query :dataset_query, card-id :id}]
  ;; Use the same approach as pulse API - this works for accessible cards
  (binding [qp.perms/*card-id* card-id]
    (qp/process-query
     (qp/userland-query
      (assoc query
             :middleware {:process-viz-settings? true
                          :js-int-to-string?     false})
      {:executed-by api/*current-user-id*
       :context     :pulse
       :card-id     card-id}))))

(defn- render-saved-card-png
  "Render a saved card (already fetched from DB) to PNG bytes."
  [card {:keys [width padding-x padding-y]
         :or   {width 1280 padding-x 32 padding-y 0}}]
  (let [options {:channel.render/include-title? true
                 :channel.render/padding-x padding-x
                 :channel.render/padding-y padding-y}
        results (pulse-card-query-results card)]
    (throw-on-failed-query! results)
    ;; TODO: should we use the user's timezone for this?
    (channel.render/render-pulse-card-to-png (channel.render/defaulted-timezone card)
                                             card
                                             results
                                             width
                                             options)))

(defn generate-card-output
  "Generate output for a saved card based on its display type.
   Returns a map with :type (:table or :image) and :content.

   - `table` and display types not supported by static viz render as native Slack table blocks
   - static viz chart types render as PNG"
  [card-id]
  (let [card (t2/select-one :model/Card :id card-id)]
    (when-not card
      (throw (ex-info "Card not found" {:card-id card-id :type :card-not-found})))
    (if (-> card :display keyword supported-png-display-types)
      {:type    :image
       :content (render-saved-card-png card {})}
      (let [results (pulse-card-query-results card)]
        (throw-on-failed-query! results)
        {:type    :table
         :content (format-results-as-table-blocks results)}))))
