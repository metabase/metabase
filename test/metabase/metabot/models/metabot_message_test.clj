(ns metabase.metabot.models.metabot-message-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.config.core :as config]
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
  (mt/with-temp [:model/MetabotConversation conv {}
                 :model/MetabotMessage      msg  {:conversation_id (:id conv)
                                                  ;; invalid v2: a text part missing :text
                                                  :data            [{:type "text"}]
                                                  :data_version    2}]
    (testing "outside dev, malformed v2 rows are re-served without validation"
      (is (= [{:type "text"}] (:data (t2/select-one :model/MetabotMessage :id (:id msg))))))
    (testing "in dev, a malformed v2 row throws on read"
      (with-redefs [config/is-dev? true]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Invalid metabot_message.data \(read\)"
                              (t2/select-one :model/MetabotMessage :id (:id msg))))))))
