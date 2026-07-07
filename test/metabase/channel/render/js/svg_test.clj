(ns metabase.channel.render.js.svg-test
  "Testing of the svgs produced by the graal js engine and the static-viz bundle. The model is

  query-results -> js engine with bundle -> svg-string -> svg png renderer

  the svg png renderer does not understand nested html elements so we ensure that there are no divs, spans, etc in the
  resulting svg."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.svg :as js.svg])
  (:import
   (org.apache.batik.anim.dom SVGOMDocument)
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
