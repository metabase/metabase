(ns metabase.metabot.models.metabot-message-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.config.core :as config]
   [metabase.events.test-util :as events.tu]
   [metabase.metabot.models.metabot-message :as metabot-message]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest after-select-migrates-v1-data-test
  (mt/with-temp [:model/MetabotConversation conv {}
                 :model/MetabotMessage      msg  {:conversation_id (:id conv)
                                                  :role            "user"
                                                  :data            [{:role "user" :content "hi"}]
                                                  :data_version    1}]
    (let [row (t2/select-one :model/MetabotMessage :id (:id msg))]
      (testing "v1 data is converted to v2 parts on read"
        (is (= [{:type "text" :text "hi"}] (:data row))))
      (testing "the in-memory data_version reflects the converted format"
        (is (= 2 (:data_version row))))
      (testing "the stored row is untouched"
        (is (= 1 (:data_version (t2/query-one {:select [:data_version]
                                               :from   [:metabot_message]
                                               :where  [:= :id (:id msg)]}))))))))

(deftest after-select-migrates-v1-tool-results-test
  (let [result {:output            "Created query q1."
                :structured-output {:result-type   "query"
                                    :query-id      "q1"
                                    :query-content "SELECT * FROM ORDERS"
                                    :database      1
                                    :result-columns ["ID" "TOTAL"]}
                :data-parts        [{:type "data" :data-type "navigate_to" :data "/question#abc"}]
                :resources         [{:uri "metabase://table/1" :content "<table/>"}]}]
    (mt/with-temp [:model/MetabotConversation conv {}
                   :model/MetabotMessage      msg  {:conversation_id (:id conv)
                                                    :role            "assistant"
                                                    :data            [{:type "tool-input" :id "tc1" :function "create_sql_query"
                                                                       :arguments {:sql "SELECT * FROM ORDERS"}}
                                                                      {:type "tool-output" :id "tc1" :function "create_sql_query"
                                                                       :result result :error nil :duration-ms 12}
                                                                      {:type "text" :id "t1" :text "Here it is."}]
                                                    :data_version    1}]
      (let [row (t2/select-one :model/MetabotMessage :id (:id msg))]
        (testing "a v1 native tool result migrates on read, carried verbatim as the v2 tool part's output"
          (is (= [{:type       "tool-create_sql_query"
                   :toolCallId "tc1"
                   :state      "output-available"
                   :input      {:sql "SELECT * FROM ORDERS"}
                   :output     result}
                  {:type "text" :text "Here it is."}]
                 (:data row)))
          (is (= 2 (:data_version row))))))))

(deftest after-select-passes-v2-data-through-test
  (mt/with-temp [:model/MetabotConversation conv {}
                 :model/MetabotMessage      msg  {:conversation_id (:id conv)
                                                  :data            [{:type "text" :text "already v2"}]
                                                  :data_version    2}]
    (let [row (t2/select-one :model/MetabotMessage :id (:id msg))]
      (is (= [{:type "text" :text "already v2"}] (:data row)))
      (is (= 2 (:data_version row))))))

(deftest after-select-survives-unmigratable-data-test
  (mt/with-temp [:model/MetabotConversation conv {}
                 :model/MetabotMessage      msg  {:conversation_id (:id conv)
                                                  :data            [{:role "assistant" :garbage true}]
                                                  :data_version    1}]
    (let [row (t2/select-one :model/MetabotMessage :id (:id msg))]
      (testing "unrecognized v1 shapes log and pass through unchanged"
        (is (= [{:role "assistant" :garbage true}] (:data row)))
        (is (= 1 (:data_version row)))))))

(deftest after-select-tolerates-narrow-column-lists-test
  (mt/with-temp [:model/MetabotConversation conv {}
                 :model/MetabotMessage      msg  {:conversation_id (:id conv)
                                                  :data            [{:role "user" :content "hi"}]
                                                  :data_version    1}]
    (testing "selecting without data_version leaves data unconverted rather than throwing"
      (let [row (t2/select-one [:model/MetabotMessage :id :data] :id (:id msg))]
        (is (= [{:role "user" :content "hi"}] (:data row)))))))

