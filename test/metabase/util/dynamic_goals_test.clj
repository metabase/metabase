(ns metabase.util.dynamic-goals-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.dynamic-goals :as u.dynamic-goals]))

(def ^:private ref-a {:card_id 1 :column "total"})
(def ^:private ref-b {:card_id 2 :column "avg"})

(deftest ^:parallel card-ref-test
  (is (= ref-a (u.dynamic-goals/card-ref ref-a)))
  (is (= ref-a (u.dynamic-goals/card-ref (assoc ref-a :extra "ignored"))))
  (are [goal] (nil? (u.dynamic-goals/card-ref goal))
    5
    "column-name"
    nil
    {:card_id 1}
    {:column "total"}))

(deftest ^:parallel goal-values-test
  (testing "collects goal values across all goal-bearing settings"
    (is (= [5 ref-a 0 ref-b "col" 10]
           (u.dynamic-goals/goal-values
            {:graph.goal_value 5
             :gauge.segments   [{:min ref-a :max 0} {:min ref-b}]
             :scalar.segments  [{:min "col" :max 10}]
             :other.setting    ref-b}))))
  (testing "nil bounds and absent settings contribute nothing"
    (is (= [] (u.dynamic-goals/goal-values {})))
    (is (= [1] (u.dynamic-goals/goal-values {:gauge.segments [{:min nil :max 1}]})))))

(deftest ^:parallel update-goal-values-test
  (let [viz {:graph.goal_value ref-a
             :gauge.segments   [{:min 0 :max ref-b :color "#fff"} {:min nil :max 10}]
             :other.setting    ref-a}]
    (testing "rewrites every goal value, leaves everything else alone"
      (is (= {:graph.goal_value [:resolved ref-a]
              :gauge.segments   [{:min [:resolved 0] :max [:resolved ref-b] :color "#fff"}
                                 {:min nil :max [:resolved 10]}]
              :other.setting    ref-a}
             (u.dynamic-goals/update-goal-values viz (fn [goal] [:resolved goal])))))
    (testing "identity fn returns settings unchanged"
      (is (= viz (u.dynamic-goals/update-goal-values viz identity))))))
