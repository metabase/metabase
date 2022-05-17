(ns metabase.pulse.render.png
  "Logic for rendering HTML to a PNG.

  Ported by @tlrobinson from
  https://github.com/radkovo/CSSBox/blob/cssbox-4.10/src/main/java/org/fit/cssbox/demo/ImageRenderer.java with
  subsequent code simplification and cleanup by @camsaul

  CSSBox JavaDoc is here: http://cssbox.sourceforge.net/api/index.html"
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [hiccup.core :refer [html]]
            [metabase.pulse.render.common :as common]
            [metabase.pulse.render.style :as style]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import cz.vutbr.web.css.MediaSpec
           [java.awt Graphics2D RenderingHints]
           java.awt.image.BufferedImage
           [java.io ByteArrayInputStream ByteArrayOutputStream]
           java.nio.charset.StandardCharsets
           javax.imageio.ImageIO
           org.fit.cssbox.awt.GraphicsEngine
           [org.fit.cssbox.css CSSNorm DOMAnalyzer DOMAnalyzer$Origin]
           [org.fit.cssbox.io DefaultDOMSource StreamDocumentSource]
           org.fit.cssbox.layout.Dimension
           org.w3c.dom.Document))

(defn- register-font! [filename]
  (with-open [is (io/input-stream (io/resource filename))]
    (.registerFont (java.awt.GraphicsEnvironment/getLocalGraphicsEnvironment)
                   (java.awt.Font/createFont java.awt.Font/TRUETYPE_FONT is))))

(defn- register-fonts! []
  (try
    (doseq [weight ["regular" "700" "900"]]
      (register-font! (format "frontend_client/app/fonts/Lato/lato-v16-latin-%s.ttf" weight)))
    (catch Throwable e
      (let [message (str (trs "Error registering fonts: Metabase will not be able to send Pulses.")
                         " "
                         (trs "This is a known issue with certain JVMs. See {0} and for more details."
                              "https://github.com/metabase/metabase/issues/7986"))]
        (log/error e message)
        (throw (ex-info message {} e))))))

(defonce ^{:doc      "Makes custom fonts available to Java so that CSSBox can render them."
           :private  true
           :arglists '([])} register-fonts-if-needed!
  (let [register!* (delay (register-fonts!))]
    (fn []
      @register!*)))

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
  (register-fonts-if-needed!)
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

(s/defn render-html-to-png :- bytes
  "Render the Hiccup HTML `content` of a Pulse to a PNG image, returning a byte array."
  [{:keys [content]} :- common/RenderedPulseCard
   width]
  (try
    (let [html (html [:html [:body {:style (style/style
                                            {:margin           0
                                             :padding          0
                                             :background-color :white})}
                             content]])]
      (with-open [os (ByteArrayOutputStream.)]
        (-> (render-to-png html width)
            (write-image! "png" os))
        (.toByteArray os)))
    (catch Throwable e
      (log/error e (trs "Error rendering Pulse"))
      (throw e))))
