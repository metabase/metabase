(ns metabase.pulse.render.table
  (:require [hiccup.core :refer [h]]
            [medley.core :as m]
            [metabase.pulse.render.color :as color]
            metabase.pulse.render.common
            [metabase.pulse.render.style :as style])
  (:import metabase.pulse.render.common.NumericWrapper))

(comment metabase.pulse.render.common/keep-me)

(defn- bar-th-style []
  (merge
   (style/font-style)
   {:font-size :12.5px
    :font-weight     700
    :color           style/color-text-medium
    :border-bottom   (str "1px solid " style/color-header-row-border)
    :padding-top     :20px
    :padding-bottom  :5px}))

(def ^:private max-bar-width 106)

(defn- bar-td-style []
  (merge
   (style/font-style)
   {:font-size      :12.5px
    :font-weight    700
    :text-align     :left
    :color          style/color-text-dark
    :border-bottom  (str "1px solid " style/color-body-row-border)
    :height         :36px
    :padding-right  :0.5em
    :padding-left   :0.5em}))

(defn- bar-th-style-numeric []
  (merge (style/font-style) (bar-th-style) {:text-align :right}))

(defn- bar-td-style-numeric []
  (merge (style/font-style) (bar-td-style) {:text-align :right}))

(defn- render-bar-component
  ([color positive? width-in-pixels]
   (render-bar-component color positive? width-in-pixels 0))

  ([color positive? width-in-pixels offset]
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

(defn- render-table-head [{:keys [bar-width row]}]
  [:thead
   [:tr
    (for [header-cell row]
      [:th {:style (style/style (row-style-for-type header-cell) (heading-style-for-type header-cell) {:min-width :60px})}
       (h header-cell)])
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
  [get-background-color normalized-zero column-names rows]
  [:tbody
   (for [[row-idx {:keys [row bar-width]}] (m/indexed rows)]
     [:tr {:style (style/style {:color style/color-gray-3})}
      (for [[col-idx cell] (m/indexed row)]
        [:td {:style (style/style
                      (row-style-for-type cell)
                      {:background-color (get-background-color cell (get column-names col-idx) row-idx)}
                      (when (and bar-width (= col-idx 1))
                        {:font-weight 700}))}
         (h cell)])
      (some-> bar-width (render-bar normalized-zero))])])

(defn render-table
  "This function returns the HTML data structure for the pulse table. `color-selector` is a function that returns the
  background color for a given cell. `column-names` is different from the header in `header+rows` as the header is the
  display_name (i.e. human friendly. `header+rows` includes the text contents of the table we're about ready to
  create. If `normalized-zero` is set (defaults to 0), render values less than it as negative"
  ([color-selector column-names [header & rows :as contents]]
   (render-table color-selector 0 column-names contents))

  ([color-selector normalized-zero column-names [header & rows]]
   [:table {:style (style/style {:max-width "100%"
                                 :white-space :nowrap
                                 :padding-bottom :8px
                                 :border-collapse :collapse
                                 :width "1%"})
            :cellpadding "0"
            :cellspacing "0"}
    (render-table-head header)
    (render-table-body (partial color/get-background-color color-selector) normalized-zero column-names rows)]))
