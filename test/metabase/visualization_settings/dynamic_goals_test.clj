(ns metabase.visualization-settings.dynamic-goals-test
  (:require
   [clojure.test :refer :all]
   [metabase.visualization-settings.dynamic-goals :as dynamic-goals]))

(def ^:private ref-a {:id 1 :type "card" :column "total"})
(def ^:private ref-b {:id 2 :type "measure" :column "avg"})

(deftest ^:parallel goal-source-test
  (is (= ref-a (dynamic-goals/goal-source ref-a)))
  (is (= ref-a (dynamic-goals/goal-source (assoc ref-a :extra "ignored"))))
  (are [goal] (nil? (dynamic-goals/goal-source goal))
    5
    "column-name"
    nil
    {:id 1}
    {:id 1 :type "card"}
    {:column "total"}))

(deftest ^:parallel goal-values-test
  (testing "collects goal values across all goal-bearing settings"
    (is (= [5 ref-a 0 ref-b "col" 10]
           (dynamic-goals/goal-values
            {:graph.goal_value 5
             :gauge.segments   [{:min ref-a :max 0} {:min ref-b}]
             :scalar.segments  [{:min "col" :max 10}]
             :other.setting    ref-b}))))
  (testing "nil bounds and absent settings contribute nothing"
    (is (= [] (dynamic-goals/goal-values {})))
    (is (= [1] (dynamic-goals/goal-values {:gauge.segments [{:min nil :max 1}]})))))

(deftest ^:parallel update-goal-values-test
  (let [viz {:graph.goal_value ref-a
             :gauge.segments   [{:min 0 :max ref-b :color "#fff"} {:min nil :max 10}]
             :other.setting    ref-a}]
    (testing "rewrites every goal value, leaves everything else alone"
      (is (= {:graph.goal_value [:resolved ref-a]
              :gauge.segments   [{:min [:resolved 0] :max [:resolved ref-b] :color "#fff"}
                                 {:min nil :max [:resolved 10]}]
              :other.setting    ref-a}
             (dynamic-goals/update-goal-values viz (fn [goal] [:resolved goal])))))
    (testing "identity fn returns settings unchanged"
      (is (= viz (dynamic-goals/update-goal-values viz identity))))))

(def ^:private referenced-entities
  {"card"    {"1" {:status "completed"
                   :data   {:cols [{:name "count"} {:name "total"}]
                            :rows [[3 100]]}}
              "2" {:status "failed"
                   :error  "boom"}}
   "measure" {"1" {:status "completed"
                   :data   {:cols [{:name "avg"}]
                            :rows [[7]]}}}})

(defn- unresolved-reason [goal refs]
  (try
    (dynamic-goals/resolve-goal-value goal refs)
    nil
    (catch clojure.lang.ExceptionInfo e
      (:reason (ex-data e)))))

(deftest ^:parallel resolve-goal-value-passthrough-test
  (are [goal] (= goal (dynamic-goals/resolve-goal-value goal referenced-entities))
    5
    2.5
    "self-column"
    nil))

(deftest ^:parallel resolve-goal-value-test
  (testing "card ref resolves to the referenced column's first-row value"
    (is (= 100 (dynamic-goals/resolve-goal-value {:id 1 :type "card" :column "total"} referenced-entities)))
    (is (= 3 (dynamic-goals/resolve-goal-value {:id 1 :type "card" :column "count"} referenced-entities))))
  (testing "a measure ref resolves out of the measure sub-map, not the card one"
    (is (= 7 (dynamic-goals/resolve-goal-value {:id 1 :type "measure" :column "avg"} referenced-entities))))
  (testing "same id, different type, different value"
    (is (= 100 (dynamic-goals/resolve-goal-value {:id 1 :type "card" :column "total"} referenced-entities)))
    (is (= 7 (dynamic-goals/resolve-goal-value {:id 1 :type "measure" :column "avg"} referenced-entities))))
  (testing "a type with no results at all is :never-ran"
    (is (= :never-ran (unresolved-reason {:id 1 :type "dashboard" :column "avg"} referenced-entities))))
  (testing "keyword statuses are accepted too"
    (is (= 100 (dynamic-goals/resolve-goal-value
                {:id 1 :type "card" :column "total"}
                (update-in referenced-entities ["card" "1" :status] keyword))))))

