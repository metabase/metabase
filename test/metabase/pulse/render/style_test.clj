(ns metabase.pulse.render.style-test
  (:require [clojure.test :refer :all]
            [metabase.pulse.render.style :as style]))

(deftest filter-out-nil-test
  (testing "`style` should filter out nil values"
    (is (= ""
           (style/style {:a nil})))

    (is (= "a: 0; c: 2;"
           (style/style {:a 0, :b nil, :c 2, :d ""})))))
