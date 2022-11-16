(ns metabase.query-processor.streaming.png
  (:require [clojure.java.io :as io]
            [clojure.java.shell :as sh]
            [hiccup.core :as hiccup]
            [java-time :as t]
            [metabase.pulse.render.common :as common]
            [metabase.pulse.render.style :as style]
            [metabase.models.card :as card]
            [metabase.models.user :as user]
            [metabase.pulse :as pulse]
            [metabase.pulse.render :as render]
            [metabase.pulse.render.png :as render.png]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [metabase.query-processor.streaming.interface :as qp.si]
            [metabase.util.date-2 :as u.date]
            [toucan.db :as db])
  (:import cz.vutbr.web.css.MediaSpec
           [java.awt Graphics2D RenderingHints]
           java.awt.image.BufferedImage
           [java.io ByteArrayInputStream ByteArrayOutputStream
            BufferedWriter OutputStream OutputStreamWriter]
           java.nio.charset.StandardCharsets
           javax.imageio.ImageIO
           org.fit.cssbox.awt.GraphicsEngine
           [org.fit.cssbox.css CSSNorm DOMAnalyzer DOMAnalyzer$Origin]
           [org.fit.cssbox.io DefaultDOMSource StreamDocumentSource]
           org.fit.cssbox.layout.Dimension
           org.w3c.dom.Document))

(defn render-card-to-png
  "Given a card ID, renders the card to a png. Be aware that the png rendered on a dev machine may not
  match what's rendered on another system, like a docker container."
  [card-id]
  (let [{:keys [dataset_query] :as card} (db/select-one card/Card :id card-id)
        user                             (db/select-one user/User)
        query-results                    (binding [qp.perms/*card-id* nil]
                                           (qp/process-query-and-save-execution!
                                            (-> dataset_query
                                                (assoc :async? false)
                                                (assoc-in [:middleware :process-viz-settings?] true))
                                            {:executed-by (:id user)
                                             :context     :pulse
                                             :card-id     card-id}))
        png-bytes                        (render/render-pulse-card-to-png (pulse/defaulted-timezone card)
                                                                                card
                                                                                query-results
                                                                                1000)
        tmp-file                         (java.io.File/createTempFile "card-png" ".png")]
    (with-open [w (java.io.FileOutputStream. tmp-file)]
      (.write w ^bytes png-bytes))
    #_#_(.deleteOnExit tmp-file)
    (open tmp-file)))

(defn- write-image!
  [^BufferedImage image, ^String format-name, ^ByteArrayOutputStream output-stream]
  (ImageIO/write image format-name output-stream))

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

(defn- render-to-png
  [^String html, width]
  (style/register-fonts-if-needed!)
  (with-open [is         (ByteArrayInputStream. (.getBytes html StandardCharsets/UTF_8))
              doc-source (StreamDocumentSource. is nil "text/html; charset=utf-8")]
    (let [dimension       (Dimension. width 1)
          doc             (.parse (DefaultDOMSource. doc-source))
          da              (dom-analyzer doc doc-source dimension)
          graphics-engine (proxy [GraphicsEngine] [(.getRoot da) da (.getURL doc-source)]
                            (setupGraphics [^Graphics2D g]
                              (doto g
                                (.setRenderingHint RenderingHints/KEY_RENDERING
                                                   RenderingHints/VALUE_RENDER_QUALITY)
                                (.setRenderingHint RenderingHints/KEY_ALPHA_INTERPOLATION
                                                   RenderingHints/VALUE_ALPHA_INTERPOLATION_QUALITY)
                                (.setRenderingHint RenderingHints/KEY_TEXT_ANTIALIASING
                                                   RenderingHints/VALUE_TEXT_ANTIALIAS_GASP)
                                (.setRenderingHint RenderingHints/KEY_FRACTIONALMETRICS
                                                   RenderingHints/VALUE_FRACTIONALMETRICS_ON))))]
      (.createLayout graphics-engine dimension)
      (let [image         (.getImage graphics-engine)
            viewport      (.getViewport graphics-engine)
            ;; CSSBox voodoo -- sometimes maximal width < minimal width, no idea why
            content-width (max (int (.getMinimalWidth viewport))
                               (int (.getMaximalWidth viewport)))]
        ;; Crop the image to the actual size of the rendered content so that tables don't have a ton of whitespace.
        (if (< content-width (.getWidth image))
          (.getSubimage image 0 0 content-width (.getHeight image))
          image)))))

(defmethod qp.si/stream-options :png
  ([_]
   (qp.si/stream-options :csv "query_result"))
  ([_ filename-prefix]
   {:content-type              "image/png"
    :status                    200
    :headers                   {"Content-Disposition" (format "attachment; filename=\"%s_%s.png\""
                                                              (or filename-prefix "query_result")
                                                              (u.date/format (t/zoned-date-time)))}
    :write-keepalive-newlines? false}))

(defmethod qp.si/streaming-results-writer :png
  [_ ^OutputStream os]
  (let [os (ByteArrayOutputStream. os)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols]} :data} _]
        (-> (render-to-png (hiccup.core/html [:html [:body [:p "hi"]]]) 500)
            (write-image! "png" os)))

      (write-row! [_ row _row-num _ {:keys [output-order]}]
        nil #_(let [ordered-row (if output-order
                            (let [row-v (into [] row)]
                              (for [i output-order] (row-v i)))
                            row)]
          (csv/write-csv writer [(map common/format-value ordered-row)])
          (.flush writer)))

      (finish! [_ _]
         ;; TODO -- not sure we need to flush both
        #_(.flush writer)
        (.flush os)
        #_(.close writer)))))
