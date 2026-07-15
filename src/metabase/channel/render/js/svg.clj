(ns metabase.channel.render.js.svg
  "Functions to render charts as svg strings by using graal's js engine. A bundle is built by `bun run build-static-viz`
  which has charting library. This namespace has some wrapper functions to invoke those functions. Interop is very
  strange, as the jvm datastructures, not just serialized versions are used. This is why we have the `toJSArray` and
  `toJSMap` functions to turn Clojure's normal datastructures into js native structures."
  (:require
   [clojure.string :as str]
   [metabase.appearance.core :as appearance]
   [metabase.channel.render.image-buffer :as image-buffer]
   [metabase.channel.render.js.engine :as js.engine]
   [metabase.channel.render.style :as style]
   [metabase.config.core :as config]
   [metabase.lib-be.core :as lib-be]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (io.aleph.dirigiste IPool$Controller IPool$Generator Pool Pools Stats)
   (java.io ByteArrayInputStream ByteArrayOutputStream)
   (java.nio.charset StandardCharsets)
   (java.util.concurrent TimeUnit)
   (org.apache.batik.anim.dom SAXSVGDocumentFactory SVGOMDocument)
   (org.apache.batik.transcoder TranscoderInput TranscoderOutput)
   (org.apache.batik.transcoder.image PNGTranscoder)
   (org.graalvm.polyglot Context PolyglotException)
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
               ;; Generate a tuple of the context and the expiry timestamp. Timing logged so the in-process
               ;; bundle load is directly comparable to the isolate's (see untrusted-static-viz-context-pool):
               ;; the same ~16MB bundle, but no native-isolate Source marshalling, so this is much faster.
               (let [start (System/nanoTime)
                     ctx   (load-viz-bundle (js.engine/context))]
                 (log/infof "static-viz: generated in-process context (loaded bundle) in %.0fms"
                            (/ (- (System/nanoTime) start) 1e6))
                 [ctx (+ (System/nanoTime) (.toNanos TimeUnit/MINUTES 10))]))
             (destroy [_ _ [^Context ctx _expiry]]
               ;; Close the context when it's disposed from the pool (expiry/shutdown). Without this, each disposed
               ;; static-viz context (~130 MB) leaks its native memory: GraalVM only releases it on `close`, not on GC.
               (log/debug "static-viz: disposing in-process context")
               (try
                 (.close ctx true) ;; force close - can't wait for running code
                 (catch Exception _))))
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

(def ^:private ^Pool untrusted-static-viz-context-pool
  "Pool of `SandboxPolicy/UNTRUSTED` isolate contexts for rendering untrusted custom-viz plugin JS. Mirrors
  [[static-viz-context-pool]] but for the isolate path. Pooling is the whole point: the ~16MB static-viz bundle
  is parsed *once* per pooled context (a >10s cold parse, far worse on CPU-throttled hardware) and reused across
  renders, instead of the old unpooled path that re-parsed on every render (the 55s pulse-test regression).

  Capped at 1 context: each holds the bundle plus up to a 512MB isolate heap, and native isolate memory is what
  previously OOM-killed the server, so we keep exactly one and let `execute-fn-name`'s per-context lock serialize
  renders. Contexts expire after 10 minutes (Truffle can leak) and are recycled; a context whose cumulative
  `sandbox.MaxCPUTime` ([[js.engine/pool-max-cpu-time]]) is exhausted is cancelled and disposed by
  [[do-with-untrusted-static-viz-context]] so the pool regenerates a fresh one.

  Trade-off vs. the previous fresh-context-per-render design: reused contexts share JS global state across
  renders (acceptable — the isolate still fully contains plugins from the host), and there is no tight per-render
  CPU bound (only the coarse cumulative one)."
  (let [base-controller (Pools/utilizationController 1.0 1 1)]
    (Pool. (reify IPool$Generator
             (generate [_ _]
               ;; Cold-parses the ~16MB static-viz bundle into a fresh isolate; logged with timing because this
               ;; is the dominant per-context cost and explains slow first/regenerated renders.
               (let [start (System/nanoTime)
                     ctx   (load-viz-bundle (js.engine/untrusted-plugin-context js.engine/pool-max-cpu-time))]
                 (log/infof "custom-viz: generated untrusted static-viz isolate context (cold-parsed bundle) in %.0fms"
                            (/ (- (System/nanoTime) start) 1e6))
                 [ctx (+ (System/nanoTime) (.toNanos TimeUnit/MINUTES 10))]))
             (destroy [_ _ [^Context ctx _expiry]]
               (log/debug "custom-viz: disposing untrusted static-viz isolate context")
               (try
                 (.close ctx true) ;; force close - can't wait for running code
                 (catch Exception _))))
           (reify IPool$Controller
             (shouldIncrement [_ k a b] (.shouldIncrement base-controller k a b))
             (adjustment [_ stats]
               (let [adj         (.adjustment base-controller stats)
                     n           (some-> ^Stats (:engines stats) .getNumWorkers)
                     engines-adj (:engines adj)]
                 (if (and n engines-adj (<= (+ n engines-adj) 0))
                   {}
                   adj))))
           65000
           25
           10000
           TimeUnit/MILLISECONDS)))

