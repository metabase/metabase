(ns metabase.api.metabot-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.metabot-test :as metabot-test]
            [metabase.metabot.client :as metabot-client]
            [metabase.metabot.util :as metabot-util]
            [metabase.models :refer [Card Collection Database Field Metric Table]]
            [metabase.test :as mt]))

(deftest metabot-only-works-on-models-test
  (testing "POST /api/metabot/model/:model-id won't work for a table endpoint"
    (mt/with-temporary-setting-values [is-metabot-enabled true]
      (mt/dataset sample-dataset
        (let [q        "At what time was the status closed for each user?"
              response (mt/user-http-request :rasta :post 404
                                             (format "/metabot/model/%s" (mt/id :people))
                                             {:question q})]
          (is (= "Not found." response)))))))

(deftest metabot-model-happy-path-test
  (testing "POST /api/metabot/model/:model-id happy path"
    (mt/with-temporary-setting-values [is-metabot-enabled true]
      (mt/dataset sample-dataset
        (mt/with-temp* [Card [orders-model
                              {:name    "Orders Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)}}
                               :dataset true}]]
          (let [bot-message (format
                             "You should do ```SELECT COUNT(*) FROM %s``` to do that."
                             (metabot-util/normalize-name (:name orders-model)))
                bot-sql     (metabot-util/extract-sql bot-message)
                q           "How many orders do I have?"]
            (with-redefs [metabot-client/bot-endpoint   (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-util/prompt-templates (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :rasta :post 200
                                                   (format "/metabot/model/%s" (:id orders-model))
                                                   {:question q})
                    {:keys [query template-tags]} (get-in response [:card :dataset_query :native])]
                (is (true? (str/ends-with? query bot-sql)))
                (is (contains? template-tags (keyword (str "#" (:id orders-model)))))))))))))

(deftest metabot-model-sad-path-test
  (testing "POST /api/metabot/model/:model-id produces a message when no SQL is found"
    (mt/with-temporary-setting-values [is-metabot-enabled true]
      (mt/dataset sample-dataset
        (mt/with-temp* [Card [orders-model
                              {:name    "Orders Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)}}
                               :dataset true}]]
          (let [bot-message "IDK what to do here"
                q           "How many orders do I have?"]
            (with-redefs [metabot-client/bot-endpoint   (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-util/prompt-templates (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :rasta :post 400
                                                   (format "/metabot/model/%s" (:id orders-model))
                                                   {:question q})]
                (is (true? (str/includes? response "didn't produce any SQL")))))))))))

(deftest metabot-database-happy-path-test
  (testing "POST /api/metabot/database/:database-id happy path"
    (mt/with-temporary-setting-values [is-metabot-enabled true]
      (mt/dataset sample-dataset
        (mt/with-temp* [Card [orders-model
                              {:name    "Orders Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)}}
                               :dataset true}]]
          (let [bot-message (format
                             "Part 1 is %s and part 2 is you should do ```SELECT COUNT(*) FROM %s``` to do that."
                             (:id orders-model)
                             (metabot-util/normalize-name (:name orders-model)))
                bot-sql     (metabot-util/extract-sql bot-message)
                q           "How many orders do I have?"]
            (with-redefs [metabot-client/bot-endpoint   (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-util/prompt-templates (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :rasta :post 200
                                                   (format "/metabot/database/%s" (mt/id))
                                                   {:question q})
                    {:keys [query template-tags]} (get-in response [:card :dataset_query :native])]
                (is (true? (str/ends-with? query bot-sql)))
                (is (contains? template-tags (keyword (str "#" (:id orders-model)))))))))))))

(deftest metabot-database-no-model-found-test
  (testing "When we can't find a model, we return a message"
    (mt/with-temporary-setting-values [is-metabot-enabled true]
      (mt/dataset sample-dataset
        (mt/with-temp* [Card [orders-model
                              {:name    "Orders Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)}}
                               :dataset true}]]
          (let [bot-message "No good model selected :("
                q           "How many orders do I have?"]
            (with-redefs [metabot-client/bot-endpoint   (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-util/prompt-templates (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :rasta :post 400
                                                   (format "/metabot/database/%s" (mt/id))
                                                   {:question q})]
                (is (true? (str/includes? response "didn't find a good match")))))))))))

(deftest metabot-database-no-sql-found-test
  (testing "When we can't find sql from the selected model, we return a message"
    (mt/with-temporary-setting-values [is-metabot-enabled true]
      (mt/dataset sample-dataset
        (mt/with-temp* [Card [orders-model
                              {:name    "Orders Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)}}
                               :dataset true}]]
          (let [bot-message (format
                             "Part 1 is %s but part 2 doesn't return SQL."
                             (:id orders-model))
                q           "How many orders do I have?"]
            (with-redefs [metabot-client/bot-endpoint   (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-util/prompt-templates (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :rasta :post 400
                                                   (format "/metabot/database/%s" (mt/id))
                                                   {:question q})]
                (is (true? (str/includes? response "didn't produce any SQL")))))))))))

(deftest openai-40X-test
  ;; We can use the metabot-client/bot-endpoint redefs to simulate various failure modes in the bot server
  (mt/with-temporary-setting-values [is-metabot-enabled true]
    (testing "Too many requests returns a useful message"
      (mt/dataset sample-dataset
        (mt/with-temp* [Card [orders-model
                              {:name    "Orders Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)}}
                               :dataset true}]]
          (with-redefs [metabot-client/bot-endpoint   (fn [_ _]
                                                        (throw (ex-info
                                                                "Too many requests"
                                                                {:message "Too many requests"
                                                                 :status  429})))
                        metabot-util/prompt-templates (constantly metabot-test/test-prompt-templates)]
            (let [{:keys [message]} (mt/user-http-request :rasta :post 429
                                                          (format "/metabot/database/%s" (mt/id))
                                                          {:question "Doesn't matter"})]
              (is (true? (str/includes? message "The bot server is under heavy load"))))))))
    (testing "Not having the right API keys set returns a useful message"
      (mt/dataset sample-dataset
        (mt/with-temp* [Card [orders-model
                              {:name    "Orders Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)}}
                               :dataset true}]]
          (with-redefs [metabot-client/bot-endpoint   (fn [_ _]
                                                        (throw (ex-info
                                                                "Unauthorized"
                                                                {:message "Unauthorized"
                                                                 :status  401})))
                        metabot-util/prompt-templates (constantly metabot-test/test-prompt-templates)]
            (let [{:keys [message]} (mt/user-http-request :rasta :post 400
                                                          (format "/metabot/database/%s" (mt/id))
                                                          {:question "Doesn't matter"})]
              (is (true? (str/includes? message "Bot credentials are incorrect or not set"))))))))))
