(ns metabase-enterprise.metabot-v3.agent.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]))

(deftest initialize-test
  (testing "initializes memory with messages and state"
    (let [messages [{:role :user :content "Hello"}]
          state {:queries {} :charts {}}
          mem (memory/initialize messages state)]
      (is (= messages (:input-messages mem)))
      (is (= state (:state mem)))
      (is (= [] (:steps-taken mem)))))

  (testing "initializes with empty state when nil"
    (let [messages [{:role :user :content "Hello"}]
          mem (memory/initialize messages nil)]
      (is (= {} (:state mem))))))

(deftest add-step-test
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

(deftest get-state-test
  (testing "retrieves state from memory"
    (let [state {:queries {"q1" {:id "q1"}} :charts {}}
          mem (memory/initialize [] state)]
      (is (= state (memory/get-state mem))))))

(deftest update-state-test
  (testing "updates state with new values"
    (let [mem (memory/initialize [] {:queries {}})
          mem' (memory/update-state mem {:charts {"c1" {:id "c1"}}})]
      (is (= {:queries {} :charts {"c1" {:id "c1"}}}
             (memory/get-state mem')))))

  (testing "merges state updates"
    (let [mem (memory/initialize [] {:queries {"q1" {:id "q1"}}})
          mem' (memory/update-state mem {:charts {"c1" {:id "c1"}}})]
      (is (= {:queries {"q1" {:id "q1"}} :charts {"c1" {:id "c1"}}}
             (memory/get-state mem'))))))

(deftest get-steps-test
  (testing "retrieves all steps"
    (let [parts1 [{:type :tool-input}]
          parts2 [{:type :text}]
          mem (-> (memory/initialize [] {})
                  (memory/add-step parts1)
                  (memory/add-step parts2))]
      (is (= 2 (count (memory/get-steps mem))))
      (is (= parts1 (-> mem memory/get-steps first :parts)))
      (is (= parts2 (-> mem memory/get-steps second :parts))))))

(deftest get-input-messages-test
  (testing "retrieves input messages"
    (let [messages [{:role :user :content "Hello"}
                    {:role :assistant :content "Hi"}]
          mem (memory/initialize messages {})]
      (is (= messages (memory/get-input-messages mem))))))

(deftest iteration-count-test
  (testing "counts number of steps"
    (let [mem (-> (memory/initialize [] {})
                  (memory/add-step [{:type :tool-input}])
                  (memory/add-step [{:type :text}])
                  (memory/add-step [{:type :tool-input}]))]
      (is (= 3 (memory/iteration-count mem)))))

  (testing "returns 0 for new memory"
    (let [mem (memory/initialize [] {})]
      (is (= 0 (memory/iteration-count mem))))))
