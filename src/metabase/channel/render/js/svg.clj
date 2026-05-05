(ns metabase.channel.render.js.svg
  "Functions to render charts as svg strings by using graal's js engine. A bundle is built by `bun run build-static-viz`
  which has charting library. This namespace has some wrapper functions to invoke those functions. Interop is very
  strange, as the jvm datastructures, not just serialized versions are used. This is why we have the `toJSArray` and
  `toJSMap` functions to turn Clojure's normal datastructures into js native structures."
  (:require
   [clojure.string :as str]
   [metabase.appearance.core :as appearance]
   [metabase.channel.render.js.engine :as js.engine]
   [metabase.channel.render.style :as style]
   [metabase.config.core :as config]
   [metabase.lib-be.core :as lib-be]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.json :as json])
  (:import
   (io.aleph.dirigiste IPool$Controller IPool$Generator Pool Pools Stats)
   (java.io ByteArrayInputStream ByteArrayOutputStream)
   (java.nio.charset StandardCharsets)
   (java.util.concurrent TimeUnit)
   (org.apache.batik.anim.dom SAXSVGDocumentFactory SVGOMDocument)
   (org.apache.batik.transcoder TranscoderInput TranscoderOutput)
   (org.apache.batik.transcoder.image PNGTranscoder)
   (org.graalvm.polyglot Context)
   (org.w3c.dom Element Node)))

(set! *warn-on-reflection* true)

;; the bundle path goes through webpack. Changes require a `bun run build-static-viz`
(def ^:private bundle-path
  "frontend_client/app/dist/lib-static-viz.bundle.js")

;; the interface file does not go through webpack. Feel free to quickly change as needed and then re-require this
;; namespace to redef the `context`.
(def ^:private interface-path
  "frontend_shared/static_viz_interface.js")

