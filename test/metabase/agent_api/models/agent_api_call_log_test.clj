(ns metabase.agent-api.models.agent-api-call-log-test
  (:require
   [clojure.test :refer :all]
   [metabase.agent-api.models.agent-api-call-log :as agent-api-call-log]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- call-log-row []
  {:user_id       (mt/user->id :rasta)
   :tenant_id     nil
   :client_name   "test"
   :operation     "search"
   :status        "success"
   :duration_ms   10
   :error_message nil})

(deftest create-agent-api-call-logs!-rows-with-different-columns-test
  (testing "calls given different sets of columns are all stored, in order"
    (mt/with-model-cleanup [:model/AgentApiCallLog]
      (let [rows (agent-api-call-log/create-agent-api-call-logs! [(assoc (call-log-row) :ip_address "10.0.0.1")
                                                                  (call-log-row)])]
        (is (=? [{:ip_address "10.0.0.1"}
                 {:ip_address nil}]
                (map #(t2/select-one :model/AgentApiCallLog :id (:id %)) rows)))))))

(deftest create-agent-api-call-logs-statement-count-does-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/AgentApiCallLog]
    (let [counted (fn [n]
                    (events.tu/statement-count!
                     #(agent-api-call-log/create-agent-api-call-logs!
                       (mapv (fn [i] (cond-> (call-log-row) (odd? i) (assoc :ip_address "10.0.0.1"))) (range n)))))]
      (counted 1)
      (is (= (counted 2) (counted 6))))))
