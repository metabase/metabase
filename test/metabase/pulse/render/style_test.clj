(ns metabase.pulse.render.style-test
  (:require [expectations :refer [expect]]
            [metabase.pulse.render.style :as style]))

;; `style` should filter out nil values
(expect
  ""
  (style/style {:a nil}))

(expect
  "a: 0; c: 2;"
  (style/style {:a 0, :b nil, :c 2, :d ""}))
