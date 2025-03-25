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

(def ^:private minibar-width 100)

(defn- render-minibar-test
  "Return hiccup html structure for a numeric column cell with mini bar charts enabled. We use nested tables
  as opposed to absolute and relative positioning for email client compatibility."
  [val {:keys [min max]}]
  (let [num            (:num-value val) ;; Assumes NumericWrapper
        is-neg?        (< num 1)
        has-neg?       (< min 0)
        normalized-max (clojure.core/max (abs min) (abs max))
        pct-full       (int (* (/ (abs num) normalized-max) 100))
        pct-left       (- minibar-width pct-full)
        neg-pct-full   (int (Math/floor (* pct-full 0.49)))
        neg-pct-left   (- 49 neg-pct-full)]
    [:table {:style (style/style {:width "100px" :border "0" :border-collapse "collapse"})}
     [:tr
      [:td {:style (style/style {:width "30%" :vertical-align "middle" :padding-right "10px"})} (h val)]
      [:td {:style (style/style {:width "70%" :vertical-align "middle" :padding "0"})}
       [:table {:style (style/style {:width "100%" :border-collapse "collapse" :height "10px"})}
        [:tr
         ;; Minibars for series that contain negative values have a dividing center line representing 0
         ;; with negative minibars extending to the left rendered with different colors
         (if has-neg?
           [:tr
            [:td {:style (style/style {:background-color (if is-neg? "#FCE1E1" "#E0ECF9") :border-radius "3px" :padding "0"})}
             [:table {:style (style/style {:width "100%" :border-collapse "collapse" :height "10px"})}
              (if is-neg?
                [:tr
                 [:td {:style (style/style {:width (format "%s%%" neg-pct-left) :padding "0"})}]
                 [:td {:style (style/style {:width (format "%s%%" (dec neg-pct-full)) :padding "0" :background-color "#E3595E" :border-radius "3px 0 0 3px"})}]
                 [:td {:style (style/style {:width "2%" :padding "0" :background-color "white"})}]
                 [:td {:style (style/style {:width "49%" :padding "0"})}]]
                [:tr
                 [:td {:style (style/style {:width "49%" :padding "0"})}]
                 [:td {:style (style/style {:width "2%" :padding "0" :background-color "white"})}]
                 [:td {:style (style/style {:width (format "%s%%" (dec neg-pct-full)) :padding "0" :background-color "#509EE3" :border-radius "0 3px 3px 0"})}]
                 [:td {:style (style/style {:width (format "%s%%" neg-pct-left) :padding "0"})}]])]]]
           [:tr
            [:td {:style (style/style {:background-color "#E0ECF9" :border-radius "3px" :padding "0"})}
             [:table {:style (style/style {:width "100%" :border-collapse "collapse" :height "10px"})}
              [:tr
               [:td {:style (style/style {:width (format "%s%%" (dec pct-full)) :padding "0" :background-color "#509EE3" :border-radius "3px"})}]
               [:td {:style (style/style {:width (format "%s%%" pct-left) :padding "0"})}]]]]])]]]]]))

(defn- render-table-body
  "Render Hiccup `<tbody>` of a `<table>`.

  `get-background-color` is a function that returned the background color for the current cell; it is invoked like

    (get-background-color cell-value column-name row-index)"
  [get-background-color _normalized-zero column-names rows columns minibar-cols]
  [:tbody
   (for [[row-idx {:keys [row bar-width]}] (m/indexed rows)]
     [:tr {:style (style/style {:color style/color-gray-3})}
      (for [[col-idx cell] (m/indexed row)]
        (let [column (nth columns col-idx)]
          [:td {:style (style/style
                        (row-style-for-type cell)
                        {:background-color (get-background-color cell (get column-names col-idx) row-idx)}
                        (when (and bar-width (= col-idx 1))
                          {:font-weight 700})
                        (when (= row-idx (dec (count rows)))
                          {:border-bottom 0})
                        (when (= col-idx (dec (count row)))
                          {:border-right 0}))}
           (if-let [minibar-col (first (filter #(= (:name column) (:name %)) minibar-cols))]
             (render-minibar-test cell (get-in minibar-col [:fingerprint :type :type/Number]))
             (h cell))]))])])

(defn render-table
  "This function returns the HTML data structure for the pulse table.

  `color-selector` is a function that returns the background color for a given cell.
  `column-names-map` contains keys:
    `:col-names`, which is the is display_names of the visible columns
    `:cols-for-color-lookup`, is the original column names, which the color-selector requires for color lookup.
  If `normalized-zero` is set (defaults to 0), render values less than it as negative"
  ([color-selector column-names-map contents columns minibar-cols]
   (render-table color-selector 0 column-names-map contents columns minibar-cols))

  ([color-selector normalized-zero {:keys [col-names cols-for-color-lookup]} [header & rows] columns minibar-cols]
   (let [pivot-grouping-idx (get (zipmap col-names (range)) "pivot-grouping")
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
         thead              (render-table-head (vec col-names) header)
         tbody              (render-table-body color-getter normalized-zero cols-for-color-lookup rows columns minibar-cols)]
     [:table {:style       (style/style {:max-width     "100%"
                                         :white-space   :nowrap
                                         :border        (str "1px solid " style/color-border)
                                         :border-radius :6px
                                         :width         "1%"})
              :cellpadding "0"
              :cellspacing "0"}
      thead
      tbody])))