(deftest ^:parallel resolve-goal-value-unresolved-test
  (testing ":never-ran when the entity has no entry at all"
    (are [refs] (= :never-ran (unresolved-reason {:id 1 :type "card" :column "total"} refs))
      nil
      (dissoc referenced-entities "card")
      (update referenced-entities "card" dissoc "1")))
  (testing ":query-failed"
    (are [refs] (= :query-failed (unresolved-reason {:id 1 :type "card" :column "total"} refs))
      {"card" {"1" (get-in referenced-entities ["card" "2"])}}
      {"card" {"1" {:status "completed"}}}))
  (testing ":column-not-found"
    (is (= :column-not-found (unresolved-reason {:id 1 :type "card" :column "nope"} referenced-entities))))
  (testing ":not-a-number"
    (are [value] (= :not-a-number
                    (unresolved-reason {:id 1 :type "card" :column "total"}
                                       (assoc-in referenced-entities ["card" "1" :data :rows] [[3 value]])))
      nil
      "a string"
      ##Inf))
  (testing ":not-a-number when the referenced result has no rows"
    (is (= :not-a-number (unresolved-reason {:id 1 :type "card" :column "total"}
                                            (assoc-in referenced-entities ["card" "1" :data :rows] []))))))

(deftest ^:parallel resolve-dynamic-goals-test
  (testing "substitutes referenced values across all goal-bearing settings"
    (is (= {:graph.show_goal  true
            :graph.goal_value 100
            :progress.goal    3
            :gauge.segments   [{:min 0 :max 100 :color "#fff"}]
            :scalar.segments  [{:min 3 :max "self-col"}]}
           (dynamic-goals/resolve-dynamic-goals
            {:graph.show_goal  true
             :graph.goal_value {:id 1 :type "card" :column "total"}
             :progress.goal    {:id 1 :type "card" :column "count"}
             :gauge.segments   [{:min 0 :max {:id 1 :type "card" :column "total"} :color "#fff"}]
             :scalar.segments  [{:min {:id 1 :type "card" :column "count"} :max "self-col"}]}
            referenced-entities))))
  (testing "no-op when settings hold no refs"
    (let [viz {:graph.show_goal true :graph.goal_value 5 :gauge.segments [{:min 0 :max 10}]}]
      (is (= viz (dynamic-goals/resolve-dynamic-goals viz nil))))))

(deftest ^:parallel resolve-dynamic-goals-hidden-goal-test
  (let [ref  {:id 2 :type "card" :column "total"}          ; entity 2 failed
        viz  {:graph.goal_value ref, :gauge.segments [{:min 0 :max {:id 1 :type "card" :column "total"}}]}]
    (testing "a goal line the chart doesn't show is left alone, even when its reference failed"
      (are [show-goal] (= (assoc viz :graph.show_goal show-goal :gauge.segments [{:min 0 :max 100}])
                          (dynamic-goals/resolve-dynamic-goals
                           (assoc viz :graph.show_goal show-goal) referenced-entities))
        false
        nil))
    (testing "and still throws once the goal line is shown"
      (is (thrown? clojure.lang.ExceptionInfo
                   (dynamic-goals/resolve-dynamic-goals
                    (assoc viz :graph.show_goal true) referenced-entities))))
    (testing "toggles can come from a separate effective-settings map"
      (is (= (assoc viz :gauge.segments [{:min 0 :max 100}])
             (dynamic-goals/resolve-dynamic-goals viz referenced-entities {:graph.show_goal false})))
      (is (thrown? clojure.lang.ExceptionInfo
                   (dynamic-goals/resolve-dynamic-goals viz referenced-entities {:graph.show_goal true}))))))

(deftest ^:parallel shown-goal-values-test
  (let [ref {:id 1 :type "card" :column "total"}]
    (testing "graph.goal_value only counts when graph.show_goal is on"
      (is (= [ref] (dynamic-goals/shown-goal-values {:graph.show_goal true :graph.goal_value ref})))
      (is (= [] (dynamic-goals/shown-goal-values {:graph.goal_value ref})))
      (is (= [] (dynamic-goals/shown-goal-values {:graph.show_goal false :graph.goal_value ref}))))
    (testing "untoggled settings are always in play"
      (is (= [ref] (dynamic-goals/shown-goal-values {:gauge.segments [{:max ref}]}))))))