(defn do-with-untrusted-static-viz-context
  "Impl for [[with-untrusted-static-viz-context]]. Acquires a pooled `SandboxPolicy/UNTRUSTED` isolate context
  ([[untrusted-static-viz-context-pool]]) with the static-viz bundle already loaded, runs `f`, then releases it
  back to the pool. In dev, uses a fresh context each time (mirrors [[do-with-static-viz-context]]). A context
  cancelled by exhausting its cumulative `sandbox.MaxCPUTime` is disposed (not released) so the pool regenerates."
  [f]
  (if config/is-dev?
    (let [^Context context (load-viz-bundle (js.engine/untrusted-plugin-context))]
      (try
        (f context)
        (finally
          (try (.close context true) (catch Throwable _)))))
    (loop []
      (let [[^Context context expiry-ts :as tuple] (.acquire untrusted-static-viz-context-pool :engines)]
        (if (>= (System/nanoTime) expiry-ts)
          (do (.dispose untrusted-static-viz-context-pool :engines tuple)
              (recur))
          (let [disposed? (volatile! false)]
            (try
              (f context)
              (catch PolyglotException e
                ;; A cancelled / resource-exhausted context is permanently unusable; dispose it so the pool
                ;; regenerates a fresh one rather than handing a dead context to the next render.
                (when (or (.isCancelled e) (.isResourceExhausted e))
                  (vreset! disposed? true)
                  (log/warnf "custom-viz: untrusted static-viz context hit a sandbox limit (cancelled=%s resource-exhausted=%s); disposing and regenerating. %s"
                             (.isCancelled e) (.isResourceExhausted e) (.getMessage e))
                  (.dispose untrusted-static-viz-context-pool :engines tuple))
                (throw e))
              (finally
                (when-not @disposed?
                  (.release untrusted-static-viz-context-pool :engines tuple))))))))))

