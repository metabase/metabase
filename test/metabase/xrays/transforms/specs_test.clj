(ns metabase.xrays.transforms.specs-test
  (:require
   [clojure.test :refer :all]
   [metabase.xrays.transforms.specs :as tf.specs]))

(deftest ^:parallel extract-dimensions-test
  (are [arg expected] (= expected
                         (#'tf.specs/extract-dimensions arg))
    [:dimension "foo"]                    ["foo"]
    [:some-op 12 {:k [:dimension "foo"]}] ["foo"]
    nil                                   nil
    [1 2 3]                               nil))

(deftest ^:parallel validate-yaml-test
  (testing "All specs should be valid YAML (the parser will raise an exception if not) and conforming to the schema."
    (is (malli= [:sequential {:min 1} tf.specs/TransformSpec]
                @tf.specs/transform-specs))))
