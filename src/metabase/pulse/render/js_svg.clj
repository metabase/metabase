(ns metabase.pulse.render.js-svg
  "Functions to render charts as svg strings by using graal's js engine. A bundle is built by `yarn build-static-viz`
  which has charting library. This namespace has some wrapper functions to invoke those functions. Interop is very
  strange, as the jvm datastructures, not just serialized versions are used. This is why we have the `toJSArray` and
  `toJSMap` functions to turn Clojure's normal datastructures into js native structures."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.public-settings :as public-settings]
   [metabase.pulse.render.js-engine :as js]
   [metabase.pulse.render.style :as style])
  (:import
   (java.io ByteArrayInputStream ByteArrayOutputStream)
   (java.nio.charset StandardCharsets)
   (org.apache.batik.anim.dom SAXSVGDocumentFactory SVGOMDocument)
   (org.apache.batik.transcoder TranscoderInput TranscoderOutput)
   (org.apache.batik.transcoder.image PNGTranscoder)
   (org.graalvm.polyglot Context)
   (org.w3c.dom Element Node)))

(set! *warn-on-reflection* true)

;; the bundle path goes through webpack. Changes require a `yarn build-static-viz`
(def ^:private bundle-path
  "frontend_client/app/dist/lib-static-viz.bundle.js")

;; the interface file does not go through webpack. Feel free to quickly change as needed and then re-require this
;; namespace to redef the `context`.
(def ^:private interface-path
  "frontend_shared/static_viz_interface.js")

(defn- load-viz-bundle [^Context context]
  (doto context
    (js/load-resource bundle-path)
    (js/load-resource interface-path)))

(def ^:private static-viz-context-delay
  "Delay containing a graal js context. It has the chart bundle and the above `src-api` in its environment suitable
  for creating charts."
  ;; todo is this thread safe? Should we have a resource pool on top of this? Or create them fresh for each invocation
  (delay (load-viz-bundle (js/context))))

(defn- context
  "Returns a static viz context. In dev mode, this will be a new context each time. In prod or test modes, it will
  return the derefed contents of `static-viz-context-delay`."
  ^Context []
  (if config/is-dev?
    (load-viz-bundle (js/context))
    @static-viz-context-delay))

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
  (style/register-fonts-if-needed!)
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

