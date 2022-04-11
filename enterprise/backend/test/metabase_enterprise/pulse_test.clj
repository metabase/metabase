(ns metabase-enterprise.pulse-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.pulse :as pulse]
            [metabase.pulse.interface :as i]))

(deftest parameters-test
  (is (= [{:id "1" :v "a"}
          {:id "2" :v "b"}
          {:id "3" :v "yes"}]
         (i/the-parameters pulse/parameters-impl
                           {:parameters [{:id "1" :v "a"} {:id "2" :v "b"}]}
                           {:parameters [{:id "1" :v "no, since it's trumped by the pulse"} {:id "3" :v "yes"}]}))))
