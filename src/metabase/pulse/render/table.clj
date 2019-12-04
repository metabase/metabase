(ns metabase.pulse.render.table
  (:require [hiccup.core :refer [h]]
            [medley.core :as m]
            [metabase.plugins.classloader :as classloader]
            [metabase.pulse.render
             [color :as color]
             [style :as style]])
  (:import jdk.nashorn.api.scripting.JSObject))

;; Our 'helpful' NS declaration linter will complain that common is unused. But we need to require it so
;; NumericWrapper exists in the first place.
(classloader/require 'metabase.pulse.render.common)
(import 'metabase.pulse.render.common.NumericWrapper)

(defn- bar-th-style []
  (merge
   (style/font-style)
   {:font-size :12.5px
    :font-weight     700
    :color           style/color-text-medium
    :border-bottom   (str "1px solid " style/color-header-row-border)
    :padding-top     :20px
    :padding-bottom  :5px}))

(defn- bar-td-style []
  (merge
   (style/font-style)
   {:font-size      :12.5px
    :font-weight    700
    :text-align     :left
    :color          style/color-text-dark
    :border-bottom  (str "1px solid " style/color-body-row-border)
    :height         :36px
    :width          :106px
    :padding-right  :0.5em
    :padding-left   :0.5em}))

(defn- bar-th-style-numeric []
  (merge (style/font-style) (bar-th-style) {:text-align :right}))

(defn- bar-td-style-numeric []
  (merge (style/font-style) (bar-td-style) {:text-align :right}))

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

(defn- render-table-head [{:keys [bar-width row]}]
  [:thead
   [:tr
    (for [header-cell row]
      [:th {:style (style/style (row-style-for-type header-cell) (heading-style-for-type header-cell) {:min-width :60px})}
       (h header-cell)])
    (when bar-width
      [:th {:style (style/style (bar-td-style) (bar-th-style) {:width (str bar-width "%")})}])]])

(defn- render-table-body
  "Render Hiccup `<tbody>` of a `<table>`.

  `get-background-color` is a function that returned the background color for the current cell; it is invoked like

    (get-background-color cell-value column-name row-index)"
  [get-background-color column-names rows]
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
      (when bar-width
        [:td {:style (style/style (bar-td-style) {:width :99%})}
         [:div {:style (style/style {:background-color (style/primary-color)
                                     :max-height       :10px
                                     :height           :10px
                                     :border-radius    :2px
                                     :width            (str bar-width "%")})}
          "&#160;"]])])])

(defn render-table
  "This function returns the HTML data structure for the pulse table. `color-selector` is a function that returns the
  background color for a given cell. `column-names` is different from the header in `header+rows` as the header is the
  display_name (i.e. human friendly. `header+rows` includes the text contents of the table we're about ready to
  create."
  [^JSObject color-selector, column-names [header & rows]]
  [:table {:style (style/style {:max-width (str "100%"), :white-space :nowrap, :padding-bottom :8px, :border-collapse :collapse})
           :cellpadding "0"
           :cellspacing "0"}
   (render-table-head header)
   (render-table-body (partial color/get-background-color color-selector) column-names rows)])
