(ns metabase.pulse
  (:require [hiccup.core :refer [html]]
            [clojure.pprint :refer [cl-format]]
            [clojure.string :refer [upper-case]]
            (metabase.models [setting :refer [defsetting]])))


;;; ## CONFIG

(defsetting slack-token "Slack API bearer token obtained from https://api.slack.com/web#authentication")

(def ^:private font-style "font-family: Lato, \"Helvetica Neue\", Helvetica, Arial, sans-serif;")
(def ^:private section-style font-style)
(def ^:private header-style  (str font-style "font-size: 16px; font-weight: 700; color: rgb(57,67,64); margin-bottom: 8px;"))
(def ^:private scalar-style  (str font-style "font-size: 32px; font-weight: 400; color: rgb(45,134,212); padding-top: 12px;"))
(def ^:private bar-th-style  (str font-style "font-size: 10px; font-weight: 400; color: rgb(57,67,64); border-bottom: 4px solid rgb(248, 248, 248); padding-bottom: 10px;"))
(def ^:private bar-td-style  (str font-style "font-size: 16px; font-weight: 400; text-align: left; padding-right: 1em; padding-top: 8px;"))

(defn format-number
  [n]
  (if (integer? n) (cl-format nil "~:d" n) (cl-format nil "~,2f" n)))

(defn render-bar-chart-row
  [index row max-value]
  [:tr {:style (if (odd? index) "color: rgb(189,193,191);" "color: rgb(124,131,129);")}
    [:td {:style bar-td-style} (first row)]
    [:td {:style (str bar-td-style "font-weight: 700;")} (format-number (second row))]
    [:td {:style (str bar-td-style "width: 99%;")}
      [:div {:style (str "background-color: rgb(135, 93, 175); height: 20px; width: " (float (* 100 (/ (second row) max-value))) "%")} "&#160;"]]])

(defn render-bar-chart
  [data]
  (let [{cols :cols rows :rows } data
        max-value (apply max (map second rows))]
        [:table {:style "border-collapse: collapse;"}
          [:thead
            [:tr
              [:th {:style (str bar-td-style bar-th-style "min-width: 60px;")}
                (-> cols first :display_name upper-case)]
              [:th {:style (str bar-td-style bar-th-style "min-width: 60px;")}
                (-> cols second :display_name upper-case)]
              [:th {:style (str bar-td-style bar-th-style "width: 99%;")}]]]
          [:tbody
            (map-indexed #(render-bar-chart-row %1 %2 max-value) rows)]]))

(defn render-scalar
  [data]
  [:div {:style scalar-style} (-> data :rows first first format-number)])

(defn render-pulse-card
  [card data]
   [:div {:style (str section-style "margin: 16px;")}
    [:div {:style header-style} (:name card)]
    (cond
      (and (= (count (:cols data)) 1) (= (count (:rows data)) 1)) (render-scalar data)
      (and (= (count (:cols data)) 2)) (render-bar-chart data)
      :else [:div {:style "color: red;"} "Unable to render card"])])
