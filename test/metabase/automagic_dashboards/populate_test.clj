(ns metabase.automagic-dashboards.populate-test
  (:require [expectations :refer :all]
            [metabase.automagic-dashboards.populate :as populate]))

(expect
  [{:row 0 :col 0}
   {:row 0 :col (deref #'populate/card-width)}
   {:row (deref #'populate/card-height) :col (deref #'populate/card-width)}]
  (map #'populate/next-card-position [0
                                      1
                                      (inc (/ (deref #'populate/grid-width)
                                              (deref #'populate/card-width)))]))
