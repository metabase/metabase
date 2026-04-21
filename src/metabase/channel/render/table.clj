(ns metabase.channel.render.table
  (:require
   [clojure.string :as str]
   [hiccup.core :refer [h]]
   [medley.core :as m]
   [metabase.channel.render.js.color :as js.color]
   [metabase.channel.render.style :as style]
   [metabase.formatter.core :as formatter]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- bar-th-style []
  (merge
   (style/font-style)
   {:font-size       (format "%spx" style/font-size)
    :font-weight     700
    :color           style/color-text-primary
    :border-bottom   (str "2px solid " style/color-border)
    :border-right    0}))

(defn- bar-td-style []
  (merge
   (style/font-style)
   {:font-size      (format "%spx" style/font-size)
    :font-weight    700
    :text-align     :left
    :color          style/color-text-primary
    :border-bottom  (str "1px solid " style/color-border)
    :border-right   (str "1px solid " style/color-border)
    :padding        (format "%sem %sem" style/td-y-padding-em style/td-x-padding-em)}))

(defn- bar-td-row-index-style []
  (merge
   (style/font-style)
   {:font-size      (format "%spx" style/font-size)
    :font-weight    400
    :text-align     :right
    :color          style/color-text-light
    :border-bottom  (str "1px solid " style/color-border)
    :border-right   (str "1px solid " style/color-border)
    :padding        (format "%sem %sem" style/td-y-padding-em style/td-x-padding-em)}))

(defn- bar-th-style-numeric []
  (merge (style/font-style) (bar-th-style) {:text-align :right}))

(defn- bar-td-style-numeric []
  (merge (style/font-style) (bar-td-style) {:text-align :right}))

(defn- heading-style-for-type
  [cell]
  (if (formatter/NumericWrapper? cell)
    (bar-th-style-numeric)
    (bar-th-style)))

(defn- row-style-for-type
  [cell]
  (if (formatter/NumericWrapper? cell)
    (bar-td-style-numeric)
    (bar-td-style)))

(def ^:private max-column-character-length 16)

(defn- truncate-text [text]
  (if (> (count text) max-column-character-length)
    (str (str/trim (subs text 0 max-column-character-length)) "...")
    text))

(defn- render-table-head [column-names {:keys [row]} columns col->styles row-index?]
  [:thead
   [:tr
    (when row-index?
      [:th {:style (style/style
                    (heading-style-for-type "#")
                    {:font-weight 400
                     :color       style/color-text-light})
            :title "Row Index"}
       (h "#")])
    (map-indexed
     (fn [idx header-cell]
       (let [title (get column-names idx)
             col   (nth columns idx)]
         [:th {:style (style/style
                       (row-style-for-type header-cell)
                       (heading-style-for-type header-cell)
                       {:min-width :42px}
                       (get col->styles (:name col)))
               :title title}
          (truncate-text (h title))]))
     row)]])

(defn calculate-pct-widths
  "Calculate the widths for label and minibar as percentages.
   Returns a vector of [label-width minibar-width] in the format '<value>%'.

   The minibar-width is calculated as 70% of cell-width unless that would exceed `max-bar-width`,
   in which case it's the percentage equivalent to 100px of the cell-width.
   The label-width is calculated as the remaining percentage (100% - minibar-width)."
  [cell-width]
  (let [minibar-percent 70
        minibar-max-percent (if (> cell-width 0)
                              (min minibar-percent
                                   (int (* (/ style/max-bar-width cell-width) 100)))
                              0)
        label-percent (- 100 minibar-max-percent)]
    [(str label-percent "%")
     (str minibar-max-percent "%")]))

(defn- render-minibar
  "Generates a Hiccup HTML structure for displaying a cell in a column with minibar charts enabled.
   We use nested tables as opposed to absolute/relative positioning for email client compatibility.

  Creates a cell with two components:
  1. A label showing the numeric value
  2. A visual bar chart representing the value relative to the data range

  Params:
  - val: A NumericWrapper containing the value to display (:num-value)
  - min/max: Map containing the minimum and maximum values in the dataset
  - col-styles: Column styling options including width specifications

  Returns:
  - Hiccup data structure for rendering HTML, or
  - Formatted value alone if not a valid numeric value"
  [val {:keys [min max]} col-styles]
  (if-let [num (:num-value val)] ;; Assumes NumericWrapper
    (let [is-neg?        (< num 0)
          has-neg?       (< min 0)
          normalized-max (clojure.core/max (abs min) (abs max))
          pct-full       (if (zero? normalized-max) 0 (int (* (/ (abs num) normalized-max) 100)))
          pct-left       (- style/mb-width pct-full)
          neg-pct-full   (int (Math/floor (* pct-full 0.49)))
          neg-pct-left   (- 49 neg-pct-full)
          cell-width     (or (:min-width col-styles) 100)
          [label-width
           bar-width]    (calculate-pct-widths cell-width)]
      [:table {:style (style/style {:width (str cell-width "px") :border "0" :border-collapse "collapse"})}
       [:tr
        [:td {:style (style/style {:width label-width :vertical-align "middle" :padding-right "10px"})} (h val)]
        [:td {:style (style/style {:width bar-width :vertical-align "middle" :padding "0"})}
         [:table {:style (style/style {:width "100%" :border-collapse "collapse"})}
          [:tr
           ;; Minibars for series that contain negative values have a dividing center line representing 0
           ;; with negative minibars extending to the left
           (if has-neg?
             [:tr
              [:td {:style (style/style {:background-color (if is-neg? (style/mb-secondary-color-alpha) (style/mb-primary-color-alpha))
                                         :border-radius "3px"
                                         :padding "0"})}
               [:table {:style (style/style {:width "100%" :border-collapse "collapse" :height (format "%spx" style/mb-height)})}
                (if is-neg?
                  [:tr
                   [:td {:style (style/style {:width (format "%s%%" neg-pct-left) :padding "0"})}]
                   [:td {:style (style/style {:width (format "%s%%" (dec neg-pct-full))
                                              :padding "0"
                                              :background-color (style/mb-secondary-color)
                                              :border-radius "3px 0 0 3px"})}]
                   [:td {:style (style/style {:width "2%" :padding "0" :background-color "white"})}]
                   [:td {:style (style/style {:width "49%" :padding "0"})}]]
                  [:tr
                   [:td {:style (style/style {:width "49%" :padding "0"})}]
                   [:td {:style (style/style {:width "2%" :padding "0" :background-color "white"})}]
                   [:td {:style (style/style {:width (format "%s%%" (dec neg-pct-full))
                                              :padding "0"
                                              :background-color (style/mb-primary-color)
                                              :border-radius "0 3px 3px 0"})}]
                   [:td {:style (style/style {:width (format "%s%%" neg-pct-left) :padding "0"})}]])]]]
             [:tr
              [:td {:style (style/style {:background-color (style/mb-primary-color-alpha) :border-radius "3px" :padding "0"})}
               [:table {:style (style/style {:width "100%" :border-collapse "collapse" :height (format "%spx" style/mb-height)})}
                [:tr
                 [:td {:style (style/style {:width (format "%s%%" pct-full)
                                            :padding "0"
                                            :background-color (style/mb-primary-color)
                                            :border-radius "3px"})}]
                 [:td {:style (style/style {:width (format "%s%%" pct-left) :padding "0"})}]]]]])]]]]])
    (h val)))

(defn- render-table-body
  "Renders the body (<tbody>) of an HTML table as a Hiccup data structure.

  Params:
  - get-background-color: Function that determines cell background colors
  - column-names: Sequence of column names/identifiers
  - rows: Sequence of row data, each containing cell values
  - columns: Column configuration objects with type information
  - viz-settings: Viz settings
  - minibar-cols: Columns that should display mini-bar visualizations instead of raw values
  - col->styles: Map of column names to their style specifications
  - row-index?: Boolean flag to include row index numbers (1-based)"
  [get-background-color column-names rows columns viz-settings minibar-cols col->styles row-index?]
  [:tbody
   (for [[row-idx {:keys [row]}] (m/indexed rows)]
     [:tr {:style (style/style {:color style/color-gray-3})}
      (when row-index?
        [:td {:style (style/style
                      (bar-td-row-index-style)
                      (when (= row-idx (dec (count rows)))
                        {:border-bottom 0}))}
         (inc row-idx)])
      (for [[col-idx cell] (m/indexed row)]
        (let [column       (nth columns col-idx)
              column-name  (get column-names col-idx)
              minibar-col  (first (filter #(= (:name column) (:name %)) minibar-cols))
              col-settings (get-in viz-settings [::mb.viz/column-settings {::mb.viz/column-name column-name}] {})]
          [:td {:style (style/style
                        (row-style-for-type cell)
                        (get col->styles (:name column))
                        {:background-color (get-background-color cell (get column-names col-idx) row-idx)}
                        (when (= row-idx (dec (count rows)))
                          {:border-bottom 0})
                        (when (= col-idx (dec (count row)))
                          {:border-right 0}))}
           (cond
             ;; Minibar column
             (some? minibar-col)
             (render-minibar cell (get-in minibar-col [:fingerprint :type :type/Number]) (get col->styles (:name column)))

             ;; View as image
             (= (get col-settings ::mb.viz/view-as) "image")
             [:img {:src (h cell)
                    :style (style/style style/view-as-img-style)}]

             :else
             (h cell))]))])])

(defn- get-min-width
  "Get the min width for a column with text wrapping enabled. In the happy path, column widths are supplied in viz settings
  and the correct index into column widths is found by grabbing the index of the column in the column definitions list whose
  name matches the column-name key of the text wrap viz setting. If this breaks down we default to an arbitrary 100px"
  [column-widths col-idx]
  (let [col-width (if col-idx (nth column-widths col-idx) 100)]
    (int (- col-width (* style/font-size style/td-x-padding-em 2)))))

(defn- get-text-align
  [text-align]
  (cond
    (= "middle" text-align) "center"
    :else                   text-align))

(defn- column-has-width
  "Check if a column has a valid width in the column-widths array.
   Returns true if:
   - column-widths is present
   - column-index is not nil
   - column-index is within bounds of column-widths
   - The width at column-index is not nil"
  [column-widths column-index]
  (and column-widths
       (some? column-index)
       (< column-index (count column-widths))
       (some? (nth column-widths column-index))))

(defn column->viz-setting-styles
  "Takes a vector of column definitions and visualization settings
  Returns a map of column identifier keys to style maps based on the visualization settings"
  [columns viz-settings]
  (let [column-settings (get viz-settings ::mb.viz/column-settings)
        column-widths   (get viz-settings :table.column_widths)]
    (reduce
     (fn [acc [col-key col-setting]]
       (let [column-name   (::mb.viz/column-name col-key)
             column-index  (first (keep-indexed
                                   (fn [idx col] (when (= (:name col) column-name) idx))
                                   columns))]
         (cond-> acc
           ;; text wrapping
           (::mb.viz/text-wrapping col-setting)
           (assoc column-name (merge {:white-space "normal"}
                                     (if (column-has-width column-widths column-index)
                                       {:min-width (format "%spx" (get-min-width column-widths column-index))}
                                       ;; Text wrapping enabled but conditions not met, fall back to 780px
                                       ;; Email clients respond to `min-width`, but slack responds to `width`
                                       {:max-width "780px !important"
                                        :width "780px"})))

           ;; text alignment
           (::mb.viz/text-align col-setting)
           (assoc column-name {:text-align (get-text-align (::mb.viz/text-align col-setting))})

           ;; view as image
           (= (::mb.viz/view-as col-setting) "image")
           (assoc column-name {:vertical-align "middle"})

           ;; minibar
           (::mb.viz/show-mini-bar col-setting)
           (assoc column-name (if (column-has-width column-widths column-index)
                                {:width (nth column-widths column-index)
                                 :min-width (get-min-width column-widths column-index)}
                                {})))))
     {}
     column-settings)))

(defn render-table
  "Generates a complete HTML table as a Hiccup data structure for displaying tabular data.

  Params:
  - color-selector: Function that determines background colors for cells
  - column-names-map: Map containing:
      :col-names - Display names of visible columns to show in the UI
      :cols-for-color-lookup - Original column names needed for color determination
  - rows-with-header: Sequence where first element is the header row and remaining elements are data rows
  - columns: Filtered column definitions
  - viz-settings: Visualization settings map controlling display options
  - minibar-cols: Columns that should display mini-bar visualizations"
  ([color-selector {:keys [col-names cols-for-color-lookup]} [header & rows] columns viz-settings minibar-cols]
   (let [col->styles        (column->viz-setting-styles columns viz-settings)
         row-index?         (:table.row_index viz-settings)
         pivot-grouping-idx (u/index-of #{"pivot-grouping"} col-names)
         col-names          (cond->> col-names
                              pivot-grouping-idx (m/remove-nth pivot-grouping-idx))
         header             (cond-> header
                              pivot-grouping-idx (update :row #(m/remove-nth pivot-grouping-idx %)))
         rows               (cond->> rows
                              pivot-grouping-idx (keep (fn [row]
                                                         (let [group (:num-value (nth (:row row) pivot-grouping-idx))]
                                                           (when (= 0 group)
                                                             (update row :row #(m/remove-nth pivot-grouping-idx %)))))))
         color-getter       (partial js.color/get-background-color color-selector)
         thead              (render-table-head (vec col-names) header columns col->styles row-index?)
         tbody              (render-table-body color-getter cols-for-color-lookup rows columns viz-settings minibar-cols col->styles row-index?)]
     [:table {:style       (style/style {:max-width     "100%"
                                         :white-space   "nowrap"
                                         :border        (str "1px solid " style/color-border)
                                         :border-radius "6px"
                                         :margin-bottom "6px"})
              :cellpadding "0"
              :cellspacing "0"}
      thead
      tbody])))
