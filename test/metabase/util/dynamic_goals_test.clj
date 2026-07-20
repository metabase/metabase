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

(def ^:private referenced-cards
  {"1" {:status "completed"
        :data   {:cols [{:name "count"} {:name "total"}]
                 :rows [[3 100]]}}
   "2" {:status "failed"
        :error  "boom"}})

(defn- unresolved-reason [goal refs]
  (try
    (u.dynamic-goals/resolve-goal-value goal refs)
    nil
    (catch clojure.lang.ExceptionInfo e
      (:reason (ex-data e)))))

(deftest ^:parallel resolve-goal-value-passthrough-test
  (are [goal] (= goal (u.dynamic-goals/resolve-goal-value goal referenced-cards))
    5
    2.5
    "self-column"
    nil))

(deftest ^:parallel resolve-goal-value-test
  (testing "card ref resolves to the referenced column's first-row value"
    (is (= 100 (u.dynamic-goals/resolve-goal-value {:card_id 1 :column "total"} referenced-cards)))
    (is (= 3 (u.dynamic-goals/resolve-goal-value {:card_id 1 :column "count"} referenced-cards))))
  (testing "keyword statuses are accepted too"
    (is (= 100 (u.dynamic-goals/resolve-goal-value
                {:card_id 1 :column "total"}
                (update-in referenced-cards ["1" :status] keyword))))))

(deftest ^:parallel resolve-goal-value-unresolved-test
  (testing ":query-failed"
    (are [refs] (= :query-failed (unresolved-reason {:card_id 1 :column "total"} refs))
      nil
      (dissoc referenced-cards "1")
      {"1" (get referenced-cards "2")}))
  (testing ":column-not-found"
    (is (= :column-not-found (unresolved-reason {:card_id 1 :column "nope"} referenced-cards))))
  (testing ":not-a-number"
    (are [value] (= :not-a-number
                    (unresolved-reason {:card_id 1 :column "total"}
                                       (assoc-in referenced-cards ["1" :data :rows] [[3 value]])))
      nil
      "a string"
      ##Inf))
  (testing ":not-a-number when the referenced result has no rows"
    (is (= :not-a-number (unresolved-reason {:card_id 1 :column "total"}
                                            (assoc-in referenced-cards ["1" :data :rows] []))))))

(deftest ^:parallel resolve-dynamic-goals-test
  (testing "substitutes referenced values across all goal-bearing settings"
    (is (= {:graph.goal_value 100
            :progress.goal    3
            :gauge.segments   [{:min 0 :max 100 :color "#fff"}]
            :scalar.segments  [{:min 3 :max "self-col"}]}
           (u.dynamic-goals/resolve-dynamic-goals
            {:graph.goal_value {:card_id 1 :column "total"}
             :progress.goal    {:card_id 1 :column "count"}
             :gauge.segments   [{:min 0 :max {:card_id 1 :column "total"} :color "#fff"}]
             :scalar.segments  [{:min {:card_id 1 :column "count"} :max "self-col"}]}
            referenced-cards))))
  (testing "no-op when settings hold no refs"
    (let [viz {:graph.goal_value 5 :gauge.segments [{:min 0 :max 10}]}]
      (is (= viz (u.dynamic-goals/resolve-dynamic-goals viz nil))))))
