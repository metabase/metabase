(ns metabase.channel.render.js.svg-test
  "Testing of the svgs produced by the graal js engine and the static-viz bundle. The model is

  query-results -> js engine with bundle -> svg-string -> svg png renderer

  the svg png renderer does not understand nested html elements so we ensure that there are no divs, spans, etc in the
  resulting svg."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.channel.render.js.svg :as js.svg])
  (:import
   (java.awt Color)
   (java.awt.image BufferedImage)
   (java.io ByteArrayInputStream ByteArrayOutputStream File)
   (java.util Base64)
   (javax.imageio ImageIO)
   (org.apache.batik.anim.dom SVGOMDocument)
   (org.apache.batik.transcoder TranscoderException)
   (org.w3c.dom Element Node)))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn warn-possible-rebuild
    [thunk]
    (testing "[PRO TIP] If this test fails, you may need to rebuild the bundle with `bun run build-static-viz`\n"
      (thunk))))

(def ^:private parse-svg #'js.svg/parse-svg-string)

(deftest ^:parallel post-process-test
  (let [svg   "<svg xmlns=\"http://www.w3.org/2000/svg\"><g><line/></g><g><rect/></g><g><circle/></g></svg>"
        nodes (atom [])]
    (#'js.svg/post-process (parse-svg svg)
                           (fn [^Node node] (swap! nodes conj (.getNodeName node))))
    (is (= ["svg" "g" "line" "g" "rect" "g" "circle"] @nodes))))

(deftest ^:parallel fix-fill-test
  (let [svg "<svg xmlns=\"http://www.w3.org/2000/svg\"><line x1=\"0\" y1=\"260\" x2=\"540\" y2=\"260\" fill=\"transparent\"></line></svg>"

        ^SVGOMDocument document (parse-svg svg)
        ^Element line           (..  document
                                     (getDocumentElement)
                                     (getChildNodes)
                                     (item 0))]
    (is (.hasAttribute line "fill"))
    (is (= "transparent"
           (.getAttribute line "fill")))
    ;; unfortunately these objects are mutable. It does return the line but want to emphasize that is works by
    ;; mutation
    (#'js.svg/fix-fill line)
    (is (not (.hasAttribute line "fill")))
    (is (.hasAttribute line "fill-opacity"))
    (is (= "0.0"
           (.getAttribute line "fill-opacity")))))

(deftest ^:parallel icon-svg-string-escapes-color-test
  (testing "a color full of xml metacharacters cannot inject markup into the icon svg (SEC-722)"
    (let [payload                 (str "red\"/><image xmlns:xlink=\"http://www.w3.org/1999/xlink\" "
                                       "xlink:href=\"file:///etc/passwd\" width=\"33\" height=\"33\"/><path d=\"")
          ^SVGOMDocument document (parse-svg (#'js.svg/icon-svg-string :bell payload))
          ^Element path           (.. document (getDocumentElement) (getChildNodes) (item 0))
          nodes                   (atom [])]
      (#'js.svg/post-process document (fn [^Node node] (swap! nodes conj (.getNodeName node))))
      (is (= ["svg" "path"] @nodes)
          "the payload must not add any elements to the document")
      (is (= payload (.getAttribute path "fill"))
          "the color survives escaping as a plain attribute value"))))

(defn- solid-png-bytes
  "PNG bytes of a 2x2 image filled with `color`."
  ^bytes [^Color color]
  (let [image (BufferedImage. 2 2 BufferedImage/TYPE_INT_RGB)]
    (doseq [x (range 2)
            y (range 2)]
      (.setRGB image x y (.getRGB color)))
    (with-open [os (ByteArrayOutputStream.)]
      (ImageIO/write image "png" os)
      (.toByteArray os))))

(defn- image-svg
  "An svg whose entire canvas is an `<image>` pointing at `href`."
  [href]
  (str "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"10\" height=\"10\">"
       "<image xlink:href=\"" href "\" x=\"0\" y=\"0\" width=\"10\" height=\"10\"/></svg>"))

(defn- render-center-pixel
  "Rasterize `svg-string` and return the `[r g b]` of the center pixel, or `::blocked` if Batik refused to render it."
  [svg-string]
  (binding [js.svg/*chart-size* {:width 20 :height 20}]
    (try
      (let [image (ImageIO/read (ByteArrayInputStream. (js.svg/svg-string->bytes svg-string)))
            argb  (.getRGB image (quot (.getWidth image) 2) (quot (.getHeight image) 2))]
        [(bit-and (bit-shift-right argb 16) 0xFF)
         (bit-and (bit-shift-right argb 8) 0xFF)
         (bit-and argb 0xFF)])
      (catch TranscoderException _ ::blocked))))

(deftest ^:parallel svg-string->bytes-refuses-external-resources-test
  (testing "an svg may not pull in a resource from outside the document (SEC-722)"
    (let [secret (doto ^File (File/createTempFile "metabase-svg-test" ".png") (.deleteOnExit))]
      (io/copy (solid-png-bytes Color/RED) secret)
      (is (= ::blocked (render-center-pixel (image-svg (str "file://" (.getAbsolutePath secret)))))
          "a file: reference must not be read off the server's disk and rasterized into the output")))
  (testing "images embedded in the document itself still render"
    (let [data-uri (str "data:image/png;base64,"
                        (.encodeToString (Base64/getEncoder) (solid-png-bytes Color/GREEN)))]
      (is (= [0 255 0] (render-center-pixel (image-svg data-uri)))))))

(deftest ^:parallel parse-svg-sanitizes-characters-test
  (testing "Characters discouraged or not permitted by the xml 1.0 specification are removed. (#"
    (#'js.svg/parse-svg-string
     "<svg xmlns=\"http://www.w3.org/2000/svg\">\u001F</svg>")))