(deftest after-select-revalidates-v2-data-in-dev-test
  (mt/with-temp [:model/MetabotConversation conv {}]
    (let [msg (with-redefs [config/is-test? false]
                (t2/insert-returning-instance! :model/MetabotMessage
                                               {:conversation_id (:id conv)
                                                :role            "assistant"
                                                :profile_id      "gpt-5"
                                                :total_tokens    0
                                                :data            [{:type "text"}]
                                                :data_version    2}))]
      (testing "outside dev, malformed v2 rows are re-served without validation"
        (is (= [{:type "text"}] (:data (t2/select-one :model/MetabotMessage :id (:id msg))))))
      (testing "in dev, a malformed v2 row throws on read"
        (with-redefs [config/is-dev? true]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                #"Invalid metabot_message.data \(read\)"
                                (t2/select-one :model/MetabotMessage :id (:id msg)))))))))

(deftest data-is-checked-on-write-test
  (mt/with-temp [:model/MetabotConversation conv {}]
    (let [message {:conversation_id (:id conv) :role "assistant" :profile_id "gpt-5" :total_tokens 0}]
      (testing "insert of v2 data not in the at-rest format throws"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid metabot_message.data"
                              (t2/insert! :model/MetabotMessage (assoc message :data [{:type "text"}] :data_version 2)))))
      (testing "insert of v1 data is not checked against the v2 format"
        (mt/with-model-cleanup [:model/MetabotMessage]
          (is (some? (t2/insert-returning-pk! :model/MetabotMessage
                                              (assoc message :data [{:role "user" :content "hi"}] :data_version 1))))))
      (testing "update of the data to a value not in the at-rest format throws"
        (mt/with-temp [:model/MetabotMessage {id :id} (assoc message :data [] :data_version 2)]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid metabot_message.data"
                                (t2/update! :model/MetabotMessage :id id {:data [{:type "text"}]})))
          (is (pos? (t2/update! :model/MetabotMessage :id id {:data [{:type "text" :text "hi"}]}))))))))

(deftest create-with-different-columns-keeps-defaults-test
  (mt/with-temp [:model/MetabotConversation conv {}]
    (mt/with-model-cleanup [:model/MetabotMessage]
      (let [[plain explicit] (metabot-message/create-metabot-messages!
                              [{:conversation_id (:id conv) :profile_id "p" :total_tokens 0 :role :user :data [] :data_version 2}
                               {:conversation_id (:id conv) :profile_id "p" :total_tokens 0 :role :assistant :data [] :data_version 2 :finished false}])]
        (testing "rows come back in the order given"
          (is (= [:user :assistant] [(:role plain) (:role explicit)])))
        (testing "a row that leaves a column out keeps its default"
          (is (=? {:finished true}
                  (t2/query-one {:select [:finished] :from [:metabot_message] :where [:= :id (:id plain)]}))))
        (testing "a row that gives the column keeps its value"
          (is (=? {:finished false}
                  (t2/query-one {:select [:finished] :from [:metabot_message] :where [:= :id (:id explicit)]}))))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/MetabotConversation {conversation-id :id} {}]
    (mt/with-model-cleanup [:model/MetabotMessage]
      (let [row     (fn [finished?] {:conversation_id conversation-id :role "user" :profile_id "test" :data [] :data_version 2 :total_tokens 0 :finished finished?})
            create! (fn [n] (events.tu/statement-count! #(metabot-message/create-metabot-messages! (vec (repeat n (row false))))))
            mixed   (fn [n]
                      (mapv :id (metabot-message/create-metabot-messages! (vec (mapcat (fn [_] [(row true) (row false)]) (range n))))))]
        (testing "creating messages"
          (create! 1)
          (is (= (create! 2) (create! 6))))
        (testing "updating messages that are in different states"
          (let [counted (fn [ids]
                          (events.tu/statement-count!
                           #(metabot-message/update-metabot-messages! (mapv (fn [id] {:id id :finished true :total_tokens 7}) ids))))]
            (counted (mixed 1))
            (is (= (counted (mixed 1)) (counted (mixed 3))))))
        (testing "soft-deleting messages, some of them already soft-deleted by the same user"
          (let [counted (fn [n]
                          (let [ids (mixed n)]
                            (metabot-message/soft-delete-metabot-messages! {:id (vec (take n ids))} (mt/user->id :rasta))
                            (events.tu/statement-count!
                             #(metabot-message/soft-delete-metabot-messages! {:id ids} (mt/user->id :rasta)))))]
            (counted 1)
            (is (= (counted 1) (counted 3)))))))))
