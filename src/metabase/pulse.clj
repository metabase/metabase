(ns metabase.pulse
  (:require [hiccup.core :refer [html]]
            [clojure.tools.logging :as log]
            [clojure.pprint :refer [cl-format]]
            [clojure.string :refer [upper-case]]
            (metabase.models [setting :refer [defsetting] :as setting])))

;;; ## CONFIG

(defsetting slack-token "Slack API bearer token obtained from https://api.slack.com/web#authentication")


(def ^:private card-width 400)

(defn parse-dom
  [stream]
  (let [dbf (javax.xml.parsers.DocumentBuilderFactory/newInstance)]
    (.setNamespaceAware dbf true)
    (.setFeature dbf "http://apache.org/xml/features/nonvalidating/load-external-dtd" false)
    (.parse (.newDocumentBuilder dbf) stream)))

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

; ported from https://stackoverflow.com/questions/17061682/java-html-rendering-engine
(defn render-to-png-swing
  [html os]
  (let [image (-> (java.awt.GraphicsEnvironment/getLocalGraphicsEnvironment)
              .getDefaultScreenDevice
              .getDefaultConfiguration
              (.createCompatibleImage card-width 600))
        graphics (.createGraphics image)
        jep (new javax.swing.JEditorPane "text/html" html)]
    (.setSize jep card-width 600)
    (.print jep graphics)
    (javax.imageio.ImageIO/write image "png" os)))

; ported from http://grepcode.com/file/repo1.maven.org/maven2/org.xhtmlrenderer/core-renderer/R8pre2/org/xhtmlrenderer/simple/Graphics2DRenderer.java
(defn render-to-png-flying-saucer
  [html os]
  (let [is (new java.io.ByteArrayInputStream (.getBytes html java.nio.charset.StandardCharsets/UTF_8))
        dom (parse-dom is)
        renderer (new org.xhtmlrenderer.simple.Graphics2DRenderer)
        rect (new java.awt.Dimension card-width 600)
        buff (new java.awt.image.BufferedImage (.getWidth rect) (.getHeight rect) java.awt.image.BufferedImage/TYPE_INT_ARGB)
        g (.getGraphics buff)]
    (.setDocument renderer dom nil)
    (.layout renderer g rect)
    (.dispose g)
    (let [rect (.getMinimumSize renderer)
          buff (new java.awt.image.BufferedImage (.getWidth rect) (.getHeight rect) java.awt.image.BufferedImage/TYPE_INT_ARGB)
          g (.getGraphics buff)]
      (.render renderer g)
      (.dispose g)
      (javax.imageio.ImageIO/write buff "png" os))))


(def ^:private font-style "font-family: Lato, \"Helvetica Neue\", Helvetica, Arial, sans-serif;")
(def ^:private section-style font-style)
(def ^:private header-style  (str font-style "font-size: 16px; font-weight: 700; color: rgb(57,67,64); text-decoration: none;"))
(def ^:private scalar-style  (str font-style "font-size: 32px; font-weight: 400; color: rgb(45,134,212);"))
(def ^:private bar-th-style  (str font-style "font-size: 10px; font-weight: 400; color: rgb(57,67,64); border-bottom: 4px solid rgb(248, 248, 248); padding-top: 0px; padding-bottom: 10px;"))
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
  [card data include-title]
  [:div {:style (str section-style "margin: 16px;")}
    (if include-title [:div {:style "margin-bottom: 16px;"}
      [:a {:style header-style :href (str (setting/get :-site-url) "/card/" (:id card) "?clone")} (:name card)]] nil)
    (cond
      (and (= (count (:cols data)) 1) (= (count (:rows data)) 1)) (render-scalar data)
      (and (= (count (:cols data)) 2)) (render-bar-chart data)
      :else [:div {:style "color: red;"} "Unable to render card"])])

(defn- render-pulse-section
  [{:keys [card result]}]
  [:div {:style "margin-top: 10px; margin-bottom: 20px;"}
    (render-pulse-card card (:data result) true)])

(defn render-pulse
  [pulse results]
  [:div
    [:h1 {:style (str section-style "margin: 16px; color: rgb(57,67,64);")} (:name pulse)]
    (apply vector :div (mapv render-pulse-section results))])

(defn render-pulse-card-to-png
  [card data include-title]
  (let [html (html [:html [:body {:style "margin: 0; background-color: white;"} (render-pulse-card card data include-title)]])
        os (new java.io.ByteArrayOutputStream)]
    (render-to-png html os)
    (.toByteArray os)))
