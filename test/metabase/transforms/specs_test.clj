(ns metabase.transforms.specs-test
  (:require [expectations :refer [expect]]
            [flatland.ordered.map :refer [ordered-map]]
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

(expect
  (into (ordered-map) [[:a []] [:b []] [:c [:a]] [:d [:a :b :c]] [:e [:d]]])
  (#'specs/dependencies-sort identity {:b []
                                       :c [:a]
                                       :e [:d]
                                       :d [:a :b :c]
                                       :a []}))

(expect
  nil
  (#'specs/dependencies-sort identity {}))

(expect
  nil
  (#'specs/dependencies-sort identity nil))

;; All specs should be valid YAML (the parser will raise an exception if not) and conforming to the schema.
(expect
  (every? (partial s/validate specs/TransformSpec) @specs/transform-specs))
