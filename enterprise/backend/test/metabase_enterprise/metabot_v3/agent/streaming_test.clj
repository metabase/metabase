(ns metabase-enterprise.metabot-v3.agent.streaming-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]))

(deftest navigate-to-part-test
  (testing "creates correct navigate_to data part structure"
    (let [url "/question#abc123"
          part (streaming/navigate-to-part url)]
      (is (= :data (:type part)))
      (is (= "navigate_to" (:data-type part)))
      (is (= url (:data part)))))

  (testing "works with various URL formats"
    (let [part1 (streaming/navigate-to-part "/model/123")
          part2 (streaming/navigate-to-part "/metric/456")
          part3 (streaming/navigate-to-part "/dashboard/789")]
      (is (= "/model/123" (:data part1)))
      (is (= "/metric/456" (:data part2)))
      (is (= "/dashboard/789" (:data part3))))))

(deftest query->question-url-test
  (testing "converts query to /question# URL"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          url (streaming/query->question-url query)]
      (is (str/starts-with? url "/question#"))
      (is (> (count url) 10))))

  (testing "handles complex queries"
    (let [query {:database 1
                 :type :query
                 :query {:source-table 1
                         :filter [:= [:field 1 nil] "test"]
                         :aggregation [[:count]]}}
          url (streaming/query->question-url query)]
      (is (str/starts-with? url "/question#")))))

(deftest reactions->data-parts-test
  (testing "converts redirect reactions to navigate_to data parts"
    (let [reactions [{:type :metabot.reaction/redirect :url "/question#xyz"}]
          parts (streaming/reactions->data-parts reactions)]
      (is (= 1 (count parts)))
      (is (= :data (:type (first parts))))
      (is (= "navigate_to" (:data-type (first parts))))
      (is (= "/question#xyz" (:data (first parts))))))

  (testing "handles multiple reactions"
    (let [reactions [{:type :metabot.reaction/redirect :url "/model/1"}
                     {:type :metabot.reaction/redirect :url "/metric/2"}]
          parts (streaming/reactions->data-parts reactions)]
      (is (= 2 (count parts)))
      (is (= "/model/1" (:data (first parts))))
      (is (= "/metric/2" (:data (second parts))))))

  (testing "ignores non-redirect reactions"
    (let [reactions [{:type :metabot.reaction/message :message "hello"}
                     {:type :metabot.reaction/redirect :url "/model/1"}
                     {:type :unknown/reaction :data "foo"}]
          parts (streaming/reactions->data-parts reactions)]
      (is (= 1 (count parts)))
      (is (= "/model/1" (:data (first parts))))))

  (testing "returns empty vector for empty reactions"
    (is (= [] (streaming/reactions->data-parts [])))
    (is (= [] (streaming/reactions->data-parts nil)))))

(deftest state-part-test
  (testing "creates state data part"
    (let [state {:queries {"q1" {:database 1}} :charts {"c1" {:type :bar}}}
          part (streaming/state-part state)]
      (is (= :data (:type part)))
      (is (= "state" (:data-type part)))
      (is (= state (:data part))))))
