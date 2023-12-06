(ns ^:mb/once metabase.pulse.render.js-svg-test
  "Testing of the svgs produced by the graal js engine and the static-viz bundle. The model is

  query-results -> js engine with bundle -> svg-string -> svg png renderer

  the svg png renderer does not understand nested html elements so we ensure that there are no divs, spans, etc in the
  resulting svg."
  (:require
   [cheshire.core :as json]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.pulse.render.js-engine :as js]
   [metabase.pulse.render.js-svg :as js-svg])
  (:import
   (org.apache.batik.anim.dom SVGOMDocument)
   (org.graalvm.polyglot Context Value)
   (org.w3c.dom Element Node)))

(set! *warn-on-reflection* true)

(def parse-svg #'js-svg/parse-svg-string)

(use-fixtures :each
  (fn warn-possible-rebuild
    [thunk]
    (testing "[PRO TIP] If this test fails, you may need to rebuild the bundle with `yarn build-static-viz`\n"
      (thunk))))

(deftest post-process-test
  (let [svg   "<svg ><g><line/></g><g><rect/></g><g><circle/></g></svg>"
        nodes (atom [])]
    (#'js-svg/post-process (parse-svg svg)
                           (fn [^Node node] (swap! nodes conj (.getNodeName node))))
    (is (= ["svg" "g" "line" "g" "rect" "g" "circle"] @nodes))))

(deftest fix-fill-test
  (let [svg "<svg ><line x1=\"0\" y1=\"260\" x2=\"540\" y2=\"260\" fill=\"transparent\"></line></svg>"

        ^SVGOMDocument document (parse-svg svg)
        ^Element line           (..  document
                                     (getDocumentElement)
                                     (getChildNodes)
                                     (item 0))]
    (is (.hasAttribute line "fill"))
    (is (= (.getAttribute line "fill") "transparent"))
    ;; unfortunately these objects are mutable. It does return the line but want to emphasize that is works by
    ;; mutation
    (#'js-svg/fix-fill line)
    (is (not (.hasAttribute line "fill")))
    (is (.hasAttribute line "fill-opacity"))
    (is (= (.getAttribute line "fill-opacity") "0.0"))))

(def ^Context context (#'js-svg/context))

(defn document-tag-seq [^SVGOMDocument document]
  (map #(.getNodeName ^Node %)
       (tree-seq #(instance? Element %)
                 (fn [^Node node]
                   (let [children (.getChildNodes node)]
                     (reduce (fn [cs i] (conj cs (.item children i)))
                             [] (range (.getLength children)))))
                 (.getDocumentElement document))))

(defn normal-svg-elements [tag-set]
  (set/subset? #{"svg" "g"} tag-set))

(defn no-html-elements [tag-set]
  (= #{} (set/intersection #{"div" "span" "p"} tag-set)))

(defn validate-svg-string [chart svg-string]
  (let [tag-seq    (-> svg-string parse-svg document-tag-seq)
        tag-set    (set tag-seq)]
    (testing (str chart " String is valid")
      (is (string? svg-string) "Svg did not return a string"))
    (testing (str " String contains normal svg elements")
      (is (normal-svg-elements tag-set) "Did not contain normal svg elements #{svg g line}"))
    (testing (str chart "String cannot contain html elements as svg renderer errors")
      (is (no-html-elements tag-set) (str "Contained html elements: "
                                          (set/intersection #{"div" "span" "p"}))))))

(deftest waterfall-test
  (testing "Timeseries Waterfall renders"
    (let [rows           [[#t "2020" 2]
                          [#t "2021" 3]]
          labels         {:left "count" :bottom "year"}
          settings       (json/generate-string {:y {:prefix   "prefix"
                                                    :decimals 4}})
          waterfall-type (name :timeseries)]
      (testing "It returns bytes"
        (let [svg-bytes (js-svg/waterfall rows labels settings waterfall-type)]
          (is (bytes? svg-bytes))))
      (let [svg-string (.asString (js/execute-fn-name context "waterfall"
                                                      rows labels settings waterfall-type
                                                      (json/generate-string {})))]
        (testing "it returns a valid svg string (no html in it)"
          (validate-svg-string :timelineseries-waterfall svg-string)))))
  (testing "Categorical Waterfall renders"
    (let [rows           [["One" 20]
                          ["Two" 30]]
          labels         {:left "count" :bottom "process step"}
          settings       (json/generate-string {})
          waterfall-type (name :categorical)]
      (testing "It returns bytes"
        (let [svg-bytes (js-svg/waterfall rows labels settings waterfall-type)]
          (is (bytes? svg-bytes))))
      (let [svg-string (.asString (js/execute-fn-name context "waterfall"
                                                      rows labels settings waterfall-type
                                                      (json/generate-string {})))]
        (testing "it returns a valid svg string (no html in it)"
          (validate-svg-string :categorical-waterfall svg-string))))))

(deftest categorical-donut-test
  (let [rows [["apples" 2]
              ["bananas" 3]]
        colors {"apples" "red" "bananas" "yellow"}
        settings {:show_values true}]
    (testing "It returns bytes"
      (let [svg-bytes (js-svg/categorical-donut rows colors settings)]
        (is (bytes? svg-bytes))))
    (let [svg-string (.asString ^Value (js/execute-fn-name context "categorical_donut" rows (seq colors) (json/generate-string settings)))]
      (validate-svg-string :categorical/donut svg-string))))

(deftest progress-test
  (let [value    1234
        goal     1337
        settings {:color "#333333"}]
    (testing "It returns bytes"
      (let [svg-bytes (js-svg/progress value goal settings)]
        (is (bytes? svg-bytes))))
    (let [svg-string (.asString ^Value
                                (js/execute-fn-name
                                  context
                                  "progress"
                                  (json/generate-string {:value value :goal goal})
                                  (json/generate-string settings)
                                  (json/generate-string {})))]
      (validate-svg-string :progress svg-string))))
