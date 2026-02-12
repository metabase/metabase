(ns metabase-enterprise.metabot-v3.api.slackbot.query
  "Ad-hoc query execution and visualization for slackbot."
  (:require
   [metabase.api.common :as api]
   [metabase.channel.render.core :as channel.render]
   [metabase.formatter.core :as formatter]
   [metabase.query-processor :as qp]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Query Execution -------------------------------------------------

(defn execute-adhoc-query
  "Execute an ad-hoc MBQL query and return results."
  [query]
  (qp/process-query
   (-> query
       (update-in [:middleware :js-int-to-string?] (fnil identity true))
       qp/userland-query-with-default-constraints
       (update :info merge {:executed-by api/*current-user-id*
                            :context     :slackbot}))))

;;; ------------------------------------------------ PNG Generation --------------------------------------------------

(defn generate-adhoc-png
  "Execute an ad-hoc query and render results to PNG."
  [query & {:keys [display results]
            :or   {display :table}}]
  (let [results    (or results (execute-adhoc-query query))
        adhoc-card {:display                display
                    :visualization_settings {}}]
    (channel.render/render-adhoc-card-to-png
     adhoc-card
     results
     1280
     {:channel.render/padding-x 32})))

;;; ------------------------------------------------ Text Formatting -------------------------------------------------

(defn- format-cell-value
  "Format a single cell value for text output."
  [value col]
  (cond
    (nil? value)    ""
    (number? value) (formatter/format-scalar-number value col {})
    :else           (str value)))

;;; ----------------------------------------------- Slack Table Blocks ------------------------------------------------
;;; See https://docs.slack.dev/reference/block-kit/blocks/table-block/

(def ^:private slack-table-max-rows
  "Maximum number of data rows for Slack table blocks.
   Slack allows 100 total rows including header, so we use 99 for data."
  99)

(def ^:private slack-table-max-cols
  "Maximum number of columns Slack table blocks support."
  20)

(defn- numeric-column?
  "Check if a column represents numeric data based on its type."
  [{:keys [base_type effective_type]}]
  (isa? (or effective_type base_type) :type/Number))

(defn- make-table-cell
  "Create a Slack table cell from a value."
  [value col]
  {:type "raw_text"
   :text (str (format-cell-value value col))})

(defn- make-table-row
  "Create a Slack table row from a sequence of values and column metadata."
  [row cols]
  (mapv make-table-cell row cols))

(defn- make-column-settings
  "Generate column settings for Slack table based on column types.
   Numbers are right-aligned, everything else is left-aligned."
  [cols]
  (mapv (fn [col]
          (if (numeric-column? col)
            {:align "right"}
            {:align "left"}))
        cols))

(defn format-results-as-table-blocks
  "Format query results as Slack table blocks.
   Returns a vector of Slack blocks suitable for posting via blocks API.
   Truncates results if they exceed Slack's limits (100 rows, 20 columns)."
  [results]
  (let [{:keys [cols rows]} (:data results)
        display-cols        (take slack-table-max-cols cols)
        display-rows        (take slack-table-max-rows rows)
        truncated-rows      (map #(take slack-table-max-cols %) display-rows)
        headers             (mapv #(str (or (:display_name %) (:name %) "")) display-cols)
        header-row          (mapv (fn [h] {:type "raw_text" :text (str h)}) headers)
        data-rows           (mapv #(make-table-row % display-cols) truncated-rows)
        all-rows            (into [header-row] data-rows)
        column-settings     (make-column-settings display-cols)]
    [{:type            "table"
      :rows            all-rows
      :column_settings column-settings}]))

(defn- format-scalar-as-text
  "Format a scalar (single value) result as text for Slack."
  [{:keys [cols rows]}]
  (let [value (ffirst rows)
        col   (first cols)]
    (if (nil? value)
      "_No results_"
      (str "*" (format-cell-value value col) "*"))))

;;; -------------------------------------------- Output Type Determination -------------------------------------------

(defn results-suitable-for-text?
  "Returns true if results should be shown as plain text (not table blocks or images).
   Only scalars and empty results use plain text format."
  [results display]
  (let [{:keys [rows cols]} (:data results)
        row-count           (count rows)
        col-count           (count cols)]
    (or (#{:scalar :smartscalar} display)
        (zero? row-count)
        (and (= 1 row-count) (= 1 col-count)))))

(defn results-suitable-for-table-blocks?
  "Returns true if results can be displayed as Slack table blocks.
   Criteria:
   - Must be a tabular display type (not scalar/smartscalar/charts)
   - Must have at least one row and column"
  [results display]
  (let [{:keys [rows cols]} (:data results)
        row-count           (count rows)
        col-count           (count cols)]
    (and (#{:table :pivot} display)
         (pos? row-count)
         (pos? col-count))))

(defn format-results-as-text
  "Format scalar/empty query results as plain text suitable for Slack.
   Only handles scalars and empty results - tables use table blocks instead."
  [results _display]
  (let [{:keys [rows] :as data} (:data results)
        row-count               (count rows)]
    (if (zero? row-count)
      "_No results_"
      (format-scalar-as-text data))))

;;; -------------------------------------------- Combined Generation -------------------------------------------------

(defn generate-adhoc-output
  "Execute an ad-hoc query and generate output based on output-mode.
   Returns a map with :type (:text, :table, or :image) and :content.
   - :text  -> content is a string (only for scalars/empty)
   - :table -> content is a vector of Slack blocks
   - :image -> content is PNG bytes

   output-mode can be:
   - :image - always render as PNG
   - :table - Slack table blocks for tables, text for scalars, image for charts (default)

   When :rows and :result-columns are provided, uses pre-fetched data instead of executing the query."
  [query & {:keys [display output-mode rows result-columns]
            :or   {display     :table
                   output-mode :table}}]
  (let [display (keyword display)
        _       (when (seq result-columns)
                  (log/infof "Pre-fetched result-columns: %s" (pr-str (mapv :name result-columns)))
                  (log/infof "Pre-fetched first row: %s" (pr-str (first rows))))
        results (if (seq result-columns)
                  {:data {:cols result-columns :rows (or rows [])}}
                  (execute-adhoc-query query))]
    (case output-mode
      :image
      {:type    :image
       :content (generate-adhoc-png query :display display :results results)}

      :table
      (cond
        ;; Tabular results -> Slack table blocks
        (results-suitable-for-table-blocks? results display)
        {:type    :table
         :content (format-results-as-table-blocks results)}

        ;; Scalar/empty results -> text
        (results-suitable-for-text? results display)
        {:type    :text
         :content (format-results-as-text results display)}

        ;; Charts -> image
        :else
        {:type    :image
         :content (generate-adhoc-png query :display display :results results)}))))