(defn- load-viz-bundle [^Context context]
  ;; make sure people don't try to load the static viz bundle as a side-effect of loading namespaces, because it might
  ;; not have been built! If it's not built, we want to be able to give people a meaningful error (see the fixture
  ;; in [[metabase.channel.render.js.svg-test]]) rather than have the test runner fail to start with a meaningless
  ;; compilation error.
  (when config/tests-available?
    ((requiring-resolve 'mb.hawk.init/assert-tests-are-not-initializing) "(mt/id ...) or (data/id ...)"))
  (doto context
    (js.engine/load-resource bundle-path)
    (js.engine/load-resource interface-path)))

(def ^:private ^Pool static-viz-context-pool
  "Pool of Truffle JS engine objects. They are not thread-safe, so the access to them has to be carefully managed
  between threads. Each engine with loaded static viz code takes ~130 MB in memory, so we don't want too many of them.
  However, one takes ~3 seconds to initialize, so we don't want to load them anew each time in prod. Under some
  circumstances, the Truffle JS engine tends to leak memory, so we don't want to keep the reference to the engine
  forever. Considering all that, this pool targets 100% utilization (so, if the utilization is lower, the pool will
  start dropping objects) and the maximum of 3 objects (to prevent OOMs), but at least 1 object will always be in the
  pool to pick up. However, together with each engine object keep its creation timestamp so that we can throwaway
  instances that are too old to avoid leaks."
  ;; We build upon plain utilization controller that keeps up to 3 instances, but can go down to zero.
  (let [base-controller (Pools/utilizationController 1.0 3 3)]
    (Pool. (reify IPool$Generator
             (generate [_ _]
               ;; Generate a tuple of the engine and the expiry timestamp.
               [(load-viz-bundle (js.engine/context))
                (+ (System/nanoTime) (.toNanos TimeUnit/MINUTES 10))])
             (destroy [_ _ _v]))
           ;; Wrap the utilization controller with a modification that doesn't allow the pool to go below 1 instance.
           (reify IPool$Controller
             (shouldIncrement [_ k a b] (.shouldIncrement base-controller k a b))
             (adjustment [_ stats]
               (let [adj (.adjustment base-controller stats)
                     ;; :engines is arbitrary key, it just has to be consistent everywhere when working with the pool.
                     n (some-> ^Stats (:engines stats) .getNumWorkers)
                     engines-adj (:engines adj)]
                 (if (and n engines-adj (<= (+ n engines-adj) 0))
                   ;; If the adjustment is going to bring the pool to 0 engines, return empty adjustment instead.
                   {}
                   adj))))
           65000 ;; Queue size - doesn't matter much.
           25 ;; Sampling interval - doesn't matter much.
           10000 ;; Recheck every 10 seconds
           TimeUnit/MILLISECONDS)))

(defn do-with-static-viz-context
  "Impl for [[with-static-viz-context]]."
  [f]
  (if config/is-dev?
    (f (load-viz-bundle (js.engine/context)))
    (loop []
      (let [[context expiry-ts :as tuple] (.acquire static-viz-context-pool :engines)]
        (if (>= (System/nanoTime) expiry-ts)
          (do (.dispose static-viz-context-pool :engines tuple)
              (recur))
          (try (f context)
               (finally (.release static-viz-context-pool :engines tuple))))))))

(defmacro with-static-viz-context
  "Execute `body` where `binding-name` is bound to a static viz context. In dev mode, this will be a new context each
  time. In prod or test modes, it will return an instance from `static-viz-context-pool`."
  [binding-name & body]
  `(do-with-static-viz-context (fn [~binding-name] ~@body)))

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

(defn- clear-style-node
  "The echarts library (whose output we get via the [[*javascript-visualization*]] function) adds a `<style>` tag that
  we don't need. It has some invalid styles that Batik warns about, but they're all for :hover states, which have no
  meaning or effect in the static-viz context anyway."
  [^Node node]
  (letfn [(element? [x] (instance? Element x))]
    (if (and (element? node)
             (= "style" (.getNodeName ^Element node)))
      (doto ^Element node
        (.setTextContent ""))
      node)))

(defn- sanitize-svg
  "Using a regex of negated allowed characters according to the XML 1.0 spec, replace disallowed characters with an
  empty string."
  [svg-string]
  (let [allowed-chars (re-pattern (str "[^"
                                       "\u0009"
                                       "\u000A"
                                       "\u000D"
                                       "\u0020-\uD7FF"
                                       "\uE000-\uFFFD"
                                       "\u10000-\u10FFFF"
                                       "]"))]
    (str/replace svg-string allowed-chars "")))

(defn- parse-svg-string [^String s]
  (let [s (sanitize-svg s)
        factory (SAXSVGDocumentFactory. "org.apache.xerces.parsers.SAXParser")]
    (with-open [is (ByteArrayInputStream. (.getBytes ^String s StandardCharsets/UTF_8))]
      (.createDocument factory "file:///fake.svg" is))))

(def ^:dynamic ^:private *svg-render-width*
  "Width to render svg images. Intentionally large to improve quality. Consumers should be aware and resize as
  needed. Email should include width tags; slack automatically resizes inline and provides a nice detail view when
  clicked."
  (float 1200))

(def ^:dynamic ^:private *svg-render-height*
  "Height to render svg images. If not bound, will preserve aspect ratio of original image."
  nil)

(def ^:dynamic ^:private *svg-background-color*
  "Background color for rendered PNG images. Set to nil for transparent background.
  Defaults to white to ensure charts are readable in dark mode email clients."
  java.awt.Color/WHITE)

(defn- render-svg
  ^bytes [^SVGOMDocument svg-document]
  (style/register-fonts-if-needed!)
  (with-open [os (ByteArrayOutputStream.)]
    (let [^SVGOMDocument fixed-svg-doc (post-process svg-document fix-fill clear-style-node)
          in                           (TranscoderInput. fixed-svg-doc)
          out                          (TranscoderOutput. os)
          transcoder                   (PNGTranscoder.)]
      (.addTranscodingHint transcoder PNGTranscoder/KEY_WIDTH *svg-render-width*)
      (when *svg-render-height*
        (.addTranscodingHint transcoder PNGTranscoder/KEY_HEIGHT *svg-render-height*))
      (when *svg-background-color*
        (.addTranscodingHint transcoder PNGTranscoder/KEY_BACKGROUND_COLOR *svg-background-color*))
      (.transcode transcoder in out))
    (.toByteArray os)))

(defn svg-string->bytes
  "Convert a string (from svg rendering) an svg document then return the bytes"
  [s]
  (-> s parse-svg-string render-svg))

(defn funnel
  "Clojure entrypoint to render a funnel chart. Data should be vec of [[Step Measure]] where Step is

    {:name name :format format-options}

  and Measure is {:format format-options} and you go and look to
  frontend/src/metabase/static-viz/components/FunnelChart/types.ts for the actual format options. Returns a byte array
  of a png file."
  [data settings]
  (let [svg-string (with-static-viz-context context
                     (.asString (js.engine/execute-fn-name context "funnel" (json/encode data)
                                                           (json/encode settings)
                                                           (json/encode (premium-features/token-features)))))]
    (svg-string->bytes svg-string)))

(defn ^:dynamic *javascript-visualization*
  "Clojure entrypoint to render javascript visualizations. This functions is dynanic only for testing purposes."
  [cards-with-data dashcard-viz-settings]
  (let [response (with-static-viz-context context
                   (.asString (js.engine/execute-fn-name context "javascript_visualization"
                                                         (json/encode cards-with-data)
                                                         (json/encode dashcard-viz-settings)
                                                         (json/encode {:applicationColors (appearance/application-colors)
                                                                       :startOfWeek (lib-be/start-of-week)
                                                                       :customFormatting (appearance/custom-formatting)
                                                                       :tokenFeatures (premium-features/token-features)}))))]
    (-> response
        json/decode+kw
        (update :type (fnil keyword "unknown")))))

(defn gauge
  "Clojure entrypoint to render a gauge chart. Returns a byte array of a png file"
  [card data]
  (with-static-viz-context context
    (let [js-res (js.engine/execute-fn-name context "gauge"
                                            (json/encode card)
                                            (json/encode data)
                                            (json/encode (premium-features/token-features)))
          svg-string (.asString js-res)]
      (svg-string->bytes svg-string))))

(defn progress
  "Clojure entrypoint to render a progress bar. Returns a byte array of a png file"
  [value goal settings]
  (with-static-viz-context context
    (let [js-res (js.engine/execute-fn-name context "progress"
                                            (json/encode {:value value :goal goal})
                                            (json/encode settings)
                                            (json/encode (appearance/application-colors))
                                            (json/encode (premium-features/token-features)))
          svg-string (.asString js-res)]
      (svg-string->bytes svg-string))))

(def ^:private icon-paths
  {:dashboard "M32 28a4 4 0 0 1-4 4H4a4.002 4.002 0 0 1-3.874-3H0V4a4 4 0 0 1 4-4h25a3 3 0 0 1 3 3v25zm-4 0V8H4v20h24zM7.273 18.91h10.182v4.363H7.273v-4.364zm0-6.82h17.454v4.365H7.273V12.09zm13.09 6.82h4.364v4.363h-4.363v-4.364z"
   :bell      "M14.254 5.105c-7.422.874-8.136 7.388-8.136 11.12 0 4.007 0 5.61-.824 6.411-.549.535-1.647.802-3.294.802v4.006h28v-4.006c-1.647 0-2.47 0-3.294-.802-.55-.534-.824-3.205-.824-8.013-.493-5.763-3.205-8.936-8.136-9.518a2.365 2.365 0 0 0 .725-1.701C18.47 2.076 17.364 1 16 1s-2.47 1.076-2.47 2.404c0 .664.276 1.266.724 1.7zM11.849 29c.383 1.556 1.793 2.333 4.229 2.333s3.845-.777 4.229-2.333h-8.458z"})

(defn- icon-svg-string
  [icon-name color]
  (str "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"" (get icon-paths icon-name) "\" fill=\"" color "\"/></svg>"))

(defn icon
  "Entrypoint for rendering an SVG icon as a PNG, with a specific color"
  [icon-name color]
  (let [svg-string (icon-svg-string icon-name color)]
    (binding [*svg-render-width*       (float 33)
              *svg-render-height*      (float 33)
              *svg-background-color*   nil]
      (svg-string->bytes svg-string))))
