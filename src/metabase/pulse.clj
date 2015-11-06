(ns metabase.pulse
  (:require [hiccup.core :refer [html]]))

(def ^:private td-style " font-size: 14pt; text-align: left; padding-right: 1em; padding-top: 8px; ")
(def ^:private th-style " font-size: 12pt; text-transform: uppercase; border-bottom: 4px solid rgb(248, 248, 248); padding-bottom: 10px; ")

(defn bar-chart-row
  [index row max-value]
  [:tr {:style (if (odd? index) "color: rgb(189,193,191);" "color: rgb(124,131,129);")}
    [:td {:style td-style} (first row)]
    [:td {:style (str td-style " font-weight: bolder;")} (second row)]
    [:td {:style td-style}
      [:div {:style (str "background-color: rgb(135, 93, 175); height: 20px; width: " (float (* 100 (/ (second row) max-value))) "%")} "&nbsp;"]]])

(defn bar-chart
  [data]
  (let [{cols :cols rows :rows } data
        max-value (apply max (map second rows))]
        [:table {:style "border-collapse: collapse;"}
          [:thead
            [:tr
              [:th {:style (str td-style th-style "min-width: 60px;")}
                (:display_name (first cols))]
              [:th {:style (str td-style th-style "min-width: 60px;")}
                (:display_name (second cols))]
              [:th {:style (str td-style th-style "width: 99%")}]]]
          [:tbody
            (map-indexed #(bar-chart-row %1 %2 max-value) rows)]]))

(defn render-pulse-card
  [card, data]
   [:section {:style "font-family: Lato, \"Helvetica Neue\", Helvetica, sans-serif; padding-left: 1em; padding-right: 1em; padding-bottom: 15px;"}
    [:h2 (:name card)]
    (bar-chart data)])
