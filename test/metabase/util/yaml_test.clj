(ns metabase.util.yaml-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io File StringReader)))

(set! *warn-on-reflection* true)

(defn- nested-structure
  "Builds a value nested `depth` levels deep, e.g. `(nested-structure 3)` => `[[[\"leaf\"]]]`.

  This mimics the deeply nested YAML produced by serializing MBQL expressions with many nested
  function calls (see #71257 / UXW-3770)."
  [depth]
  (-> (iterate vector "leaf")
      (nth depth)))

(deftest ^:parallel parse-string-allows-deep-nesting-test
  (testing "parse-string allows nesting deeper than SnakeYAML's default limit of 50 (#71257)"
    (let [deep (nested-structure 500)]
      (is (= deep
             (-> deep yaml/generate-string yaml/parse-string))
          "deeply nested YAML that Metabase can generate must round-trip back through parse-string")))
  (testing "callers may still tighten the nesting limit via :nesting-depth-limit"
    (is (thrown-with-msg? Exception #"Nesting Depth exceeded"
                          (-> (nested-structure 500)
                              yaml/generate-string
                              (yaml/parse-string :nesting-depth-limit 10))))))

(deftest ^:parallel from-file-allows-deep-nesting-test
  (testing "from-file allows nesting deeper than SnakeYAML's default limit (this is the serdes import path)"
    (let [deep      (nested-structure 500)
          ^File tmp (File/createTempFile "deep-yaml" ".yaml")]
      (try
        (spit tmp (yaml/generate-string deep))
        (is (= deep (yaml/from-file tmp)))
        (finally
          (.delete tmp))))))

(deftest ^:parallel parse-stream-allows-deep-nesting-test
  (testing "parse-stream allows nesting deeper than SnakeYAML's default limit"
    (let [deep (nested-structure 500)
          s    (yaml/generate-string deep)]
      (with-open [r (StringReader. s)]
        (is (= deep (yaml/parse-stream r)))))))
