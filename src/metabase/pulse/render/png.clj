(ns metabase.pulse.render.png
  "Logic for rendering HTML to a PNG.

  Ported by @tlrobinson from
  https://github.com/radkovo/CSSBox/blob/cssbox-4.10/src/main/java/org/fit/cssbox/demo/ImageRenderer.java with
  subsequent code simplification and cleanup by @camsaul

  CSSBox JavaDoc is here: http://cssbox.sourceforge.net/api/index.html"
  (:require [clojure.tools.logging :as log]
            [hiccup.core :refer [html]]
            [metabase.pulse.render
             [common :as common]
             [style :as style]]
            [schema.core :as s])
  (:import cz.vutbr.web.css.MediaSpec
           java.awt.Dimension
           java.awt.image.BufferedImage
           [java.io ByteArrayInputStream ByteArrayOutputStream]
           java.nio.charset.StandardCharsets
           javax.imageio.ImageIO
           [org.fit.cssbox.css CSSNorm DOMAnalyzer DOMAnalyzer$Origin]
           [org.fit.cssbox.io DefaultDOMSource StreamDocumentSource]
           org.fit.cssbox.layout.BrowserCanvas
           org.w3c.dom.Document))

(defn- write-image!
  [^BufferedImage image, ^String format-name, ^ByteArrayOutputStream output-stream]
  (try
    (ImageIO/write image format-name output-stream)
    (catch javax.imageio.IIOException iioex
      (log/error iioex "Error writing image to output stream")
      (throw iioex))))

(defn- dom-analyzer
  ^DOMAnalyzer [^Document doc, ^StreamDocumentSource doc-source, ^Dimension window-size]
  (doto (DOMAnalyzer. doc (.getURL doc-source))
    (.setMediaSpec (doto (MediaSpec. "screen")
                     (.setDimensions       (.width window-size) (.height window-size))
                     (.setDeviceDimensions (.width window-size) (.height window-size))))
    .attributesToStyles
    (.addStyleSheet nil (CSSNorm/stdStyleSheet)   DOMAnalyzer$Origin/AGENT)
    (.addStyleSheet nil (CSSNorm/userStyleSheet)  DOMAnalyzer$Origin/AGENT)
    (.addStyleSheet nil (CSSNorm/formsStyleSheet) DOMAnalyzer$Origin/AGENT)
    .getStyleSheets))

(defn- content-canvas
  ^BrowserCanvas [^Document doc, ^StreamDocumentSource doc-source, width]
  (let [window-size (Dimension. width 1)
        da          (dom-analyzer doc doc-source window-size)
        canvas      (doto (BrowserCanvas. (.getRoot da) da (.getURL doc-source))
                      (.setAutoMediaUpdate false)
                      (.setAutoSizeUpdate true))]
    (doto (.getConfig canvas)
      (.setClipViewport false)
      (.setLoadImages true)
      (.setLoadBackgroundImages true))
    (doto canvas
      (.createLayout window-size))))

(defn- render-to-png!
  [^String html, ^ByteArrayOutputStream os, width]
  (with-open [is (ByteArrayInputStream. (.getBytes html StandardCharsets/UTF_8))]
    (let [doc-source     (StreamDocumentSource. is nil "text/html; charset=utf-8")
          doc            (.parse (DefaultDOMSource. doc-source))
          content-canvas (content-canvas doc doc-source width)]
      (write-image! (.getImage content-canvas) "png" os))))

(s/defn render-html-to-png :- bytes
  "Render the Hiccup HTML `content` of a Pulse to a PNG image, returning a byte array."
  [{:keys [content]} :- common/RenderedPulseCard
   width]
  (let [html (html [:html [:body {:style (style/style
                                          {:margin           0
                                           :padding          0
                                           :background-color :white})}
                           content]])]
    (with-open [os (ByteArrayOutputStream.)]
      (render-to-png! html os width)
      (.toByteArray os))))
