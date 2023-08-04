(ns metabase.transforms.specs-test
  (:require
   [clojure.test :refer :all]
   [metabase.transforms.specs :as tf.specs]
   #_{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.util.schema :as su]))

(deftest extract-dimensions-test
  (are [arg expected] (= expected
                         (#'tf.specs/extract-dimensions arg))
    [:dimension "foo"]                    ["foo"]
    [:some-op 12 {:k [:dimension "foo"]}] ["foo"]
    nil                                   nil
    [1 2 3]                               nil))

(deftest validate-yaml-test
  (testing "All specs should be valid YAML (the parser will raise an exception if not) and conforming to the schema."
    (is (schema= (su/non-empty [tf.specs/TransformSpec])
                 @tf.specs/transform-specs))))
