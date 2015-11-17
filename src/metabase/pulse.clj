(ns metabase.pulse
  (:require [hiccup.core :refer [html h]]
            [clj-time.core :as t]
            [clj-time.coerce :as c]
            [clj-time.format :as f]
            [clojure.tools.logging :as log]
            [clojure.pprint :refer [cl-format]]
            [clojure.string :refer [upper-case]]
            (metabase.models [setting :refer [defsetting] :as setting])
            [metabase.util :as u]))

;; NOTE: hiccup does not escape content by default so be sure to use "h" to escape any user-controlled content :-/

;;; ## CONFIG

(def ^:private card-width 400)

(def ^:private font-style "font-family: Lato, \"Helvetica Neue\", Helvetica, Arial, sans-serif;")
(def ^:private section-style font-style)
(def ^:private header-style  (str font-style "font-size: 16px; font-weight: 700; color: rgb(57,67,64); text-decoration: none;"))
(def ^:private scalar-style  (str font-style "font-size: 32px; font-weight: 400; color: rgb(45,134,212);"))
(def ^:private bar-th-style  (str font-style "font-size: 10px; font-weight: 400; color: rgb(57,67,64); border-bottom: 4px solid rgb(248, 248, 248); padding-top: 0px; padding-bottom: 10px;"))
(def ^:private bar-td-style  (str font-style "font-size: 16px; font-weight: 400; text-align: left; padding-right: 1em; padding-top: 8px;"))

(defn- format-number
  [n]
  (if (integer? n) (cl-format nil "~:d" n) (cl-format nil "~,2f" n)))

(defn- format-number-short
  [n]
  (cond
    (>= n 1000000000) (str (cl-format nil "~,1f" (/ n 1000000000.0)) "B")
    (>= n 1000000) (str (cl-format nil "~,1f" (/ n 1000000.0)) "M")
    (>= n 1000) (str (cl-format nil "~,1f" (/ n 1000.0)) "K")
    :else (str (cl-format nil "~,1f" n))))

(defn- format-timestamp
  [timestamp]
  (let [date (c/from-long timestamp)
        today (t/today-at 0 00)]
    (cond
      (t/within? (t/interval today (t/plus today (t/days 1))) date) "Today"
      (t/within? (t/interval (t/minus today (t/days 1)) today) date) "Yesterday"
      :else (f/unparse (f/formatter "MMM d, YYYY") date))))

(defn- format-cell
  [value]
  (cond
    (instance? java.util.Date value) (format-timestamp (.getTime value))
    (number? value) (format-number value)
    :else (str value)))

(defn render-table-row
  [index row bar-column max-value]
  [:tr {:style (if (odd? index) "color: rgb(189,193,191);" "color: rgb(124,131,129);")}
    [:td {:style bar-td-style} (-> row first format-cell h)]
    [:td {:style (str bar-td-style "font-weight: 700;")} (-> row second format-cell h)]
    (if bar-column [:td {:style (str bar-td-style "width: 99%;")}
      [:div {:style (str "background-color: rgb(135, 93, 175); height: 20px; width: " (float (* 100 (/ (bar-column row) max-value))) "%")} "&#160;"]])])

