(ns metabase.feature-extraction.stl-test
  (:require [expectations :refer :all]
            [metabase.feature-extraction.stl :as stl]))

(def ^:private ts (mapv vector (range) (take 100 (cycle (range 10)))))

(expect
  true
  (every? (stl/decompose 10 ts) [:xs :ys :trend :residual :seasonal]))

(expect
  IllegalArgumentException
  (stl/decompose 100 ts))