(defmacro with-untrusted-static-viz-context
  "Like [[with-static-viz-context]] but binds `binding-name` to a sandboxed UNTRUSTED isolate context for
  rendering untrusted custom-viz plugin code."
  [binding-name & body]
  `(do-with-untrusted-static-viz-context (fn [~binding-name] ~@body)))

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

(defn- hsl->rgb
  "Convert an HSL color to `[r g b]` (each an int in 0-255). `h` is in degrees; `s` and `l` are in [0,1]."
  [h s l]
  (let [h  (mod (double h) 360.0)
        s  (double s)
        l  (double l)
        c  (* (- 1.0 (Math/abs (- (* 2.0 l) 1.0))) s)
        hp (/ h 60.0)
        x  (* c (- 1.0 (Math/abs (- (mod hp 2.0) 1.0))))
        [r1 g1 b1] (cond
                     (< hp 1.0) [c x 0.0]
                     (< hp 2.0) [x c 0.0]
                     (< hp 3.0) [0.0 c x]
                     (< hp 4.0) [0.0 x c]
                     (< hp 5.0) [x 0.0 c]
                     :else      [c 0.0 x])
        m  (- l (/ c 2.0))]
    (mapv #(long (Math/round (* 255.0 (+ (double %) m)))) [r1 g1 b1])))

(defn- ->hex-component ^String [n]
  (format "%02X" (long (max 0 (min 255 (long (Math/round (double n))))))))

(defn- css-color-fn->hex+alpha
  "Parse a CSS `hsl()/hsla()/rgba()` color string into `[hex alpha]`, where `hex` is `#RRGGBB` and `alpha` is a double
  in [0,1]. Positional parsing relies on the function name: `hsl*` treats the 2nd/3rd numbers as percentages, `rgb*`
  treats the first three as 0-255. Returns nil if it can't be parsed."
  [^String value]
  (let [lower (u/lower-case-en (str/trim value))
        nums  (mapv #(Double/parseDouble %) (re-seq #"-?\d*\.?\d+" lower))
        alpha (get nums 3 1.0)]
    (cond
      (str/starts-with? lower "hsl")
      (let [[h s l] nums
            [r g b] (hsl->rgb h (/ s 100.0) (/ l 100.0))]
        [(str "#" (->hex-component r) (->hex-component g) (->hex-component b)) alpha])

      (str/starts-with? lower "rgb")
      (let [[r g b] nums]
        [(str "#" (->hex-component r) (->hex-component g) (->hex-component b)) alpha])

      :else nil)))

(defn- format-alpha ^String [alpha]
  (-> (format "%.4f" (double alpha))
      (str/replace #"0+$" "")
      (str/replace #"\.$" "")))

(def ^:private batik-unsafe-color-attr-re
  ;; Batik implements CSS2, so its `fill`/`stroke` parser only understands hex/`rgb()`/named colors -- not the CSS3
  ;; `hsl()`/`hsla()`/`rgba()` forms. Custom-viz plugin SVGs (and some ECharts label tints) emit these verbatim,
  ;; making Batik throw "invalid CSS value" at transcode time.
  #"(?i)(fill|stroke)=\"\s*(hsla?\([^\"]*\)|rgba\([^\"]*\))\s*\"")

(defn- normalize-colors-for-batik
  "Rewrite any `fill`/`stroke` attribute whose value is an `hsl()/hsla()/rgba()` color into a Batik-safe hex value plus
  a separate `*-opacity` attribute (which Batik does support). No-op for colors Batik already understands."
  [svg-string]
  (str/replace svg-string batik-unsafe-color-attr-re
               (fn [[whole attr value]]
                 (if-let [[hex alpha] (css-color-fn->hex+alpha value)]
                   (let [attr (u/lower-case-en attr)]
                     (if (< (double alpha) 1.0)
                       (str attr "=\"" hex "\" " attr "-opacity=\"" (format-alpha alpha) "\"")
                       (str attr "=\"" hex "\"")))
                   whole))))

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
  (let [s (-> s sanitize-svg normalize-colors-for-batik)
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

(def ^:dynamic *chart-size*
  "When bound to a map `{:width <px> :height <px>}`, isomorphic (ECharts) charts rendered via
  [[*javascript-visualization*]] use `:width`/`:height` as their intrinsic (logical) SVG
  dimensions, and PNG rasterization targets those same dimensions (stretching to fit). Used to
  make a backend chart fill an explicit pixel box -- e.g. a dashboard grid cell -- the way the
  frontend does. When nil, keeps the legacy behavior (fixed width, aspect-preserving height).

  An optional `:scale` (default 1) multiplies *only the raster* dimensions: the chart is still
  laid out at `:width`x`:height` (so fonts, labels, and spacing are unchanged), but the SVG is
  rasterized to `scale`x more pixels -- i.e. supersampling for a crisper image at the same on-page
  size, without relaying the chart out smaller.

  An optional `:fit-within?` (default false) tells legended charts to treat `:width`x`:height` as
  the exact output box -- fitting the legend *inside* it rather than stacking it on top (which
  returns an SVG taller than requested and makes it shrink to fit). Used by the PDF renderer so a
  chart fills its grid cell's full width."
  nil)

(def ^:dynamic *svg-background-color*
  "Background color for rendered PNG images. Set to nil for transparent background.
  Defaults to white to ensure charts are readable in dark mode email clients."
  java.awt.Color/WHITE)

(defn- reusing-buffers-transcoder
  "A [[PNGTranscoder]] whose output ARGB raster is borrowed from the shared [[metabase.channel.render.image-buffer]]
  pool instead of freshly allocated. Batik calls `createImage` once to mint the (often several-MB) result buffer; we
  hand it a pooled one and record it in `acquired` (a 1-element atom) so the caller can release it after `transcode`."
  ^PNGTranscoder [acquired]
  (proxy [PNGTranscoder] []
    (createImage [w h]
      (let [img (image-buffer/acquire w h)]
        (reset! acquired img)
        img))))

(defn- render-svg
  ^bytes [^SVGOMDocument svg-document]
  (style/register-fonts-if-needed!)
  (with-open [os (ByteArrayOutputStream.)]
    (let [^SVGOMDocument fixed-svg-doc (post-process svg-document fix-fill clear-style-node)
          in                           (TranscoderInput. fixed-svg-doc)
          out                          (TranscoderOutput. os)
          acquired                     (atom nil)
          transcoder                   (reusing-buffers-transcoder acquired)
          ;; `:scale` (default 1) supersamples the raster only -- the SVG is laid out at the
          ;; logical :width/:height but rasterized to scale-times more pixels.
          scale                        (:scale *chart-size* 1)
          render-width                 (float (or (some-> (:width *chart-size*) (* scale)) *svg-render-width*))
          render-height                (some-> (or (some-> (:height *chart-size*) (* scale)) *svg-render-height*) float)]
      (.addTranscodingHint transcoder PNGTranscoder/KEY_WIDTH render-width)
      (when render-height
        (.addTranscodingHint transcoder PNGTranscoder/KEY_HEIGHT render-height))
      (when *svg-background-color*
        (.addTranscodingHint transcoder PNGTranscoder/KEY_BACKGROUND_COLOR *svg-background-color*))
      (try
        (.transcode transcoder in out)
        (finally
          ;; Return the borrowed buffer to the pool. Guarded so a release failure can't mask a transcode error.
          (try (image-buffer/release @acquired) (catch Throwable _)))))
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
  "Clojure entrypoint to render javascript visualizations. This function is dynamic only for testing purposes.
   `custom-viz-bundles` is an optional seq of `{:identifier str :source str}` maps for custom
   visualization plugins. When present, rendering runs in a sandboxed UNTRUSTED isolate (the plugin code is
   untrusted third-party JS); built-in charts keep using the fast pooled context."
  [cards-with-data dashcard-viz-settings custom-viz-bundles]
  (let [options     (json/encode (cond-> {:applicationColors (appearance/application-colors)
                                          :startOfWeek       (lib-be/start-of-week)
                                          :customFormatting  (appearance/custom-formatting)
                                          :tokenFeatures     (premium-features/token-features)}
                                   *chart-size*
                                   (assoc :width (:width *chart-size*)
                                          :height (:height *chart-size*)
                                          :fitWithinBounds (boolean (:fit-within? *chart-size*)))))
        custom-viz? (seq custom-viz-bundles)
        ids         (mapv :identifier custom-viz-bundles)
        run         (fn [context]
                      (when custom-viz?
                        ;; initialize_context applies EE overrides so the custom-viz registry is active
                        ;; before we register plugins; built-in charts don't need it (RenderChart handles setup).
                        (let [start (System/nanoTime)]
                          (js.engine/execute-fn-name context "initialize_context" options)
                          (doseq [{:keys [identifier source]} custom-viz-bundles]
                            (js.engine/load-js-string context source (str "custom-viz-" identifier ".js"))
                            (js.engine/execute-fn-name context "register_custom_viz_plugin" identifier))
                          (log/debugf "custom-viz: registered plugin(s) %s in %.0fms"
                                      ids (/ (- (System/nanoTime) start) 1e6))))
                      (let [start  (System/nanoTime)
                            result (.asString (js.engine/execute-fn-name context "javascript_visualization"
                                                                         (json/encode cards-with-data)
                                                                         (json/encode dashcard-viz-settings)
                                                                         options))]
                        ;; Logged for both paths so isolate vs in-process execute time is directly comparable.
                        (log/debugf "%s: executed javascript_visualization%s in %.0fms (output %d chars)"
                                    (if custom-viz? "custom-viz" "static-viz")
                                    (if custom-viz? (str " for " ids) "")
                                    (/ (- (System/nanoTime) start) 1e6) (count result))
                        result))
        response    (if custom-viz?
                      (let [start (System/nanoTime)]
                        (log/infof "custom-viz: static-rendering plugin(s) %s" ids)
                        (u/prog1 (with-untrusted-static-viz-context context (run context))
                          (log/infof "custom-viz: static-rendered %s in %.0fms (incl. context acquire/generation)"
                                     ids (/ (- (System/nanoTime) start) 1e6))))
                      (with-static-viz-context context (run context)))]
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