(defn waterfall
  "Clojure entrypoint to render a timeseries or categorical waterfall chart. Rows should be tuples of [datetime numeric-value]. Labels is
  a map of {:left \"left-label\" :botton \"bottom-label\". Returns a byte array of a png file."
  [rows labels settings waterfall-type]
  (let [svg-string (.asString (js/execute-fn-name (context) "waterfall" rows
                                                  (map (fn [[k v]] [(name k) v]) labels)
                                                  (json/generate-string settings)
                                                  (name waterfall-type)
                                                  (json/generate-string (public-settings/application-colors))))]
    (svg-string->bytes svg-string)))

(defn funnel
  "Clojure entrypoint to render a funnel chart. Data should be vec of [[Step Measure]] where Step is {:name name :format format-options} and Measure is {:format format-options} and you go and look to frontend/src/metabase/static-viz/components/FunnelChart/types.ts for the actual format options.
  Returns a byte array of a png file."
  [data settings]
  (let [svg-string (.asString (js/execute-fn-name (context) "funnel" (json/generate-string data)
                                                  (json/generate-string settings)))]
    (svg-string->bytes svg-string)))

(defn combo-chart
  "Clojure entrypoint to render a combo or multiple chart.
  These are different conceptions in the BE but being smushed together
  because they're supposed to display similarly.
  Series should be list of dicts of {rows: rows, cols: cols, type: type}, where types is 'line' or 'bar' or 'area'.
  Rows should be tuples of [datetime numeric-value]. Labels is a
  map of {:left \"left-label\" :botton \"bottom-label\"}. Returns a byte array of a png file."
  [series-seqs settings]
  (svg-string->bytes
   (.asString (js/execute-fn-name (context)
                                  "combo_chart"
                                  (json/generate-string series-seqs)
                                  (json/generate-string settings)
                                  (json/generate-string (public-settings/application-colors))))))

(defn row-chart
  "Clojure entrypoint to render a row chart."
  [settings data]
  (let [svg-string (.asString (js/execute-fn-name (context) "row_chart"
                                                  (json/generate-string settings)
                                                  (json/generate-string data)
                                                  (json/generate-string (public-settings/application-colors))))]
    (svg-string->bytes svg-string)))

(defn categorical-donut
  "Clojure entrypoint to render a categorical donut chart. Rows should be tuples of [category numeric-value]. Returns a
  byte array of a png file"
  [rows legend-colors settings]
  (let [svg-string (.asString (js/execute-fn-name (context) "categorical_donut" rows (seq legend-colors) (json/generate-string settings)))]
    (svg-string->bytes svg-string)))

(defn gauge
  "Clojure entrypoint to render a gauge chart. Returns a byte array of a png file"
  [card data]
  (let [js-res (js/execute-fn-name (context) "gauge"
                                   (json/generate-string card)
                                   (json/generate-string data))
        svg-string (.asString js-res)]
    (svg-string->bytes svg-string)))

(defn progress
  "Clojure entrypoint to render a progress bar. Returns a byte array of a png file"
  [value goal settings]
  (let [js-res (js/execute-fn-name (context) "progress"
                                   (json/generate-string {:value value :goal goal})
                                   (json/generate-string settings)
                                   (json/generate-string (public-settings/application-colors)))
        svg-string (.asString js-res)]
    (svg-string->bytes svg-string)))

(def ^:private icon-paths
  {:dashboard  "M32 28a4 4 0 0 1-4 4H4a4.002 4.002 0 0 1-3.874-3H0V4a4 4 0 0 1 4-4h25a3 3 0 0 1 3 3v25zm-4 0V8H4v20h24zM7.273 18.91h10.182v4.363H7.273v-4.364zm0-6.82h17.454v4.365H7.273V12.09zm13.09 6.82h4.364v4.363h-4.363v-4.364z"
   :bell       "M14.254 5.105c-7.422.874-8.136 7.388-8.136 11.12 0 4.007 0 5.61-.824 6.411-.549.535-1.647.802-3.294.802v4.006h28v-4.006c-1.647 0-2.47 0-3.294-.802-.55-.534-.824-3.205-.824-8.013-.493-5.763-3.205-8.936-8.136-9.518a2.365 2.365 0 0 0 .725-1.701C18.47 2.076 17.364 1 16 1s-2.47 1.076-2.47 2.404c0 .664.276 1.266.724 1.7zM11.849 29c.383 1.556 1.793 2.333 4.229 2.333s3.845-.777 4.229-2.333h-8.458z"
   :database   "M0 9.32V4.054S1.584 0 15.657 0C29.731 0 31.89 3.669 31.89 4.054v5.24s-1.445 4.125-15.424 4.125S0 10.138 0 9.32zm.305 12.93s2.044 3.692 15.727 3.692 15.63-3.72 15.63-3.72.338.099.338.632v5S30.463 32 15.964 32C1.465 32 .041 27.817.041 27.817V22.9c0-.582.264-.65.264-.65zm0-9.368s2.044 3.692 15.727 3.692 15.63-3.72 15.63-3.72.338.099.338.632v5.001s-1.537 4.145-16.036 4.145C1.465 22.632.041 18.45.041 18.45v-4.918c0-.583.264-.65.264-.65z"
   :collection "M4 3a4 4 0 0 0-4 4v18.667a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4V8.333h-9.65a3.5 3.5 0 0 1-2.19-.77L14.476 3H4z"
   :link       "M12.56 17.04c-1.08 1.384-1.303 1.963 1.755 4.04 3.058 2.076 7.29.143 8.587-1.062 1.404-1.304 4.81-4.697 7.567-7.842 2.758-3.144 1.338-8.238-.715-9.987-5.531-4.71-9.5-.554-11.088.773-2.606 2.176-5.207 5.144-5.207 5.144s1.747-.36 2.784 0c1.036.36 2.102.926 2.102.926l4.003-3.969s2.367-1.907 4.575 0 .674 4.404 0 5.189c-.674.784-6.668 6.742-6.668 6.742s-1.52.811-2.37.811c-.85 0-2.582-.528-2.582-.932 0-.405-1.665-1.22-2.744.166zm7.88-2.08c1.08-1.384 1.303-1.963-1.755-4.04-3.058-2.076-7.29-.143-8.587 1.062-1.404 1.304-4.81 4.697-7.567 7.842-2.758 3.144-1.338 8.238.715 9.987 5.531 4.71 9.5.554 11.088-.773 2.606-2.176 5.207-5.144 5.207-5.144s-1.747.36-2.784 0a17.379 17.379 0 0 1-2.102-.926l-4.003 3.969s-2.367 1.907-4.575 0-.674-4.404 0-5.189c.674-.784 6.668-6.742 6.668-6.742s1.52-.811 2.37-.811c.85 0 2.582.528 2.582.932 0 .405 1.665 1.22 2.744-.166z"
   :model      "M10 0a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H10zm5.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM2 17a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V19a2 2 0 0 0-2-2H2zm5.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm9.5-8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H19a2 2 0 0 1-2-2V19zm10 5.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"
   ;; card displays
   :table      "M11.077 11.077h9.846v9.846h-9.846v-9.846zm11.077 11.077H32V32h-9.846v-9.846zm-11.077 0h9.846V32h-9.846v-9.846zM0 22.154h9.846V32H0v-9.846zM0 0h9.846v9.846H0V0zm0 11.077h9.846v9.846H0v-9.846zM22.154 0H32v9.846h-9.846V0zm0 11.077H32v9.846h-9.846v-9.846zM11.077 0h9.846v9.846h-9.846V0z"
   :bar        "M2 23.467h6.4V32H2v-8.533zm10.667-12.8h6.4V32h-6.4V10.667zM23.333 0h6.4v32h-6.4V0z"
   :line       "M18.867 16.377l-3.074-3.184-.08.077-.002-.002.01-.01-.53-.528-.066-.07-.001.002-2.071-2.072L-.002 23.645l2.668 2.668 10.377-10.377 3.074 3.183.08-.076.001.003-.008.008.5.501.094.097.002-.001 2.072 2.072L31.912 8.669 29.244 6 18.867 16.377z"
   :area       ""
   :combo      ""
   :detail     ""
   :map        ""
   :scatter    ""
   :waterfall  ""
   :pie        ""
   :pivot      ""
   :trend      ""
   :gauge      ""
   :progress   ""
   :funnel     ""
   :number     "M0 .503A.5.5 0 0 1 .503 0h30.994A.5.5 0 0 1 32 .503v30.994a.5.5 0 0 1-.503.503H.503A.5.5 0 0 1 0 31.497V.503zM8.272 22V10.8H6.464c-.064.427-.197.784-.4 1.072-.203.288-.45.52-.744.696a2.984 2.984 0 0 1-.992.368c-.368.07-.75.099-1.144.088v1.712H6V22h2.272zm2.96-5.648c0 1.12.11 2.056.328 2.808.219.752.515 1.352.888 1.8.373.448.808.768 1.304.96a4.327 4.327 0 0 0 1.576.288c.565 0 1.096-.096 1.592-.288a3.243 3.243 0 0 0 1.312-.96c.379-.448.677-1.048.896-1.8.219-.752.328-1.688.328-2.808 0-1.088-.11-2.003-.328-2.744-.219-.741-.517-1.336-.896-1.784a3.243 3.243 0 0 0-1.312-.96 4.371 4.371 0 0 0-1.592-.288c-.555 0-1.08.096-1.576.288-.496.192-.93.512-1.304.96-.373.448-.67 1.043-.888 1.784-.219.741-.328 1.656-.328 2.744zm2.272 0c0-.192.003-.424.008-.696.005-.272.024-.552.056-.84.032-.288.085-.573.16-.856a2.95 2.95 0 0 1 .312-.76 1.67 1.67 0 0 1 .512-.544c.208-.139.467-.208.776-.208.31 0 .57.07.784.208.213.139.39.32.528.544.139.224.243.477.312.76a7.8 7.8 0 0 1 .224 1.696 25.247 25.247 0 0 1-.024 1.856c-.021.453-.088.89-.2 1.312a2.754 2.754 0 0 1-.544 1.08c-.25.299-.61.448-1.08.448-.459 0-.81-.15-1.056-.448a2.815 2.815 0 0 1-.536-1.08 6.233 6.233 0 0 1-.2-1.312c-.021-.453-.032-.84-.032-1.16zm6.624 0c0 1.12.11 2.056.328 2.808.219.752.515 1.352.888 1.8.373.448.808.768 1.304.96a4.327 4.327 0 0 0 1.576.288c.565 0 1.096-.096 1.592-.288a3.243 3.243 0 0 0 1.312-.96c.379-.448.677-1.048.896-1.8.219-.752.328-1.688.328-2.808 0-1.088-.11-2.003-.328-2.744-.219-.741-.517-1.336-.896-1.784a3.243 3.243 0 0 0-1.312-.96 4.371 4.371 0 0 0-1.592-.288c-.555 0-1.08.096-1.576.288-.496.192-.93.512-1.304.96-.373.448-.67 1.043-.888 1.784-.219.741-.328 1.656-.328 2.744zm2.272 0c0-.192.003-.424.008-.696.005-.272.024-.552.056-.84.032-.288.085-.573.16-.856a2.95 2.95 0 0 1 .312-.76 1.67 1.67 0 0 1 .512-.544c.208-.139.467-.208.776-.208.31 0 .57.07.784.208.213.139.39.32.528.544.139.224.243.477.312.76a7.8 7.8 0 0 1 .224 1.696 25.247 25.247 0 0 1-.024 1.856c-.021.453-.088.89-.2 1.312a2.754 2.754 0 0 1-.544 1.08c-.25.299-.61.448-1.08.448-.459 0-.81-.15-1.056-.448a2.815 2.815 0 0 1-.536-1.08 6.233 6.233 0 0 1-.2-1.312c-.021-.453-.032-.84-.032-1.16z"})

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
