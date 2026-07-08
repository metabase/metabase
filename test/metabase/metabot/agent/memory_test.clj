(ns metabase.metabot.agent.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.agent.memory :as memory]))

(deftest ^:parallel initialize-test
  (testing "seeds the working state and starts an empty turn-state"
    (let [messages [{:role :user :content "Hello"}]
          state {:queries {"q1" {:id "q1"}} :charts {}}
          mem (memory/initialize messages state)]
      (is (= messages (:input-messages mem)))
      (is (= state (memory/get-state mem)))
      (is (= {} (:turn-state mem)))
      (is (= [] (:steps-taken mem)))))
  (testing "defaults the working state when nil"
    (let [mem (memory/initialize [{:role :user :content "Hello"}] nil)]
      (is (= {:queries {} :charts {} :todos [] :transforms {} :link-registry {}}
             (memory/get-state mem))))))

(deftest ^:parallel add-step-test
  (testing "adds step to memory"
    (let [mem (memory/initialize [] {})
          parts [{:type :text :text "Response"}
                 {:type :tool-input :function "search" :arguments {:query "test"}}]
          mem' (memory/add-step mem parts)]
      (is (= 1 (count (:steps-taken mem'))))
      (is (= parts (-> mem' :steps-taken first :parts)))))
  (testing "adds multiple steps"
    (let [mem (memory/initialize [] {})
          parts1 [{:type :tool-input :function "search"}]
          parts2 [{:type :text :text "Response"}]
          mem' (-> mem
                   (memory/add-step parts1)
                   (memory/add-step parts2))]
      (is (= 2 (count (:steps-taken mem'))))
      (is (= parts1 (-> mem' :steps-taken first :parts)))
      (is (= parts2 (-> mem' :steps-taken second :parts))))))

(deftest ^:parallel writers-update-state-and-turn-delta-test
  (testing "a writer applies to the working state and records the same into the turn delta"
    (let [mem  (memory/initialize [] {:queries {"q1" {:id "q1"}}})
          mem' (-> mem
                   (memory/set-query "q2" {:id "q2"})
                   (memory/set-todos [{:id "b"}]))]
      (testing "working state carries the seeded baseline plus this turn's writes"
        (is (= {:queries {"q1" {:id "q1"} "q2" {:id "q2"}} :todos [{:id "b"}]}
               (memory/get-state mem'))))
      (testing "turn delta carries only this turn's writes — not the seeded baseline"
        (is (= {:queries {"q2" {:id "q2"}} :todos [{:id "b"}]}
               (memory/turn-state mem'))))))
  (testing "turn-state is nil until this turn writes something"
    (let [mem (memory/initialize [] {:queries {"q1" {:id "q1"}}})]
      (is (nil? (memory/turn-state mem))))))

(deftest ^:parallel merge-states-test
  (testing "map entries merge; scalar/vector entries take the later value"
    (is (= {:queries {:q1 1 :q2 2} :todos [{:id "b"}]}
           (memory/merge-states {:queries {:q1 1} :todos [{:id "a"}]}
                                {:queries {:q2 2} :todos [{:id "b"}]})))))

(deftest ^:parallel get-steps-test
  (testing "retrieves all steps"
    (let [parts1 [{:type :tool-input}]
          parts2 [{:type :text}]
          mem (-> (memory/initialize [] {})
                  (memory/add-step parts1)
                  (memory/add-step parts2))]
      (is (= 2 (count (memory/get-steps mem))))
      (is (= parts1 (-> mem memory/get-steps first :parts)))
      (is (= parts2 (-> mem memory/get-steps second :parts))))))

(deftest ^:parallel get-input-messages-test
  (testing "retrieves input messages"
    (let [messages [{:role :user :content "Hello"}
                    {:role :assistant :content "Hi"}]
          mem (memory/initialize messages {})]
      (is (= messages (memory/get-input-messages mem))))))

(deftest ^:parallel iteration-count-test
  (testing "counts number of steps"
    (let [mem (-> (memory/initialize [] {})
                  (memory/add-step [{:type :tool-input}])
                  (memory/add-step [{:type :text}])
                  (memory/add-step [{:type :tool-input}]))]
      (is (= 3 (memory/iteration-count mem)))))
  (testing "returns 0 for new memory"
    (let [mem (memory/initialize [] {})]
      (is (= 0 (memory/iteration-count mem))))))
