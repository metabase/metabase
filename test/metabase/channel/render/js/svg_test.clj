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
   (org.graalvm.polyglot Context Engine)
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

(defn- load-custom-viz-bundle-ms
  "Load the slim custom-viz bundle into a fresh UNTRUSTED isolate context on `engine`, returning the
  wall-clock load time in ms."
  ^double [^Engine engine]
  (let [^Context ctx (js.graal/untrusted-plugin-context engine)
        start        (System/nanoTime)]
    (try
      (js.graal/load-resource ctx js.common/custom-viz-bundle-resource-path)
      (/ (- (System/nanoTime) start) 1e6)
      (finally (.close ctx true)))))

(deftest shared-engine-parsed-source-cache-speeds-bundle-reloads-test
  (testing "reloading the slim custom-viz bundle in fresh UNTRUSTED isolate contexts reuses the engine's parsed-source cache"
    (let [^Engine warmup (#'js.graal/new-untrusted-plugin-engine)]
      (try
        (load-custom-viz-bundle-ms warmup)
        (load-custom-viz-bundle-ms warmup)
        (finally (.close warmup))))
    (let [^Engine engine (#'js.graal/new-untrusted-plugin-engine)
          [cold warm]    (try
                           [(load-custom-viz-bundle-ms engine)          ; first parse on this engine: cold
                            (min (load-custom-viz-bundle-ms engine)     ; reloads on the same engine hit the cache
                                 (load-custom-viz-bundle-ms engine))]
                           (finally (.close engine)))]
      (testing (format "(cold=%.0fms warm=%.0fms)" cold warm)
        (is (< warm (* 0.75 cold)))))))

(deftest untrusted-context-loads-slim-bundle-test
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

(deftest untrusted-engine-ref-counted-lifecycle-test
  (testing "the shared untrusted isolate engine is ref-counted: created with the first context, closed with the last"
    (let [state   (:state @#'js.graal/shared-untrusted-plugin-engine)
          refs    #(get @state :refs 0)
          before  (refs)
          context (#'js.graal/generate-untrusted-context!)]
      (is (= (inc before) (refs)) "generating a context should bump the shared-engine ref count")
      (#'js.graal/destroy-untrusted-context! context)
      (is (= before (refs)) "destroying the context should drop its ref")
      (when (zero? before)
        (is (nil? @state) "the last destroy should close the engine and clear the shared state")))))

(deftest untrusted-static-viz-context-is-pooled-test
  (testing "pooled untrusted isolate contexts are reused across renders (bundle parsed once, not per render)"
    (let [ids (atom [])]
      (dotimes [_ 3]
        (js.graal/do-with-untrusted-static-viz-context
         (fn [^Context ctx] (swap! ids conj (System/identityHashCode ctx)))))
      (is (= 1 (count (distinct @ids)))
          "the same pooled isolate context should serve every render"))))

(deftest ^:parallel parse-svg-sanitizes-characters-test
  (testing "Characters discouraged or not permitted by the xml 1.0 specification are removed. (#"
    (#'js.svg/parse-svg-string
     "<svg xmlns=\"http://www.w3.org/2000/svg\">\u001F</svg>")))
