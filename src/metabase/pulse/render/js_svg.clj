(ns metabase.pulse.render.js-svg
  "Functions to render charts as svg strings by using graal's js engine. A bundle is built by `yarn build-static-viz`
  which has charting library. This namespace has some wrapper functions to invoke those functions. Interop is very
  strange, as the jvm datastructures, not just serialized versions are used. This is why we have the `toJSArray` and
  `toJSMap` functions to turn Clojure's normal datastructures into js native structures."
  (:require [clojure.string :as str]
            [metabase.pulse.render.js-engine :as js])
  (:import [java.io ByteArrayInputStream ByteArrayOutputStream]
           java.nio.charset.StandardCharsets
           [org.apache.batik.anim.dom SAXSVGDocumentFactory SVGOMDocument]
           [org.apache.batik.transcoder TranscoderInput TranscoderOutput]
           org.apache.batik.transcoder.image.PNGTranscoder
           org.graalvm.polyglot.Context
           [org.w3c.dom Element Node]))

(def ^:private bundle-path
  "frontend_client/app/dist/lib-static-viz.bundle.js")

(def ^:private src-api
  "API for calling to the javascript bundle. Entry points are the functions
  - timeseries_line
  - timeseries_bar
  - categorical_donut
  "
  "

const toJSArray = (a) => {
  var jsArray = [];
  for (var i = 0; i < a.length; i++) {
    jsArray[i] = a[i];
  }
  return jsArray;
}

function toJSMap(m) {
  var o = {};
  for (var i = 0; i < m.length; i++) {
    o[m[i][0]] = m[i][1];
  }
  return o;
}

const date_accessors = {
  x: (row) => new Date(row[0]).valueOf(),
  y: (row) => row[1],
}

const dimension_accessors = {
  dimension: (row) => row[0],
  metric: (row) => row[1],
}

function timeseries_line (data, labels) {
  return StaticViz.RenderChart(\"timeseries/line\", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    accessors: date_accessors
 })
}

function timeseries_bar (data, labels) {
  return StaticViz.RenderChart(\"timeseries/bar\", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    accessors: date_accessors
 })
}

function categorical_donut (rows, colors) {
  return StaticViz.RenderChart(\"categorical/donut\", {
    data: toJSArray(rows),
    colors: toJSMap(colors),
    accessors: dimension_accessors
 })
}

")

(defn- load-viz-bundle [^Context context]
  (doto context
    (js/load-resource bundle-path)
    (js/load-js-string src-api "src call")))

(defn- static-viz-context
  "Load the static viz js bundle into a new graal js context."
  []
  (load-viz-bundle (js/context)))

(def ^:private ^Context context
  "Javascript context suitable for evaluating the charts. It has the chart bundle and the above `src-api` in its
  environment suitable for creating charts."
  ;; todo is this thread safe? Should we have a resource pool on top of this? Or create them fresh for each invocation
  (delay (static-viz-context)))

(defn- post-process
  "Mutate in place the elements of the svg document. Remove the fill=transparent attribute in favor of
  fill-opacity=0.0. Our svg image renderer only understands the latter. Mutation is unfortunately necessary as the
  underlying tree of nodes is inherently mutable"
  [^SVGOMDocument svg-document & post-fns]
  (loop [s [(.getDocumentElement svg-document)]]
    (when-let [^Node node (peek s)]
      (let [s' (let [nodelist (.getChildNodes node)
                     length   (.getLength nodelist)]
                 (apply conj (pop s)
                        ;; reverse the nodes for the stack so it goes down first child first
                        (map #(.item nodelist %) (reverse (range length)))))]
        (reduce (fn [node f] (f node)) node post-fns)
        (recur s'))))
  svg-document)

(defn- fix-fill
  "The batik svg renderer does not understand fill=\"transparent\" so we must change that to
  fill-opacity=\"0.0\". Previously was just doing a string replacement but now is a proper tree walk fix."
  [^Node node]
  (letfn [(element? [x] (instance? Element x))]
    (if (and (element? node)
             (.hasAttribute ^Element node "fill")
             (= (.getAttribute ^Element node "fill") "transparent"))
      (doto ^Element node
        (.removeAttribute "fill")
        (.setAttribute "fill-opacity" "0.0"))
      node)))

(defn- parse-svg-string [^String s]
  (let [s       (str/replace s #"<svg " "<svg xmlns=\"http://www.w3.org/2000/svg\" ")
        factory (SAXSVGDocumentFactory. "org.apache.xerces.parsers.SAXParser")]
    (with-open [is (ByteArrayInputStream. (.getBytes s StandardCharsets/UTF_8))]
      (.createDocument factory "file:///fake.svg" is))))

(def svg-render-width
  "Width to render svg images. Intentionally large to improve quality. Consumers should be aware and resize as
  needed. Email should include width tags; slack automatically resizes inline and provides a nice detail view when
  clicked."
  (float 1200))

(defn- render-svg
  ^bytes [^SVGOMDocument svg-document]
  (with-open [os (ByteArrayOutputStream.)]
    (let [^SVGOMDocument fixed-svg-doc (post-process svg-document fix-fill)
          in                           (TranscoderInput. fixed-svg-doc)
          out                          (TranscoderOutput. os)
          transcoder                   (PNGTranscoder.)]
      (.addTranscodingHint transcoder PNGTranscoder/KEY_WIDTH svg-render-width)
      (.transcode transcoder in out))
    (.toByteArray os)))

(defn- svg-string->bytes [s]
  (-> s parse-svg-string render-svg))

(defn timelineseries-line
  "Clojure entrypoint to render a timeseries line char. Rows should be tuples of [datetime numeric-value]. Labels is a
  map of {:left \"left-label\" :right \"right-label\"}. Returns a byte array of a png file."
  [rows labels]
  (let [svg-string (.asString (js/execute-fn-name @context "timeseries_line" rows
                                                  (map (fn [[k v]] [(name k) v]) labels)))]
    (svg-string->bytes svg-string)))

(defn timelineseries-bar
  "Clojure entrypoint to render a timeseries bar char. Rows should be tuples of [datetime numeric-value]. Labels is a
  map of {:left \"left-label\" :right \"right-label\"}. Returns a byte array of a png file"
  [rows labels]
  (let [svg-string (.asString (js/execute-fn-name @context "timeseries_bar" rows
                                                  (map (fn [[k v]] [(name k) v]) labels)))]
    (svg-string->bytes svg-string)))

(defn categorical-donut
  "Clojure entrypoint to render a categorical donut chart. Rows should be tuples of [category numeric-value]. Returns a
  byte array of a png file"
  [rows colors]
  (let [svg-string (.asString (js/execute-fn-name @context "categorical_donut" rows (seq colors)))]
    (svg-string->bytes svg-string)))
