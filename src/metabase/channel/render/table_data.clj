(ns metabase.channel.render.table-data
  "Shared utilities for preparing query results for table rendering.
   Used by both HTML/PNG table rendering (emails, pulses) and Slack table blocks."
  (:require
   [medley.core :as m]
   [metabase.formatter.core :as formatter]
   [metabase.lib.core :as lib]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.streaming.common :as streaming.common]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn show-in-table?
  "Should this column be shown in a rendered table?
   Filters out sensitive, retired, and details-only columns."
  [{:keys [visibility_type] :as _column}]
  (not (contains? #{:details-only :retired :sensitive} visibility_type)))

(defn create-remapping-lookup
  "Creates a map from column names to the index of their remapped column.
   Used to handle FK remapping where columns have :remapped_from metadata."
  [cols]
  (into {}
        (for [[col-idx {:keys [remapped_from]}] (map-indexed vector cols)
              :when remapped_from]
          [remapped_from col-idx])))

(defn order-data
  "Apply table column ordering from viz settings to query results before rendering."
  [data viz-settings]
  (if (some? (::mb.viz/table-columns viz-settings))
    (let [deduped-table-columns       (m/distinct-by ::mb.viz/table-column-name (::mb.viz/table-columns viz-settings))
          deduped-viz-settings        (assoc viz-settings ::mb.viz/table-columns deduped-table-columns)
          [ordered-cols output-order] (qp.streaming/order-cols (:cols data) deduped-viz-settings)
          sanitized-ordered-cols      (map #(dissoc % :remapped_from :remapped_to) ordered-cols)
          keep-filtered-idx           (fn [row]
                                        (if output-order
                                          (let [row-v (into [] row)]
                                            (for [i output-order]
                                              (row-v i)))
                                          row))
          ordered-rows                (map keep-filtered-idx (:rows data))]
      [sanitized-ordered-cols ordered-rows])
    [(:cols data) (:rows data)]))

(defn prepare-table-data
  "Prepare query results for table rendering.
   - Filters out columns that shouldn't be shown (sensitive, retired, details-only)
   - Handles FK remapping: removes duplicate columns and substitutes values

   Returns {:cols [...] :rows [...]} with the prepared data."
  [cols rows]
  (let [remapping-lookup (create-remapping-lookup cols)
        ;; Build list of columns to keep (visible and not remapped_from)
        ;; and track which source index to read from for each
        col-info         (into []
                               (comp
                                (map-indexed vector)
                                (filter (fn [[_ col]] (show-in-table? col)))
                                (remove (fn [[_ col]] (:remapped_from col)))
                                (map (fn [[idx col]]
                                       {:source-idx (or (get remapping-lookup (:name col)) idx)
                                        :col        (if-let [remapped-idx (get remapping-lookup (:name col))]
                                                      (nth cols remapped-idx)
                                                      col)})))
                               cols)
        output-cols      (mapv :col col-info)
        col-indices      (mapv :source-idx col-info)
        output-rows      (mapv (fn [row]
                                 (mapv #(nth row % nil) col-indices))
                               rows)]
    {:cols output-cols
     :rows output-rows}))

;;; ------------------------------------------ Slack Table Blocks ----------------------------------------------------

(def ^:private slack-table-row-limit
  "Maximum data rows for Slack table blocks.
   Slack allows 100 total rows including header, so we use 99 for data."
  99)

(def ^:private slack-table-max-cols
  "Maximum number of columns Slack table blocks support."
  20)

(def ^:dynamic *slack-table-max-cell-length*
  "Maximum text length per cell. Longer values are truncated with ellipsis."
  128)

(def ^:dynamic *slack-table-max-chars*
  "Undocumented Slack limit: table blocks exceeding 10,000 characters are rejected with
   `table_character_count_must_not_exceed_10000`. We use 9,500 as a budget for cell text content
   to leave headroom for any structural overhead Slack may count."
  9500)

(defn- normalize-column
  "Normalize column metadata from the wire format for use with formatters and type checks."
  [col]
  (lib/normalize ::qp.schema/result-metadata.column col))

(defn- numeric-column?
  [col]
  (let [{:keys [base_type effective_type]} (normalize-column col)]
    (isa? (or effective_type base_type) :type/Number)))

(defn- create-cell-formatters
  [cols timezone-id viz-settings]
  (mapv #(formatter/create-formatter timezone-id (normalize-column %) viz-settings) cols))

(defn- format-cell
  "Format a cell value for Slack table display.
   Empty values are replaced with \"-\" since Slack requires non-empty text.
   Long values are truncated with ellipsis."
  [value formatter]
  (let [formatted (if (nil? value)
                    ""
                    (str (formatter value)))]
    (cond
      (= formatted "") "-"
      (> (count formatted) *slack-table-max-cell-length*)
      (str (u/truncate formatted (dec *slack-table-max-cell-length*)) "…")
      :else formatted)))

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

(defn- row-char-count
  "Total character count of all cell text values in a formatted row."
  [row]
  (transduce (map (comp count :text)) + row))

(defn- take-rows-within-char-budget
  "Take as many rows as fit within the character budget."
  [rows budget]
  (let [n (->> (map row-char-count rows)
               (reductions +)
               (take-while #(<= % budget))
               count)]
    (vec (take (max 1 n) rows))))

(defn format-results-as-table-blocks
  "Format query results as Slack table blocks.
   Truncates results if they exceed Slack's limits (100 rows, 20 columns, ~10k chars).
   Cell text is truncated to [[*slack-table-max-cell-length*]] characters.
   Works for any result shape including single-cell scalars.
   Filters hidden columns, respects table ordering, and handles FK remapping.
   Adds a context block with truncation message if results were truncated."
  [results]
  (let [{:keys [data]}                      results
        {:keys [viz-settings format-rows?]} data
        viz-settings        (or viz-settings {})
        timezone-id         (or (:results_timezone results)
                                (:results_timezone data))
        [ordered-cols
         ordered-rows]      (order-data data viz-settings)
        {:keys [cols rows]} (prepare-table-data ordered-cols ordered-rows)
        total-rows          (count rows)
        display-cols        (vec (take slack-table-max-cols cols))
        display-rows        (take slack-table-row-limit rows)
        truncated-rows      (mapv #(vec (take slack-table-max-cols %)) display-rows)
        formatters          (create-cell-formatters display-cols timezone-id viz-settings)
        headers             (vec (streaming.common/column-titles display-cols viz-settings format-rows?))
        header-row          (mapv (fn [h]
                                    {:type "raw_text"
                                     :text (str h)})
                                  headers)
        data-rows           (mapv #(make-table-row % formatters) truncated-rows)
        data-rows           (take-rows-within-char-budget
                             data-rows
                             (- *slack-table-max-chars* (row-char-count header-row)))
        displayed-rows      (count data-rows)
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
