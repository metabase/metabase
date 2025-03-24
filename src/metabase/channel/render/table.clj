(ns metabase.channel.render.table
  (:require
   [clojure.string :as str]
   [hiccup.core :refer [h]]
   [medley.core :as m]
   [metabase.channel.render.js.color :as js.color]
   [metabase.channel.render.style :as style]
   [metabase.formatter]
   [metabase.models.visualization-settings :as mb.viz])
  (:import
   (metabase.formatter NumericWrapper)))

(comment metabase.formatter/keep-me)

(def ^:private max-bar-width 106)
(def ^:private font-size 12)
(def ^:private td-x-padding-em 1)
(def ^:private td-y-padding-em 0.75)

(defn- bar-th-style []
  (merge
   (style/font-style)
   {:font-size       (format "%spx" font-size)
    :font-weight     700
    :color           style/color-text-dark
    :border-bottom   (str "2px solid " style/color-border)
    :border-right    0}))

(defn- bar-td-style []
  (merge
   (style/font-style)
   {:font-size      (format "%spx" font-size)
    :font-weight    400
    :text-align     :left
    :color          style/color-text-dark
    :border-bottom  (str "1px solid " style/color-border)
    :border-right   (str "1px solid " style/color-border)
    :padding        (format "%sem %sem" td-y-padding-em td-x-padding-em)}))

(defn- bar-td-row-index-style []
  (merge
   (style/font-style)
   {:font-size      (format "%spx" font-size)
    :font-weight    400
    :text-align     :right
    :color          style/color-text-light
    :border-bottom  (str "1px solid " style/color-border)
    :border-right   (str "1px solid " style/color-border)
    :padding        (format "%sem %sem" td-y-padding-em td-x-padding-em)}))

(defn- bar-th-style-numeric []
  (merge (style/font-style) (bar-th-style) {:text-align :right}))

(defn- bar-td-style-numeric []
  (merge (style/font-style) (bar-td-style) {:text-align :right}))

(defn- render-bar-component
  ([color positive? width-in-pixels]
   (render-bar-component color positive? width-in-pixels 0))

  ([color positive? width-in-pixels _offset]
   [:div
    {:style (style/style
             (merge
              {:width            (format "%spx" width-in-pixels)
               :background-color color
               :max-height       :10px
               :height           :10px
               :margin-top       :3px}
              (if positive?
                {:border-radius "0px 2px 2px 0px"}
                {:border-radius "2px 0px 0px 2px"
                 ;; `float: right` would be nice instead of the `margin-left` hack, but CSSBox puts in an erroneous 2px gap with it
                 :margin-left (format "%spx" (- max-bar-width width-in-pixels))})))}
    "&#160;"]))

(defn- heading-style-for-type
  [cell]
  (if (instance? NumericWrapper cell)
    (bar-th-style-numeric)
    (bar-th-style)))

(defn- row-style-for-type
  [cell]
  (if (instance? NumericWrapper cell)
    (bar-td-style-numeric)
    (bar-td-style)))

(defn- normalized-score->pixels
  [score]
  (int (* (/ score 100.0) max-bar-width)))

(def ^:private max-column-character-length 16)

(defn- truncate-text [text]
  (if (> (count text) max-column-character-length)
    (str (str/trim (subs text 0 max-column-character-length)) "...")
    text))

(defn- render-table-head [column-names {:keys [bar-width row]} columns col->styles row-index?]
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
     row)
    (when bar-width
      [:th {:style (style/style (bar-td-style) (bar-th-style) {:width (str bar-width "%")})}])]])

(defn- render-bar
  [bar-width normalized-zero]
  (if (< bar-width normalized-zero)
    (list
     [:td {:style (style/style (bar-td-style) {:width :99%, :border-right "1px solid black", :padding-right 0})}
      (render-bar-component (style/secondary-color)
                            false
                            (normalized-score->pixels (- normalized-zero bar-width))
                            (normalized-score->pixels bar-width))]
     [:td {:style (style/style (bar-td-style) {:width :99%})}])
    (list
     (when-not (zero? normalized-zero)
       [:td {:style (style/style (bar-td-style) {:width :99%, :border-right "1px solid black"})}])
     [:td {:style (style/style (bar-td-style) {:width :99%, :padding-left 0})}
      (render-bar-component (style/primary-color)
                            true
                            (normalized-score->pixels (- bar-width normalized-zero)))])))