(defn render-table
  [{:keys [cols rows]} bar-column]
  (let [max-value (if bar-column (apply max (map bar-column rows)))
        truncated-rows (take 10 rows)]
    [:table {:style "border-collapse: collapse;"}
      [:thead
        [:tr
          [:th {:style (str bar-td-style bar-th-style "min-width: 60px;")}
            (-> cols first :display_name upper-case h)]
          [:th {:style (str bar-td-style bar-th-style "min-width: 60px;")}
            (-> cols second :display_name upper-case h)]
          (if bar-column [:th {:style (str bar-td-style bar-th-style "width: 99%;")}])]]
      [:tbody
        (map-indexed #(render-table-row %1 %2 bar-column max-value) truncated-rows)]]))

(defn render-bar-chart
  [data]
  [:div
    (render-table data second)])

(defn render-scalar
  [data]
  [:div {:style scalar-style}
    (-> data :rows first first format-cell h)])

(def ^:private sparkline-dot-radius 6)
(def ^:private sparkline-thickness 4)
(def ^:private sparkline-pad 10)

(defn render-sparkline-to-png
  "Takes two arrays of numbers between 0 and 1 and plots them as a sparkline"
  [xs ys width height]
  (let [os (new java.io.ByteArrayOutputStream)
        image (new java.awt.image.BufferedImage (+ width (* 2 sparkline-pad)) (+ height (* 2 sparkline-pad)) java.awt.image.BufferedImage/TYPE_INT_ARGB)
        g2 (.createGraphics image)
        xt (map #(+ sparkline-pad (* width %)) xs)
        yt (map #(+ sparkline-pad (- height (* height %))) ys)]
    (.setRenderingHints g2 (new java.awt.RenderingHints java.awt.RenderingHints/KEY_ANTIALIASING java.awt.RenderingHints/VALUE_ANTIALIAS_ON))
    (.setColor g2 (new java.awt.Color 45 134 212))
    (.setStroke g2 (new java.awt.BasicStroke sparkline-thickness java.awt.BasicStroke/CAP_ROUND java.awt.BasicStroke/JOIN_ROUND))
    (.drawPolyline g2 (int-array (count xt) xt) (int-array (count yt) yt) (count xt))
    (.fillOval g2 (- (last xt) sparkline-dot-radius) (- (last yt) sparkline-dot-radius) (* 2 sparkline-dot-radius) (* 2 sparkline-dot-radius))
    (.setColor g2 java.awt.Color/white)
    (.setStroke g2 (new java.awt.BasicStroke 2))
    (.drawOval g2 (- (last xt) sparkline-dot-radius) (- (last yt) sparkline-dot-radius) (* 2 sparkline-dot-radius) (* 2 sparkline-dot-radius))
    (javax.imageio.ImageIO/write image "png" os)
    (.toByteArray os)))

(defn render-sparkline
  [{:keys [rows cols] :as data} render-img]
  (let [xs (map #(-> % first .getTime) rows)
        xmin (apply min xs)
        xmax (apply max xs)
        xrange (- xmax xmin)
        xs' (map #(/ (- % xmin) xrange) xs)
        ys (map second rows)
        ymin (apply min ys)
        ymax (apply max ys)
        yrange (- ymax ymin)
        ys' (map #(/ (- % ymin) yrange) ys)]
    [:div
      [:div {:style "color: rgb(214,214,214);" }
        [:div {:style "display: inline-block; position: relative; margin-left: 30px;" }
          [:div {:style "position: relative;"}
            [:div {:style "position: absolute; height: 100%; text-align: right; background-color: red;"}
              [:div {:style "position: absolute; top: 0; right: 0;"} (format-number-short ymax)]
              [:div {:style "position: absolute; top: 150px; right: 0;"} (format-number-short ymin)]]
            [:img {:style "display: block; left: 20px;" :src (render-img (render-sparkline-to-png xs' ys' 285 150))}]
          ]
          [:div
            [:div {:style "height: 15px; margin-left: 10px; margin-right: 10px; border: 4px solid rgb(233,233,233); border-top: none; border-bottom: none;"} "&#160;"]
            [:div {:style "height: 15px; margin-left: 10px; margin-right: 10px;"}
              [:div {:style "float: left;"} (format-timestamp xmin)]
              [:div {:style "float: right;"} (format-timestamp xmax)]]
          ]]]
      [:div {:style "margin-top: 20px; margin-left: 30px;"}
        (render-table {:cols cols :rows [(last rows) (first rows)]} nil)]]))

(defn datetime-field?
  [field]
  (or (contains? #{:DateTimeField :TimeField :DateField} (:base_type field))
      (contains? #{:timestamp_seconds :timestamp_milliseconds} (:special_type field))))

(defn number-field?
  [field]
  (or (contains? #{:IntegerField :DecimalField :FloatField :BigIntegerField} (:base_type field))
      (contains? #{:number} (:special_type field))))

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
      (and (= col-count 1) (= row-count 1))                               :scalar
      (and (= col-count 2) (datetime-field? col-1) (number-field? col-2)) :sparkline
      (and (= col-count 2) (number-field? col-2))                         :bar
      :else                                                               :table)))

(defn render-pulse-card
  [card data include-title render-img]
  (try
    [:div {:style (str section-style "margin: 16px;")}
      (if include-title [:div {:style "margin-bottom: 16px;"}
        [:a {:style header-style :href (h (str (setting/get :-site-url) "/card/" (:id card) "?clone"))}
          (-> card :name h)]])
      (case (detect-pulse-card-type card data)
        :scalar    (render-scalar data)
        :sparkline (render-sparkline data render-img)
        :bar       (render-bar-chart data)
        :table     (render-table data nil)
        [:div {:style (str font-style "color: #F9D45C; font-weight: 700;")}
          "We were unable to display this card." [:br] "Please view this card in Metabase."])]
  (catch Throwable e
    [:div {:style (str font-style "color: #EF8C8C; font-weight: 700;")} "An error occurred while displaying this card."])))

(defn render-img-data-uri
  "Takes a PNG byte array and returns a Base64 encoded URI"
  [bytes]
  (str "data:image/png;base64," (new String (org.fit.cssbox.misc.Base64Coder/encode bytes))))

(defn- render-pulse-section
  [render-img {:keys [card result]}]
  [:div {:style "margin-top: 10px; margin-bottom: 20px;"}
    (render-pulse-card card (:data result) true render-img)])

;; HACK: temporary workaround to postal requiring a file as the attachment
(defn- write-byte-array-to-temp-file
  [bytes]
  (let [file (java.io.File/createTempFile "metabase_pulse_image_" ".png")
        fos (new java.io.FileOutputStream file)]
    (.deleteOnExit file)
    (.write fos bytes)
    (.close fos)
    file))

(defn render-pulse-email
  "Take a pulse object and list of results, returns an array of attachment objects for an email"
  [pulse results]
  (let [images (atom [])
        render-img (fn [bytes] (reset! images (conj @images bytes)) (str "cid:IMAGE_" (-> @images count dec)))
        header [:h1 {:style (str section-style "margin: 16px; color: rgb(57,67,64);")} (-> pulse :name h)]
        body (apply vector :div (mapv (partial render-pulse-section render-img) results))
        content (html [:html [:body [:div header body]]])]
    (apply vector {:type "text/html" :content content}
                  (map-indexed (fn [idx bytes] {:type :inline
                                                :content-id (str "IMAGE_" idx)
                                                :content-type "image/png"
                                                :content (write-byte-array-to-temp-file bytes)})
                               @images))))

; ported from https://github.com/radkovo/CSSBox/blob/cssbox-4.10/src/main/java/org/fit/cssbox/demo/ImageRenderer.java
(defn render-to-png
  [html, os]
  (let [is (new java.io.ByteArrayInputStream (.getBytes html java.nio.charset.StandardCharsets/UTF_8))
        docSource (new org.fit.cssbox.io.StreamDocumentSource is nil "text/html")
        parser (new org.fit.cssbox.io.DefaultDOMSource docSource)
        doc (-> parser .parse)
        windowSize (new java.awt.Dimension card-width 1)
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

(defn render-pulse-card-to-png
  [card data include-title]
  (let [html (html [:html [:body {:style "margin: 0; background-color: white;"} (render-pulse-card card data include-title render-img-data-uri)]])
        os (new java.io.ByteArrayOutputStream)]
    (render-to-png html os)
    (.toByteArray os)))
