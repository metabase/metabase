(ns metabase.pulse.render.table
  (:require
   [clojure.string :as str]
   [hiccup.core :refer [h]]
   [medley.core :as m]
   [metabase.formatter]
   [metabase.pulse.render.color :as color]
   [metabase.pulse.render.style :as style])
  (:import
   (metabase.formatter NumericWrapper)))

(comment metabase.formatter/keep-me)

(defn- bar-th-style []
  (merge
   (style/font-style)
   {:font-size :12px
    :font-weight     700
    :color           style/color-text-dark
    :border-bottom   (str "2px solid " style/color-border)
    :border-right    0}))

(def ^:private max-bar-width 106)

(defn- bar-td-style []
  (merge
   (style/font-style)
   {:font-size      :12px
    :font-weight    400
    :text-align     :left
    :color          style/color-text-dark
    :border-bottom  (str "1px solid " style/color-border)
    :border-right   (str "1px solid " style/color-border)
    :padding        "0.75em 1em"}))

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

(defn- render-table-head [column-names {:keys [bar-width row]}]
  [:thead
   (conj (into [:tr]
               (map-indexed
                (fn [idx header-cell]
                  (let [title (get column-names idx)]
                    [:th {:style (style/style
                                  (row-style-for-type header-cell)
                                  (heading-style-for-type header-cell)
                                  {:min-width :42px})
                          :title title}
                     (truncate-text (h title))]))
                row))
         (when bar-width
           [:th {:style (style/style (bar-td-style) (bar-th-style) {:width (str bar-width "%")})}]))])

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
                        {:font-weight 700})
                      (when (= row-idx (dec (count rows)))
                        {:border-bottom 0})
                      (when (= col-idx (dec (count row)))
                        {:border-right 0}))}
         (h cell)])
      (some-> bar-width (render-bar normalized-zero))])])

(defn render-table
  "This function returns the HTML data structure for the pulse table.

  `color-selector` is a function that returns the background color for a given cell.
  `column-names-map` contains keys:
    `:col-names`, which is the is display_names of the visible columns
    `:cols-for-color-lookup`, is the original column names, which the color-selector requires for color lookup.
  If `normalized-zero` is set (defaults to 0), render values less than it as negative"
  ([color-selector column-names-map contents]
   (render-table color-selector 0 column-names-map contents))

  ([color-selector normalized-zero {:keys [col-names cols-for-color-lookup]} [header & rows]]
   [:table {:style       (style/style {:max-width     "100%"
                                       :white-space   :nowrap
                                       :border        (str "1px solid " style/color-border)
                                       :border-radius :6px
                                       :width         "1%"})
            :cellpadding "0"
            :cellspacing "0"}
    (render-table-head (vec col-names) header)
    (render-table-body (partial color/get-background-color color-selector) normalized-zero cols-for-color-lookup rows)]))