(defn- render-table-body
  "Render Hiccup `<tbody>` of a `<table>`.

  `get-background-color` is a function that returned the background color for the current cell; it is invoked like

    (get-background-color cell-value column-name row-index)"
  [get-background-color normalized-zero column-names rows columns col->styles row-index?]
  [:tbody
   (for [[row-idx {:keys [row bar-width]}] (m/indexed rows)]
     [:tr {:style (style/style {:color style/color-gray-3})}
      (when row-index?
        [:td {:style (style/style
                      (bar-td-row-index-style)
                      (when (= row-idx (dec (count rows)))
                        {:border-bottom 0}))}
         (inc row-idx)])
      (for [[col-idx cell] (m/indexed row)]
        (let [col (nth columns col-idx)]
          [:td {:style (style/style
                        (row-style-for-type cell)
                        (get col->styles (:name col))
                        {:background-color (get-background-color cell (get column-names col-idx) row-idx)}
                        (when (and bar-width (= col-idx 1))
                          {:font-weight 700})
                        (when (= row-idx (dec (count rows)))
                          {:border-bottom 0})
                        (when (= col-idx (dec (count row)))
                          {:border-right 0}))}
           (h cell)]))
      (some-> bar-width (render-bar normalized-zero))])])

(defn- get-min-width
  "Get the min width for a column with text wrapping enabled. In the happy path, column widths are supplied in viz settings
  and the correct index into column widths is found by grabbing the index of the column in the column definitions list whose
  name matches the column-name key of the text wrap viz setting. If this breaks down we default to an arbitrary 100px"
  [col-idx column-widths]
  (let [col-width (if col-idx (nth column-widths col-idx) 100)]
    (- col-width (* font-size td-x-padding-em 2))))

(defn- get-text-align
  [text-align]
  (cond
    (= "middle" text-align) "center"
    :else                   text-align))

;; TSP TODO - This assumes the column can be found by its key in viz settings (not always true)
(defn column->viz-setting-styles
  "Takes a vector of column definitions and visualization settings
  Returns a map of column identifier keys to style maps based on the visualization settings"
  [columns viz-settings]
  (let [column-settings (get viz-settings ::mb.viz/column-settings)
        column-widths   (get viz-settings :table.column_widths)]
    (reduce
     (fn [acc [col-key col-setting]]
       (let [column-name   (::mb.viz/column-name col-key)
             column-index  (first (keep-indexed #(when (= (:name %2) column-name) %1) columns))]
         (cond-> acc
           ;; text wrapping
           (::mb.viz/text-wrapping col-setting)
           (assoc column-name (merge {:whitespace "normal"}
                                     (if column-widths
                                       {:min-width (format "%spx" (get-min-width column-index column-widths))}
                                       ;; Text wrapping enabled but no column widths supplied, default to 780px
                                       {:max-width "780px"})))

           ;; text alignment
           (::mb.viz/text-align col-setting)
           (assoc column-name {:text-align (get-text-align (::mb.viz/text-align col-setting))}))))
     {}
     column-settings)))

;; TSP TODO - Clean up this function
(defn render-table
  "This function returns the HTML data structure for the pulse table.

  `color-selector` is a function that returns the background color for a given cell.
  `column-names-map` contains keys:
    `:col-names`, which is the is display_names of the visible columns
    `:cols-for-color-lookup`, is the original column names, which the color-selector requires for color lookup.
  If `normalized-zero` is set (defaults to 0), render values less than it as negative"
  ([color-selector column-names-map contents columns viz-settings format-rows?]
   (render-table color-selector 0 column-names-map contents columns viz-settings format-rows?))

  ([color-selector normalized-zero {:keys [col-names cols-for-color-lookup]} [header & rows] columns viz-settings format-rows?]
   (let [col->styles        (column->viz-setting-styles columns viz-settings)
         row-index?         (:table.row_index viz-settings)
         pivot-grouping-idx (get (zipmap col-names (range)) "pivot-grouping")
         col-names          (cond->> col-names
                              pivot-grouping-idx (m/remove-nth pivot-grouping-idx))
         header             (cond-> header
                              pivot-grouping-idx (update :row #(m/remove-nth pivot-grouping-idx %)))
         rows               (cond->> rows
                              pivot-grouping-idx (keep (fn [row]
                                                         (let [group (:num-value (nth (:row row) pivot-grouping-idx))]
                                                           (when (= 0 group)
                                                             (update row :row #(m/remove-nth pivot-grouping-idx %)))))))
         thead              (render-table-head (vec col-names) header columns col->styles row-index?)
         tbody              (render-table-body
                             (partial js.color/get-background-color color-selector)
                             normalized-zero
                             cols-for-color-lookup
                             rows
                             columns
                             col->styles
                             row-index?)]
     (def col->styles col->styles)
     (def viz-settings viz-settings)
     (def thead thead)
     (def tbody tbody)
     [:table {:style       (style/style {:max-width     "100%"
                                         :white-space   "nowrap"
                                         :border        (str "1px solid " style/color-border)
                                         :width         "1%"
                                         :border-radius "6px"
                                         :margin-bottom "6px"})
              :cellpadding "0"
              :cellspacing "0"}
      thead
      tbody])))
