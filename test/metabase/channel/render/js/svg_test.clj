(ns metabase.channel.render.js.svg-test
  "Testing of the svgs produced by the graal js engine and the static-viz bundle. The model is

  query-results -> js engine with bundle -> svg-string -> svg png renderer

  the svg png renderer does not understand nested html elements so we ensure that there are no divs, spans, etc in the
  resulting svg."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.common :as js.common]
   [metabase.channel.render.js.graal :as js.graal]
   [metabase.channel.render.js.svg :as js.svg])
  (:import
   (org.apache.batik.anim.dom SVGOMDocument)
   (org.graalvm.polyglot Context Engine HostAccess)
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

(deftest ^:parallel normalize-colors-for-batik-test
  (let [normalize #'js.svg/normalize-colors-for-batik]
    (testing "a fully opaque hsl() fill becomes hex with no opacity attribute"
      (is (= "<rect fill=\"#FFFFFF\" />"
             (normalize "<rect fill=\"hsl(0, 0%, 100%)\" />"))))
    (testing "a translucent hsla() fill becomes hex plus a fill-opacity attribute (the custom-viz calendar-heatmap case)"
      (is (= "<rect fill=\"#FFFFFF\" fill-opacity=\"0.95\" />"
             (normalize "<rect fill=\"hsla(0, 0%, 100%, 0.95)\" />"))))
    (testing "a translucent rgba() stroke becomes hex plus a stroke-opacity attribute"
      (is (= "<path stroke=\"#0A1F22\" stroke-opacity=\"0.84\" />"
             (normalize "<path stroke=\"rgba(10, 31, 34, 0.84)\" />"))))
    (testing "Batik-safe hex, named, and rgb() colors are left untouched"
      (let [svg "<rect fill=\"#0a1f22\" /><rect fill=\"black\" stroke=\"rgb(1, 2, 3)\" />"]
        (is (= svg (normalize svg)))))))

(deftest ^:parallel parse-svg-string-normalizes-unsafe-colors-test
  (testing "parse-svg-string rewrites Batik-incompatible hsla() colors so transcoding won't throw"
    (let [^SVGOMDocument document (parse-svg
                                   "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect fill=\"hsla(0, 0%, 100%, 0.95)\"></rect></svg>")
          ^Element rect           (.. document (getDocumentElement) (getChildNodes) (item 0))]
      (is (= "#FFFFFF" (.getAttribute rect "fill")))
      (is (= "0.95" (.getAttribute rect "fill-opacity"))))))

(deftest ^:parallel parse-svg-sanitizes-characters-test
  (testing "Characters discouraged or not permitted by the xml 1.0 specification are removed. (#"
    (#'js.svg/parse-svg-string
     "<svg xmlns=\"http://www.w3.org/2000/svg\">\u001F</svg>")))

(defn- context-on-engine ^Context [^Engine engine]
  (.. (Context/newBuilder (into-array String ["js"]))
      (engine engine)
      (allowHostAccess HostAccess/NONE)
      (build)))

(defn- load-bundle-ms
  "Load the static-viz bundle into a fresh context on `engine`, returning the wall-clock load time in ms."
  ^double [^Engine engine]
  (let [^Context ctx (context-on-engine engine)
        start        (System/nanoTime)]
    (try
      (js.graal/load-resource ctx js.common/bundle-resource-path)
      (/ (- (System/nanoTime) start) 1e6)
      (finally (.close ctx true)))))

(deftest ^:mb/slow shared-engine-parsed-source-cache-speeds-bundle-reloads-test
  (testing "reloading the ~16MB static-viz bundle on the same engine reuses its parsed-source cache"
    ;; Same Engine-level cache that keeps the untrusted-plugin isolate's per-render plugin-bundle reloads cheap
    ;; (see js.graal/do-with-untrusted-static-viz-context). Tested on the plain engine because an UNTRUSTED
    ;; engine would need the full sandbox context builder; the parsed-source cache is identical for both.
    ;;
    ;; Pre-warm the host JVM's JS parser with a throwaway engine so the measured gap reflects the engine's
    ;; parsed-source cache, not one-time JIT warmup.
    (let [^Engine warmup (#'js.graal/create-engine)]
      (load-bundle-ms warmup)
      (load-bundle-ms warmup)
      (.close warmup))
    (let [^Engine engine (#'js.graal/create-engine)
          cold           (load-bundle-ms engine)          ; first parse of the bundle on this engine: cold
          warm           (min (load-bundle-ms engine)     ; reloads on the same engine hit the cache
                              (load-bundle-ms engine))]
      (.close engine)
      (testing (format "(cold=%.0fms warm=%.0fms)" cold warm)
        ;; Observed ~2x cheaper; assert a generous 25% floor so the timing test stays robust to noise.
        (is (< warm (* 0.75 cold)))))))

(deftest ^:mb/slow untrusted-context-loads-slim-bundle-test
  (testing "the untrusted isolate pool loads the slim custom-viz bundle, exposing the interface surface it needs"
    (js.graal/do-with-untrusted-static-viz-context
     (fn [^Context ctx]
       (doseq [fn-name ["renderChartJSON" "initializeContextJSON" "registerCustomVizPlugin"]]
         (is (= "function" (.asString (.eval ctx "js" (str "typeof MetabaseStaticViz." fn-name))))
             (str "slim bundle should expose MetabaseStaticViz." fn-name)))
       ;; getCellBackgroundColorsJSON is only exported by the full bundle (only the trusted pool's table
       ;; rendering calls it), so its absence proves the slim bundle is what got loaded here.
       (is (= "undefined" (.asString (.eval ctx "js" "typeof MetabaseStaticViz.getCellBackgroundColorsJSON")))
           "the full static-viz bundle (getCellBackgroundColorsJSON present) leaked into the untrusted pool")))))

(deftest ^:mb/slow untrusted-static-viz-context-is-pooled-test
  (testing "pooled untrusted isolate contexts are reused across renders (bundle parsed once, not per render)"
    ;; Regression guard: the previous fresh-context-per-render path re-parsed the ~16MB bundle every render
    ;; (a 55s pulse-test regression). The pool loads the bundle once and hands the same context to each render.
    ;; Tests run in :test mode (config/is-dev? false), so do-with-untrusted... takes the pooled branch.
    (let [ids (atom [])]
      (dotimes [_ 3]
        (js.graal/do-with-untrusted-static-viz-context
         (fn [^Context ctx] (swap! ids conj (System/identityHashCode ctx)))))
      (is (= 1 (count (distinct @ids)))
          "the same pooled isolate context should serve every render"))))
