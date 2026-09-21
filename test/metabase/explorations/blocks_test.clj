(ns metabase.explorations.blocks-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.blocks :as explorations.blocks]))

(deftest ^:parallel blocks-tree-renders-legacy-dimension-anchored-rows-test
  (testing "an ExplorationBlock row persisted before dimension-anchored blocks were removed
            (`:type \"dimension\"`, several metrics) still renders — as a plain metric-headed
            block — rather than crashing the read path"
    (let [block   {:id         1
                   :type       "dimension"
                   :metrics    [{:card_id 10} {:card_id 11}]
                   :dimensions [{:dimension-id "d1" :display-name "Region"}]}
          pages   [{:id 5 :exploration_block_id 1 :card_id 10 :dimension_id "d1"
                    :query_type "default" :starred false :hidden false}
                   {:id 6 :exploration_block_id 1 :card_id 11 :dimension_id "d1"
                    :query_type "default" :starred false :hidden false}]
          queries [{:id 100 :page_id 5 :dimension_name "Region"}
                   {:id 101 :page_id 6 :dimension_name "Region"}]
          [node]  (explorations.blocks/blocks-tree [block] pages
                                                   {10 "Revenue" 11 "Signups"} queries)]
      (is (= "Revenue" (:name node)) "heading falls back to the first metric's name")
      (is (not (contains? node :type)) "the read tree no longer reports a block type")
      (is (= ["Region" "Region"] (map :name (:pages node))))
      (is (= #{"Revenue by Region" "Signups by Region"}
             (set (map :long_name (:pages node))))))))
