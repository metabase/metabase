(ns metabase.channel.render.js.svg-test
  "Testing of the svgs produced by the graal js engine and the static-viz bundle. The model is

  query-results -> js engine with bundle -> svg-string -> svg png renderer

  the svg png renderer does not understand nested html elements so we ensure that there are no divs, spans, etc in the
  resulting svg."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.graal :as js.graal]
   [metabase.channel.render.js.svg :as js.svg])
  (:import
   (org.apache.batik.anim.dom SVGOMDocument)
   (org.graalvm.polyglot Context)
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

(deftest untrusted-plugin-context-loads-slim-bundle-test
  (testing "the plugin isolate pool loads the slim custom-viz bundle, exposing the interface surface it needs"
    (js.graal/do-with-untrusted-plugin-context
     (fn [^Context ctx]
       (doseq [fn-name ["renderChartJSON" "initializeContextJSON" "registerCustomVizPlugin"]]
         (is (= "function" (.asString (.eval ctx "js" (str "typeof MetabaseStaticViz." fn-name))))
             (str "slim bundle should expose MetabaseStaticViz." fn-name)))
       ;; getCellBackgroundColorsJSON is only exported by the full bundle (only the builtin pool's table
       ;; rendering calls it), so its absence proves the slim bundle is what got loaded here.
       (is (= "undefined" (.asString (.eval ctx "js" "typeof MetabaseStaticViz.getCellBackgroundColorsJSON")))
           "the full static-viz bundle (getCellBackgroundColorsJSON present) leaked into the plugin pool")))))

(deftest untrusted-builtin-context-loads-full-bundle-test
  (testing "the builtin isolate pool loads the full static-viz bundle, including the table-rendering surface"
    (js.graal/do-with-untrusted-builtin-context
     (fn [^Context ctx]
       (doseq [fn-name ["renderChartJSON" "getCellBackgroundColorsJSON"]]
         (is (= "function" (.asString (.eval ctx "js" (str "typeof MetabaseStaticViz." fn-name))))
             (str "full bundle should expose MetabaseStaticViz." fn-name)))))))

(deftest builtin-and-plugin-pools-are-taint-separated-test
  (testing "globals set in a plugin context are invisible to builtin contexts (isolated realms on the shared engine)"
    (js.graal/do-with-untrusted-plugin-context
     (fn [^Context ctx]
       (.eval ctx "js" "globalThis.__taint_marker = 'tainted'")))
    (js.graal/do-with-untrusted-builtin-context
     (fn [^Context ctx]
       (is (= "undefined" (.asString (.eval ctx "js" "typeof globalThis.__taint_marker")))
           "plugin-context globals must not leak into builtin contexts")))))

(deftest untrusted-plugin-context-is-pooled-test
  (testing "pooled untrusted isolate contexts are reused across renders (bundle parsed once, not per render)"
    (let [context-identity (fn []
                             (js.graal/do-with-untrusted-plugin-context
                              (fn [^Context ctx] (System/identityHashCode ctx))))]
      (is (= (context-identity) (context-identity))
          "the same pooled isolate context should serve every render"))))

(deftest ^:parallel parse-svg-sanitizes-characters-test
  (testing "Characters discouraged or not permitted by the xml 1.0 specification are removed. (#"
    (#'js.svg/parse-svg-string
     "<svg xmlns=\"http://www.w3.org/2000/svg\">\u001F</svg>")))
