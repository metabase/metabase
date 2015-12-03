(ns metabase.pulse
  (:require [hiccup.core :refer [html h]]
            [clj-time.core :as t]
            [clj-time.coerce :as c]
            [clj-time.format :as f]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [clojure.pprint :refer [cl-format]]
            [clojure.string :refer [upper-case]]
            [metabase.models.setting :as setting]))

;; NOTE: hiccup does not escape content by default so be sure to use "h" to escape any user-controlled content :-/

;;; ## CONFIG

(def ^:const card-width 400)
(def ^:const rows-limit 10)
(def ^:const cols-limit 3)
(def ^:const sparkline-dot-radius 6)
(def ^:const sparkline-thickness 3)
(def ^:const sparkline-pad 8)

;;; ## STYLES

(def ^:const color-brand  "rgb(45,134,212)")
(def ^:const color-purple "rgb(135,93,175)")
(def ^:const color-grey-1 "rgb(248,248,248)")
(def ^:const color-grey-2 "rgb(189,193,191)")
(def ^:const color-grey-3 "rgb(124,131,129)")
(def ^:const color-grey-4 "rgb(57,67,64)")

(def ^:const font-style    "font-family: Lato, \"Helvetica Neue\", Helvetica, Arial, sans-serif;")
(def ^:const section-style (str font-style))
(def ^:const header-style  (str font-style "font-size: 16px; font-weight: 700; color: " color-grey-4 "; text-decoration: none;"))
(def ^:const scalar-style  (str font-style "font-size: 24px; font-weight: 700; color: " color-brand ";"))
(def ^:const bar-th-style  (str font-style "font-size: 10px; font-weight: 400; color: " color-grey-4 "; border-bottom: 4px solid " color-grey-1 "; padding-top: 0px; padding-bottom: 10px;"))
(def ^:const bar-td-style  (str font-style "font-size: 16px; font-weight: 400; text-align: left; padding-right: 1em; padding-top: 8px;"))
(def ^:const button-style  (str font-style "display: inline-block; box-sizing: border-box; padding: 8px; color: " color-brand "; border: 1px solid " color-brand "; border-radius: 4px; text-decoration: none; "))

;;; ## HELPER FNS

