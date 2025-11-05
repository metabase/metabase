(ns metabase.channel.impl.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.impl.util :as util]))

(deftest remove-inline-parameters-test
  (testing "remove-inline-parameters function"
    (let [dashboard-parts [{:id "d1" :inline_parameters [{:id "81cd957"} {:id "a2f983b"}]}
                           {:id "d2" :inline_parameters [{:id "b4c1a7e"}]}]
          parameters [{:id "81cd957" :name "Param1"}
                      {:id "a2f983b" :name "Param2"}
                      {:id "b4c1a7e" :name "Param3"}
                      {:id "e7fa913" :name "Param4"}]
          result (util/remove-inline-parameters parameters dashboard-parts)]
      (is (= [{:id "e7fa913" :name "Param4"}] result)))))
