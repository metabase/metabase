(ns metabase.xrays.transforms.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.xrays.transforms.schema :as tf.specs]))

(deftest ^:parallel extract-dimensions-test
  (are [arg expected] (= expected
                         (#'tf.specs/extract-dimensions arg))
    [:dimension "foo"]                    ["foo"]
    [:some-op 12 {:k [:dimension "foo"]}] ["foo"]
    nil                                   nil
    [1 2 3]                               nil))
