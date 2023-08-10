(ns metabase.lib.join.strategy-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel join-strategy-test
  (let [query  lib.tu/query-with-join
        [join] (lib/joins query)]
    (testing "join without :strategy"
      (is (= :left-join
             (lib/raw-join-strategy join)))
      (is (= {:lib/type :option/join.strategy, :strategy :left-join, :default true}
             (lib/join-strategy join))))
    (testing "join with explicit :strategy"
      (let [join' (lib/with-join-strategy join :right-join)]
        (is (=? {:strategy :right-join}
                join'))
        (is (= :right-join
               (lib/raw-join-strategy join')))
        (is (= {:lib/type :option/join.strategy, :strategy :right-join}
               (lib/join-strategy join')))))))

(deftest ^:parallel with-join-strategy-test
  (are [strategy] (=? {:stages [{:joins [{:conditions [[:=
                                                        {}
                                                        [:field
                                                         {:join-alias (symbol "nil #_\"key is not present.\"")}
                                                         (meta/id :venues :category-id)]
                                                        [:field
                                                         {:join-alias "Categories"}
                                                         (meta/id :categories :id)]]]
                                          :strategy :right-join
                                          :alias "Categories"}]}]}
                      (-> lib.tu/venues-query
                          (lib/join (-> (lib/join-clause (meta/table-metadata :categories)
                                                         [(lib/=
                                                           (meta/field-metadata :venues :category-id)
                                                           (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                                        (lib/with-join-strategy strategy)))))
    :right-join
    {:lib/type :option/join.strategy, :strategy :right-join}))

(deftest ^:parallel available-join-strategies-test
  (is (= [{:lib/type :option/join.strategy, :strategy :left-join, :default true}
          {:lib/type :option/join.strategy, :strategy :right-join}
          {:lib/type :option/join.strategy, :strategy :inner-join}]
         (lib/available-join-strategies lib.tu/query-with-join))))

(deftest ^:parallel join-strategy-display-name-test
  (let [query lib.tu/query-with-join]
    (is (= ["Left outer join" "Right outer join" "Inner join"]
           (map (partial lib.metadata.calculation/display-name query)
                (lib/available-join-strategies query))))))

(deftest ^:parallel join-strategy-display-info-test
  (let [query lib.tu/query-with-join]
    (is (= [{:short-name "left-join", :display-name "Left outer join", :default true}
            {:short-name "right-join", :display-name "Right outer join"}
            {:short-name "inner-join", :display-name "Inner join"}]
           (map (partial lib.metadata.calculation/display-info query)
                (lib/available-join-strategies query))))))
