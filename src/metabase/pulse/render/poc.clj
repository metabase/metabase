(ns metabase.pulse.render.poc
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [metabase.pulse.render.js-engine :as js])
  (:import java.awt.RenderingHints
           [java.io ByteArrayInputStream ByteArrayOutputStream]
           java.nio.charset.StandardCharsets
           [org.apache.batik.anim.dom SAXSVGDocumentFactory SVGOMDocument]
           org.apache.batik.gvt.renderer.ImageRenderer
           [org.apache.batik.transcoder TranscoderInput TranscoderOutput]
           org.apache.batik.transcoder.image.PNGTranscoder))

(def ^:private bundle-path
  "frontend_shared/bundle.js")

(def ^:private additional-js
  "
const toJSArray = (a) => {
  var jsArray = [];
  for (var i = 0; i < a.length; i++) {
    jsArray[i] = a[i];
  }
  return jsArray;
}

const BarChart = (data) => exports.default(toJSArray(data));
")

(defn- engine []
  (let [js (slurp (io/resource bundle-path))]
    (doto (js/engine)
      (js/eval js)
      (js/eval additional-js))))

(def ^:private rows
  (delay (-> (slurp "src/metabase/pulse/render/data.json")
             (json/parse-string true)
             :rows)))

(defn render [results]
  (js/invoke-by-name (engine) "BarChart" results))

(defn poc-svg-string []
  (render @rows))

(defn parse-svg-string [^String s]
  (let [factory (SAXSVGDocumentFactory. "org.apache.xerces.parsers.SAXParser")]
    (with-open [is (ByteArrayInputStream. (.getBytes s StandardCharsets/UTF_8))]
      (.createDocument factory "file:///fake.svg" is))))

(defn- svg ^SVGOMDocument []
  (-> (poc-svg-string)
      (str/replace  #"<svg " "<svg xmlns=\"http://www.w3.org/2000/svg\" ")
      (str/replace #"fill=\"transparent\"" "")
      parse-svg-string))

(defn- high-quality-png-transcoder ^PNGTranscoder []
  (proxy [PNGTranscoder] []
    (createRenderer []
      (let [add-hint                (fn [^RenderingHints hints k v] (.add hints (RenderingHints. k v)))
            ^ImageRenderer renderer (proxy-super createRenderer)
            hints                   (RenderingHints.
                                     RenderingHints/KEY_ALPHA_INTERPOLATION
                                     RenderingHints/VALUE_ALPHA_INTERPOLATION_QUALITY)]
        (doto hints
          (add-hint RenderingHints/KEY_ALPHA_INTERPOLATION RenderingHints/VALUE_ALPHA_INTERPOLATION_QUALITY)
          (add-hint RenderingHints/KEY_INTERPOLATION       RenderingHints/VALUE_INTERPOLATION_BICUBIC)
          (add-hint RenderingHints/KEY_ANTIALIASING        RenderingHints/VALUE_ANTIALIAS_ON)
          (add-hint RenderingHints/KEY_COLOR_RENDERING     RenderingHints/VALUE_COLOR_RENDER_QUALITY)
          (add-hint RenderingHints/KEY_DITHERING           RenderingHints/VALUE_DITHER_DISABLE)
          (add-hint RenderingHints/KEY_RENDERING           RenderingHints/VALUE_RENDER_QUALITY)
          (add-hint RenderingHints/KEY_STROKE_CONTROL      RenderingHints/VALUE_STROKE_PURE)
          (add-hint RenderingHints/KEY_FRACTIONALMETRICS   RenderingHints/VALUE_FRACTIONALMETRICS_ON)
          (add-hint RenderingHints/KEY_TEXT_ANTIALIASING   RenderingHints/VALUE_TEXT_ANTIALIAS_OFF))
        (.setRenderingHints renderer hints)
        renderer))))

(defn render-svg
  ^bytes [^SVGOMDocument svg-document]
  (with-open [os (ByteArrayOutputStream.)]
    (let [in         (TranscoderInput. svg-document)
          out        (TranscoderOutput. os)
          transcoder (high-quality-png-transcoder)]
      (.transcode transcoder in out))
    (.toByteArray os)))

(defn png []
  (render-svg (svg)))
