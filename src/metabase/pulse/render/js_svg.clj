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

const positional_accessors = {
  x: (row) => row[0],
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

function categorical_bar (data, labels) {
  return StaticViz.RenderChart(\"categorical/bar\", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    accessors: positional_accessors
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
  (let [s       (str/replace s #"<svg" "<svg xmlns=\"http://www.w3.org/2000/svg\"")
        factory (SAXSVGDocumentFactory. "org.apache.xerces.parsers.SAXParser")]
    (with-open [is (ByteArrayInputStream. (.getBytes s StandardCharsets/UTF_8))]
      (.createDocument factory "file:///fake.svg" is))))

(def ^:dynamic ^:private *svg-render-width*
  "Width to render svg images. Intentionally large to improve quality. Consumers should be aware and resize as
  needed. Email should include width tags; slack automatically resizes inline and provides a nice detail view when
  clicked."
  (float 1200))

(def ^:dynamic ^:private *svg-render-height*
  "Height to render svg images. If not bound, will preserve aspect ratio of original image."
  nil)

(defn- render-svg
  ^bytes [^SVGOMDocument svg-document]
  (with-open [os (ByteArrayOutputStream.)]
    (let [^SVGOMDocument fixed-svg-doc (post-process svg-document fix-fill)
          in                           (TranscoderInput. fixed-svg-doc)
          out                          (TranscoderOutput. os)
          transcoder                   (PNGTranscoder.)]
      (.addTranscodingHint transcoder PNGTranscoder/KEY_WIDTH *svg-render-width*)
      (when *svg-render-height*
        (.addTranscodingHint transcoder PNGTranscoder/KEY_HEIGHT *svg-render-height*))
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
  map of {:left \"left-label\" :right \"right-label\"}. Returns a byte array of a png file."
  [rows labels]
  (let [svg-string (.asString (js/execute-fn-name @context "timeseries_bar" rows
                                                  (map (fn [[k v]] [(name k) v]) labels)))]
    (svg-string->bytes svg-string)))

(defn categorical-bar
  "Clojure entrypoint to render a categorical bar chart. Rows should be tuples of [stringable numeric-value]. Labels is
  a map of {:left \"left-label\" :right \"right-label\". Returns a byte array of a png file. "
  [rows labels]
  (let [svg-string (.asString (js/execute-fn-name @context "categorical_bar" rows
                                                  (map (fn [[k v]] [(name k) v]) labels)))]
    (svg-string->bytes svg-string)))

(defn categorical-donut
  "Clojure entrypoint to render a categorical donut chart. Rows should be tuples of [category numeric-value]. Returns a
  byte array of a png file"
  [rows colors]
  (let [svg-string (.asString (js/execute-fn-name @context "categorical_donut" rows (seq colors)))]
    (svg-string->bytes svg-string)))

(def ^:private icon-paths
  {:dashboard "M32 28a4 4 0 0 1-4 4H4a4.002 4.002 0 0 1-3.874-3H0V4a4 4 0 0 1 4-4h25a3 3 0 0 1 3 3v25zm-4 0V8H4v20h24zM7.273 18.91h10.182v4.363H7.273v-4.364zm0-6.82h17.454v4.365H7.273V12.09zm13.09 6.82h4.364v4.363h-4.363v-4.364z"
   :alert     "M14.677 7.339c-4.77.562-5.23 4.75-5.23 7.149 0 2.576 0 3.606-.53 4.121-.352.344-1.058.515-2.117.515V21.7h18v-2.576c-1.059 0-1.588 0-2.118-.515-.353-.343-.53-2.06-.53-5.151-.316-3.705-2.06-5.745-5.23-6.12a1.52 1.52 0 0 0 .466-1.093c0-.853-.71-1.545-1.588-1.545-.877 0-1.588.692-1.588 1.545 0 .427.178.814.465 1.094zM16.05 0c2.473 0 5.57 1.851 6.22 4.12 3.057 1.58 4.868 4.503 5.223 8.706l.013.158v.157c0 .905.014 1.682.042 2.327H30.6V25.73H1.5V15.468h3.091c.002-.326.003-.725.003-1.222 0-2.308.316-4.322 1.26-6.233.881-1.784 2.223-2.988 3.976-3.893C10.48 1.85 13.576 0 16.05 0zM13.1 25.8c.25 1.6 1.166 2.4 2.75 2.4s2.5-.8 2.75-2.4h-5.5zm-4.35-3.16h14.191l-.586 3.261c-.497 3.607-2.919 6.001-6.51 6.001-3.59 0-6.012-2.394-6.508-6L8.75 22.64z"})

(defn- icon-svg-string
  [icon-name color]
  (str "<svg><path d=\"" (get icon-paths icon-name) "\" fill=\"" color "\"/></svg>"))

(defn icon
  "Entrypoint for rendering an SVG icon as a PNG, with a specific color"
  [icon-name color]
  (let [svg-string (icon-svg-string icon-name color)]
    (binding [*svg-render-width*  (float 33)
              *svg-render-height* (float 33)]
      (svg-string->bytes svg-string))))
