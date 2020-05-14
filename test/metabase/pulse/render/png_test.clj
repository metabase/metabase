(ns metabase.pulse.render.png-test
  (:require [metabase.pulse.render.png :as png]
            [clojure.test :refer :all]))

(deftest register-fonts-test
  (testing "Under normal circumstances, font registration should work as expected"
    (is (= nil
           (#'png/register-fonts-if-needed!)))))
