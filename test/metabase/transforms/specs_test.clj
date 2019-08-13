(ns metabase.transforms.specs-test
  (:require [expectations :refer [expect]]
            [metabase.transforms.specs :as specs]
            [schema.core :as s]))

(expect
  ["foo"]
  (#'specs/extract-dimensions [:dimension "foo"]))

(expect
  ["foo"]
  (#'specs/extract-dimensions [:some-op 12 {:k [:dimension "foo"]}]))

(expect
  nil
  (#'specs/extract-dimensions nil))

(expect
  nil
  (#'specs/extract-dimensions [1 2 3]))


;; All specs should be valid YAML (the parser will raise an exception if not) and conforming to the schema.
(expect
  (every? (partial s/validate specs/TransformSpec) @specs/transform-specs))