(defn datetime-field?
  [field]
  (or (contains? #{:DateTimeField :TimeField :DateField} (:base_type field))
      (contains? #{:timestamp_seconds :timestamp_milliseconds} (:special_type field))))

(defn number-field?
  [field]
  (or (contains? #{:IntegerField :DecimalField :FloatField :BigIntegerField} (:base_type field))
      (contains? #{:number} (:special_type field))))

;;; ## FORMATTING

(defn- format-number
  [n]
  (if (integer? n) (cl-format nil "~:d" n) (cl-format nil "~,2f" n)))

(defn- format-timestamp
  "Formats timestamps with human friendly absolute dates based on the column :unit"
  [timestamp col]
  (case (:unit col)
    :hour (f/unparse (f/formatter "h a - MMM YYYY") (c/from-long timestamp))
    :week (str "Week " (f/unparse (f/formatter "w - YYYY") (c/from-long timestamp)))
    :month (f/unparse (f/formatter "MMMM YYYY") (c/from-long timestamp))
    :quarter (str "Q" (+ 1 (int (/ (t/month (c/from-long timestamp)) 3))) " - " (t/year (c/from-long timestamp)))
    :year (str timestamp)
    :hour-of-day (str timestamp) ; TODO: probably shouldn't even be showing sparkline for x-of-y groupings?
    :day-of-week (str timestamp)
    :week-of-year (str timestamp)
    :month-of-year (str timestamp)
    (f/unparse (f/formatter "MMM d, YYYY") (c/from-long timestamp))))

(defn- format-timestamp-relative
  "Formats timestamps with relative names (today, yesterday, this *, last *) based on column :unit, if possible, otherwie returns nil"
  [timestamp col]
  (case (:unit col)
    :day      (let [date    (c/from-long timestamp)
                    d-start (t/date-midnight (t/year (t/now)) (t/month (t/now)) (t/day (t/now)))]
                (cond (t/within? (t/interval d-start (t/plus d-start (t/days 1))) date) "Today"
                      (t/within? (t/interval (t/minus d-start (t/days 1)) d-start) date) "Yesterday"))
    :week     (let [date    (c/from-long timestamp)
                    w-start (-> (new org.joda.time.LocalDate) .weekOfWeekyear .roundFloorCopy .toDateTimeAtStartOfDay)]
                (cond (t/within? (t/interval w-start (t/plus w-start (t/weeks 1))) date) "This week"
                      (t/within? (t/interval (t/minus w-start (t/weeks 1)) w-start) date) "Last week"))
    :month    (let [date    (c/from-long timestamp)
                    m-start  (t/date-midnight (t/year (t/now)) (t/month (t/now)))]
                (cond (t/within? (t/interval m-start (t/plus m-start (t/months 1))) date) "This month"
                      (t/within? (t/interval (t/minus m-start (t/months 1)) m-start) date) "Last month"))
    :quarter  (let [date    (c/from-long timestamp)
                    q-start (t/date-midnight (t/year (t/now)) (+ 1 (* 3 (Math/floor (/ (- (t/month (t/now)) 1) 3)))))]
                (cond (t/within? (t/interval q-start (t/plus q-start (t/months 3))) date) "This quarter"
                      (t/within? (t/interval (t/minus q-start (t/months 3)) q-start) date) "Last quarter"))
    :year     (let [date    (t/date-midnight timestamp)
                    y-start (t/date-midnight (t/year (t/now)))]
                (cond (t/within? (t/interval y-start (t/plus y-start (t/years 1))) date) "This year"
                      (t/within? (t/interval (t/minus y-start (t/years 1)) y-start) date) "Last year"))
    nil))

(defn format-timestamp-pair
  "Formats a pair of timestamps, using relative formatting for the first timestamps if possible and 'Previous :unit' for the second, otherwise absolute timestamps for both"
  [[a b] col]
  (if-let [a' (format-timestamp-relative a col)]
    [a' (str "Previous " (-> col :unit name))]
    [(format-timestamp a col) (format-timestamp b col)]))

(defn- format-cell
  [value col]
  (cond
    (instance? java.util.Date value) (format-timestamp (.getTime value) col)
    (and (number? value) (not (datetime-field? col))) (format-number value)
    :else (str value)))

;;; ## RENDERING

(defn card-href
  [card]
  (h (str (setting/get :-site-url) "/card/" (:id card) "?clone")))

; ported from https://github.com/radkovo/CSSBox/blob/cssbox-4.10/src/main/java/org/fit/cssbox/demo/ImageRenderer.java
(defn render-to-png
  [html, os, width]
  (let [is (new java.io.ByteArrayInputStream (.getBytes html java.nio.charset.StandardCharsets/UTF_8))
        docSource (new org.fit.cssbox.io.StreamDocumentSource is nil "text/html")
        parser (new org.fit.cssbox.io.DefaultDOMSource docSource)
        doc (-> parser .parse)
        windowSize (new java.awt.Dimension width 1)
        media (new cz.vutbr.web.css.MediaSpec "screen")]
    (.setDimensions media (.width windowSize) (.height windowSize))
    (.setDeviceDimensions media (.width windowSize) (.height windowSize))
    (let [da (new org.fit.cssbox.css.DOMAnalyzer doc (.getURL docSource))]
      (.setMediaSpec da media)
      (.attributesToStyles da)
      (.addStyleSheet da nil (org.fit.cssbox.css.CSSNorm/stdStyleSheet) org.fit.cssbox.css.DOMAnalyzer$Origin/AGENT)
      (.addStyleSheet da nil (org.fit.cssbox.css.CSSNorm/userStyleSheet) org.fit.cssbox.css.DOMAnalyzer$Origin/AGENT)
      (.addStyleSheet da nil (org.fit.cssbox.css.CSSNorm/formsStyleSheet) org.fit.cssbox.css.DOMAnalyzer$Origin/AGENT)
      (.getStyleSheets da)
      (let [contentCanvas (new org.fit.cssbox.layout.BrowserCanvas (.getRoot da) da (.getURL docSource))]
        (-> contentCanvas (.setAutoMediaUpdate false))
        (-> contentCanvas (.setAutoSizeUpdate true))
        (-> contentCanvas .getConfig (.setClipViewport false))
        (-> contentCanvas .getConfig (.setLoadImages true))
        (-> contentCanvas .getConfig (.setLoadBackgroundImages true))
        (-> contentCanvas (.createLayout windowSize))
        (javax.imageio.ImageIO/write (.getImage contentCanvas) "png" os)))))

(defn render-html-to-png
  [html-body width]
  (let [html (html [:html [:body {:style "margin: 0; padding: 0; background-color: white;"} html-body]])
        os (new java.io.ByteArrayOutputStream)]
    (render-to-png html os width)
    (.toByteArray os)))

(defn render-img-data-uri
  "Takes a PNG byte array and returns a Base64 encoded URI"
  [img-bytes]
  (str "data:image/png;base64," (new String (org.fit.cssbox.misc.Base64Coder/encode img-bytes))))

(defn render-button
  [text href icon render-img]
  [:a {:style button-style :href href}
    [:span (h text)]
    (if icon [:img {:style "margin-left: 4px; width: 16px;"
                    :width 16
                    :src (-> (str "frontend_client/app/img/" icon "@2x.png") io/resource io/input-stream org.apache.commons.io.IOUtils/toByteArray render-img)}])])


(defn render-table
  [card rows cols render-img include-buttons col-indexes bar-column]
  (let [max-value (if bar-column (apply max (map bar-column rows)))]
    [:table {:style (str "padding-bottom: 8px; border-bottom: 4px solid " color-grey-1 ";")}
      [:thead
        [:tr
          (for [col-idx col-indexes :let [col (-> cols (nth col-idx))]]
            [:th {:style (str bar-td-style bar-th-style "min-width: 60px;")}
              (h (upper-case (name (or (:display_name col) (:name col)))))])
          (if bar-column
            [:th {:style (str bar-td-style bar-th-style "width: 99%;")}])]]
      [:tbody
        (map-indexed (fn [row-idx row]
          [:tr {:style (str "color: " (if (odd? row-idx) color-grey-2 color-grey-3) ";")}
            (for [col-idx col-indexes :let [col (-> cols (nth col-idx))]]
              [:td {:style (str bar-td-style (if (and bar-column (= col-idx 1)) "font-weight: 700;"))}
                (-> row (nth col-idx) (format-cell col) h)])
            (if bar-column
              [:td {:style (str bar-td-style "width: 99%;")}
                [:div {:style (str "background-color: " color-purple "; max-height: 10px; height: 10px; border-radius: 2px; width: " (float (* 100 (/ (bar-column row) max-value))) "%")} "&#160;"]])])
          rows)]]))

(defn render-truncation-warning
  [card {:keys [cols rows] :as data} render-img include-buttons rows-limit cols-limit]
  (if (or (> (count rows) rows-limit)
          (> (count cols) cols-limit))
    [:div {:style "padding-top: 16px;"}
      (if (> (count rows) rows-limit)
        [:div {:style (str "color: " color-grey-2 "; padding-bottom: 10px;")}
          "Showing " [:strong {:style (str "color: " color-grey-3 ";")} (format-number rows-limit)]
          " of "     [:strong {:style (str "color: " color-grey-3 ";")} (format-number (count rows))]
          " rows."])
      (if (> (count cols) cols-limit)
        [:div {:style (str "color: " color-grey-2 "; padding-bottom: 10px;")}
          "Showing " [:strong {:style (str "color: " color-grey-3 ";")} (format-number cols-limit)]
          " of "     [:strong {:style (str "color: " color-grey-3 ";")} (format-number (count cols))]
          " columns."])]))

(defn render-card-table
  [card {:keys [cols rows] :as data} render-img include-buttons]
  (let [truncated-rows (take rows-limit rows)
        truncated-cols (take cols-limit cols)
        col-indexes (map-indexed (fn [i _] i) truncated-cols)]
    [:div
      (render-table card truncated-rows truncated-cols render-img include-buttons col-indexes nil)
      (render-truncation-warning card data render-img include-buttons rows-limit cols-limit)]))

(defn render-card-bar
  [card {:keys [cols rows] :as data} render-img include-buttons]
  (let [truncated-rows (take rows-limit rows)]
    [:div
      (render-table card truncated-rows cols render-img include-buttons [0 1] second)
      (render-truncation-warning card data render-img include-buttons rows-limit 2)]))

(defn render-card-scalar
  [card {:keys [cols rows] :as data} render-img include-buttons]
  [:div {:style scalar-style}
    (-> rows first first (format-cell (first cols)) h)])

(defn render-sparkline-to-png
  "Takes two arrays of numbers between 0 and 1 and plots them as a sparkline"
  [xs ys width height]
  (let [os (new java.io.ByteArrayOutputStream)
        image (new java.awt.image.BufferedImage (+ width (* 2 sparkline-pad)) (+ height (* 2 sparkline-pad)) java.awt.image.BufferedImage/TYPE_INT_ARGB)
        g2 (.createGraphics image)
        xt (map #(+ sparkline-pad (* width %)) xs)
        yt (map #(+ sparkline-pad (- height (* height %))) ys)]
    (.setRenderingHints g2 (new java.awt.RenderingHints java.awt.RenderingHints/KEY_ANTIALIASING java.awt.RenderingHints/VALUE_ANTIALIAS_ON))
    (.setColor g2 (new java.awt.Color 211 227 241))
    (.setStroke g2 (new java.awt.BasicStroke sparkline-thickness java.awt.BasicStroke/CAP_ROUND java.awt.BasicStroke/JOIN_ROUND))
    (.drawPolyline g2 (int-array (count xt) xt) (int-array (count yt) yt) (count xt))
    (.setColor g2 (new java.awt.Color 45 134 212))
    (.fillOval g2 (- (last xt) sparkline-dot-radius) (- (last yt) sparkline-dot-radius) (* 2 sparkline-dot-radius) (* 2 sparkline-dot-radius))
    (.setColor g2 java.awt.Color/white)
    (.setStroke g2 (new java.awt.BasicStroke 2))
    (.drawOval g2 (- (last xt) sparkline-dot-radius) (- (last yt) sparkline-dot-radius) (* 2 sparkline-dot-radius) (* 2 sparkline-dot-radius))
    (javax.imageio.ImageIO/write image "png" os)
    (.toByteArray os)))

(defn render-card-sparkline
  [card {:keys [rows cols] :as data} render-img include-buttons]
  (let [xs (for [row rows :let [x (first row)]] (if (instance? java.util.Date x) (.getTime x) x))
        xmin (apply min xs)
        xmax (apply max xs)
        xrange (- xmax xmin)
        xs' (map #(/ (- % xmin) xrange) xs)
        ys (map second rows)
        ymin (apply min ys)
        ymax (apply max ys)
        yrange (max 1 (- ymax ymin)) ; `(max 1 ...)` so we don't divide by zero
        ys' (map #(/ (- % ymin) yrange) ys)
        rows' (->> rows (take-last 2) (reverse))
        values (map #(format-number (second %)) rows')
        labels (format-timestamp-pair (map first rows') (first cols))]
  [:div
    [:img {:style "display: block; width: 100%;" :src (render-img (render-sparkline-to-png xs' ys' 524 130))}]
    [:table
      [:tr
        [:td {:style (str "color: " color-brand "; font-size: 24px; font-weight: 700; padding-right: 16px;")} (first values)]
        [:td {:style (str "color: " color-grey-3 "; font-size: 24px; font-weight: 700;")} (second values)]]
      [:tr
        [:td {:style (str "color: " color-brand "; font-size: 16px; font-weight: 700; padding-right: 16px;")} (first labels)]
        [:td {:style (str "color: " color-grey-3 "; font-size: 16px;")} (second labels)]]]]))

(defn render-card-empty
  [card {:keys [rows cols] :as data} render-img include-buttons]
  [:div {:style "text-align: center;"}
    [:img {:style "width: 104px;"
             :src (-> (str "frontend_client/app/img/pulse_no_results@2x.png") io/resource io/input-stream org.apache.commons.io.IOUtils/toByteArray render-img)}]
    [:div {:style (str "margin-top: 8px; color: " color-grey-4 ";")} "No results"]])

(defn detect-pulse-card-type
  [card data]
  (let [col-count (-> data :cols count)
        row-count (-> data :rows count)
        col-1 (-> data :cols first)
        col-2 (-> data :cols second)
        aggregation (-> card :dataset_query :query :aggregation first)]
    (cond
      (or (= aggregation :rows)
          (contains? #{:pin_map :state :country} (:display card)))        nil
      (= row-count 0)                                                     :empty
      (and (= col-count 1) (= row-count 1))                               :scalar
      (and (= col-count 2) (datetime-field? col-1) (number-field? col-2)) :sparkline
      (and (= col-count 2) (number-field? col-2))                         :bar
      :else                                                               :table)))

(defn render-pulse-card
  [card data render-img include-title include-buttons]
  (try
    [:a {:href (card-href card)
         :target "_blank"
         :style (str section-style "margin: 16px; margin-bottom: 16px; display: block; text-decoration: none;")}
      (if include-title
          [:table {:style "margin-bottom: 8px; width: 100%;"}
            [:tbody
              [:tr
                [:td [:span {:style header-style} (-> card :name h)]]
                [:td {:style "text-align: right;"}
                  (if include-buttons [:img {:style "width: 16px;"
                                             :width 16
                                             :src (-> (str "frontend_client/app/img/external_link.png") io/resource io/input-stream org.apache.commons.io.IOUtils/toByteArray render-img)}])]]]])
      (case (detect-pulse-card-type card data)
        :empty     (render-card-empty     card data render-img include-buttons)
        :scalar    (render-card-scalar    card data render-img include-buttons)
        :sparkline (render-card-sparkline card data render-img include-buttons)
        :bar       (render-card-bar       card data render-img include-buttons)
        :table     (render-card-table     card data render-img include-buttons)
        [:div {:style (str font-style "color: #F9D45C; font-weight: 700;")}
          "We were unable to display this card." [:br] "Please view this card in Metabase."])]
  (catch Throwable e
    (log/warn (str "Pulse card render error:" e))
    [:div {:style (str font-style "color: #EF8C8C; font-weight: 700;")} "An error occurred while displaying this card."])))


(defn render-pulse-section
  [render-img include-buttons {:keys [card result]}]
  [:div {:style (str "margin-top: 10px; margin-bottom: 20px; border: 1px solid #dddddd; border-radius: 2px; background-color: white; box-shadow: 0 1px 2px rgba(0, 0, 0, .08);")}
    (render-pulse-card card (:data result) render-img true include-buttons)])

(defn render-pulse-card-to-png
  [card data include-title]
  (render-html-to-png (render-pulse-card card data render-img-data-uri include-title false) card-width))
