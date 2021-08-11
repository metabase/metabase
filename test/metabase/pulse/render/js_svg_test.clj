(ns metabase.pulse.render.js-svg-test
  "Testing of the svgs produced by the graal js engine and the static-viz bundle. The model is

  query-results -> js engine with bundle -> svg-string -> svg png renderer

  the svg png renderer does not understand nested html elements so we ensure that there are no divs, spans, etc in the
  resulting svg."
  (:require [clojure.set :as set]
            [clojure.test :refer :all]
            [metabase.pulse.render.js-engine :as js]
            [metabase.pulse.render.js-svg :as js-svg])
  (:import org.apache.batik.anim.dom.SVGOMDocument
           [org.graalvm.polyglot Context Value]
           [org.w3c.dom Element Node]))

(def parse-svg #'js-svg/parse-svg-string)

(def ^Context context (delay (#'js-svg/load-viz-bundle (js/make-context))))

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

(deftest timelineseries-line-test
  (let [rows   [[#t "2020" 2]
                [#t "2021" 3]]
        labels {:left "count" :bottom "year"}]
    (testing "It returns bytes"
      (let [svg-bytes (js-svg/timelineseries-line rows labels)]
        (is (bytes? svg-bytes))))
    (let [svg-string (.asString ^Value (js/execute-fn-name @context "timeseries_line" rows labels))]
      (validate-svg-string :timelineseries-line svg-string))))

(deftest timelineseries-bar-test
  (let [rows   [[#t "2020" 2]
                [#t "2021" 3]]
        labels {:left "count" :bottom "year"}]
    (testing "It returns bytes"
      (let [svg-bytes (js-svg/timelineseries-bar rows labels)]
        (is (bytes? svg-bytes))))
    (let [svg-string (.asString ^Value (js/execute-fn-name @context "timeseries_bar" rows labels))]
      (validate-svg-string :timelineseries-bar svg-string))))

(deftest categorical-donut-test
  (let [rows [["apples" 2]
              ["bananas" 3]]
        colors {"apples" "red" "bananas" "yellow"}]
    (testing "It returns bytes"
      (let [svg-bytes (js-svg/categorical-donut rows colors)]
        (is (bytes? svg-bytes))))
    (let [svg-string (.asString ^Value (js/execute-fn-name @context "categorical_donut" rows (seq colors)))]
      (validate-svg-string :categorical/donut svg-string))))
