(ns metabase.api.pulse
  "/api/pulse endpoints."
  (:require [korma.core :refer [where subselect fields order limit]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [hiccup.core :refer [html]]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.driver :as driver]
            (metabase.models [card :refer [Card]]
                             [database :refer [Database]]
                             [hydrate :refer :all]
                             [pulse :refer [Pulse] :as pulse]
                             [pulse-channel :refer [channel-types]])
            [metabase.util :as util]
            [metabase.pulse :as p]))


(defendpoint GET "/"
  "Fetch all `Pulses`"
  []
  (pulse/retrieve-pulses))


(defendpoint POST "/"
  "Create a new `Pulse`."
  [:as {{:keys [name cards channels] :as body} :body}]
  {name     [Required NonEmptyString]
   cards    [Required ArrayOfMaps]
   channels [Required ArrayOfMaps]}
  (->500 (pulse/create-pulse name *current-user-id* (filter identity (map :id cards)) channels)))


(defendpoint GET "/:id"
  "Fetch `Pulse` with ID."
  [id]
  (->404 (pulse/retrieve-pulse id)))


(defendpoint PUT "/:id"
  "Update a `Pulse` with ID."
  [id :as {{:keys [name cards channels] :as body} :body}]
  {name     [Required NonEmptyString]
   cards    [Required ArrayOfMaps]
   channels [Required ArrayOfMaps]}
  (check-404 (db/exists? Pulse :id id))
  (pulse/update-pulse {:id       id
                       :name     name
                       :cards    (filter identity (map :id cards))
                       :channels channels})
  (pulse/retrieve-pulse id))


(defendpoint DELETE "/:id"
  "Delete a `Pulse`."
  [id]
  (db/cascade-delete Pulse :id id))


(defendpoint GET "/form_input"
  ""
  []
  {:channel_types channel-types})


(defendpoint GET "/preview_card/:id"
  "Get HTML rendering of a `Card` with ID."
  [id]
  (let [card (Card id)]
        (read-check Database (:database (:dataset_query card)))
        (let [data (:data (driver/dataset-query (:dataset_query card) {:executed_by *current-user-id*}))]
              {:status 200 :body (html [:html [:body {:style "margin: 0;"} (p/render-pulse-card card data)]])})))

(def ^:private card-width 400)

(defn parse-dom
  [stream]
  (let [dbf (javax.xml.parsers.DocumentBuilderFactory/newInstance)]
    (.setNamespaceAware dbf true)
    (.setFeature dbf "http://apache.org/xml/features/nonvalidating/load-external-dtd" false)
    (.parse (.newDocumentBuilder dbf) stream)))

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

; ported from https://github.com/radkovo/CSSBox/blob/cssbox-4.10/src/main/java/org/fit/cssbox/demo/ImageRenderer.java
(defn render-to-png-cssbox
  [html, os]
  (let [is (new java.io.ByteArrayInputStream (.getBytes html java.nio.charset.StandardCharsets/UTF_8))
    docSource (new org.fit.cssbox.io.StreamDocumentSource is nil "text/html")
    parser (new org.fit.cssbox.io.DefaultDOMSource docSource)
    doc (-> parser .parse)
    media (new cz.vutbr.web.css.MediaSpec "screen")
    windowSize (new java.awt.Dimension card-width 600)]
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
        (-> contentCanvas .getConfig (.setClipViewport false))
        (-> contentCanvas .getConfig (.setLoadImages true))
        (-> contentCanvas .getConfig (.setLoadBackgroundImages true))
        (-> contentCanvas (.createLayout windowSize))
        (javax.imageio.ImageIO/write (.getImage contentCanvas) "png" os)))))

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

(defendpoint GET "/preview_card_png/:id"
  "Get PNG rendering of a `Card` with ID."
  [id]
  (let [card (Card id)]
        (read-check Database (:database (:dataset_query card)))
        (let [data (:data (driver/dataset-query (:dataset_query card) {:executed_by *current-user-id*}))
              html (html [:html [:body {:style "margin: 0; background-color: white;"} (p/render-pulse-card card data)]])
              os (new java.io.ByteArrayOutputStream)]
              (render-to-png-cssbox html os)
              {:status 200 :headers {"Content-Type" "image/png"} :body (new java.io.ByteArrayInputStream (.toByteArray os)) })))

(define-routes)
