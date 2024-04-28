(ns metabase.api.metabot-test
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.query :as mdb.query]
   [metabase.metabot-test :as metabot-test]
   [metabase.metabot.client :as metabot-client]
   [metabase.metabot.util :as metabot-util]
   [metabase.models :refer [Card]]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest metabot-only-works-on-models-test
  (testing "POST /api/metabot/model/:model-id won't work for a table endpoint"
    (mt/with-temp-env-var-value! [mb-is-metabot-enabled true]
      (mt/dataset test-data
        (let [q        "At what time was the status closed for each user?"
              response (mt/user-http-request :rasta :post 404
                                             (format "/metabot/model/%s" (mt/id :people))
                                             {:question q})]
          (is (= "Not found." response)))))))

(deftest metabot-model-happy-path-test
  (testing "POST /api/metabot/model/:model-id happy path"
    (mt/with-temp-env-var-value! [mb-is-metabot-enabled true]
      (mt/dataset test-data
        (t2.with-temp/with-temp
          [Card orders-model {:name    "Orders Model"
                              :dataset_query
                              {:database (mt/id)
                               :type     :query
                               :query    {:source-table (mt/id :orders)}}
                              :type :model}]
          (let [bot-message (format
                             "You should do ```SELECT COUNT(*) FROM %s``` to do that."
                             (metabot-util/normalize-name (:name orders-model)))
                bot-sql     (metabot-util/extract-sql bot-message)
                q           "How many orders do I have?"]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (fn [{:keys [prompt_template]} _]
                                                                             (case (keyword prompt_template)
                                                                               :infer_sql {:choices [{:message {:content bot-message}}]}
                                                                               {:choices [{:message {:content "{}"}}]}))
                          metabot-client/*create-embedding-endpoint*       metabot-test/throw-on-embedding
                          metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :crowberto :post 200
                                                   (format "/metabot/model/%s" (:id orders-model))
                                                   {:question q})
                    {:keys [query template-tags]} (get-in response [:card :dataset_query :native])]
                (is (true? (str/ends-with? query bot-sql)))
                (is (contains? template-tags (keyword (str "#" (:id orders-model)))))))))))))

(deftest metabot-model-sad-path-test
  (testing "POST /api/metabot/model/:model-id produces a message when no SQL is found"
    (mt/with-temp-env-var-value! [mb-is-metabot-enabled true]
      (mt/dataset test-data
        (t2.with-temp/with-temp
          [Card orders-model {:name    "Orders Model"
                              :dataset_query
                              {:database (mt/id)
                               :type     :query
                               :query    {:source-table (mt/id :orders)}}
                              :type :model}]
          (let [bot-message "IDK what to do here"
                q           "How many orders do I have?"]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-client/*create-embedding-endpoint*       metabot-test/throw-on-embedding
                          metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :crowberto :post 400
                                                   (format "/metabot/model/%s" (:id orders-model))
                                                   {:question q})]
                (is (true? (str/includes? response "didn't produce any SQL")))))))))))

(deftest metabot-database-happy-path-test
  (testing "POST /api/metabot/database/:database-id happy path"
    (mt/with-temp-env-var-value! [mb-is-metabot-enabled true]
      (mt/dataset test-data
        (t2.with-temp/with-temp
          [Card orders-model {:name    "Orders Model"
                              :dataset_query
                              {:database (mt/id)
                               :type     :query
                               :query    {:source-table (mt/id :orders)}}
                              :type :model}]
          (let [bot-model-selection (format "The best model is %s" (:id orders-model))
                bot-sql-response    (format "you should do ```SELECT COUNT(*) FROM %s``` to do that."
                                            (metabot-util/normalize-name (:name orders-model)))
                bot-sql             (metabot-util/extract-sql bot-sql-response)
                q                   "How many orders do I have?"]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (fn [{:keys [prompt_template]} _]
                                                                             (case (keyword prompt_template)
                                                                               :infer_model {:choices [{:message {:content bot-model-selection}}]}
                                                                               :infer_sql {:choices [{:message {:content bot-sql-response}}]}
                                                                               {:choices [{:message {:content "{}"}}]}))
                          metabot-client/*create-embedding-endpoint*       metabot-test/simple-embedding-stub
                          metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :crowberto :post 200
                                                   (format "/metabot/database/%s" (mt/id))
                                                   {:question q})
                    {:keys [query template-tags]} (get-in response [:card :dataset_query :native])]
                (is (true? (str/ends-with? query bot-sql)))
                (is (contains? template-tags (keyword (str "#" (:id orders-model)))))))))))))

(deftest metabot-database-no-model-found-test
  (testing "With embeddings, you'll always get _some_ model, unless there aren't any at all."
    (mt/with-temp-env-var-value! [mb-is-metabot-enabled true]
      (mt/dataset test-data
        (t2.with-temp/with-temp
          [Card _orders-model {:name    "Not a model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)}}
                               :type :question}]
          (let [bot-message "Your prompt needs more details..."
                q           "A not useful prompt"]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-client/*create-embedding-endpoint*       metabot-test/simple-embedding-stub
                          metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
              (let [{:keys [message]} (mt/user-http-request :crowberto :post 400
                                                            (format "/metabot/database/%s" (mt/id))
                                                            {:question q})]
                (is (true? (str/includes? message (format "Query '%s' didn't find a good match to your data." q))))))))))))

(deftest metabot-database-no-sql-found-test
  (testing "When we can't find sql from the selected model, we return a message"
    (mt/with-temp-env-var-value! [mb-is-metabot-enabled true]
      (mt/dataset test-data
        (t2.with-temp/with-temp
          [Card orders-model {:name    "Orders Model"
                              :dataset_query
                              {:database (mt/id)
                               :type     :query
                               :query    {:source-table (mt/id :orders)}}
                              :type :model}]
          (let [bot-message (format
                             "Part 1 is %s but part 2 doesn't return SQL."
                             (:id orders-model))
                q           "orders model but nothing useful"]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-client/*create-embedding-endpoint*       metabot-test/throw-on-embedding
                          metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :crowberto :post 400
                                                   (format "/metabot/database/%s" (mt/id))
                                                   {:question q})]
                (is (true? (str/includes? response "didn't produce any SQL")))))))))))

(deftest openai-40X-test
  ;; We can use the metabot-client/bot-endpoint redefs to simulate various failure modes in the bot server
  (mt/with-temp-env-var-value! [mb-is-metabot-enabled true]
    (testing "Too many requests returns a useful message"
      (mt/dataset test-data
        (t2.with-temp/with-temp
          [Card _ {:name    "Orders Model"
                   :dataset_query
                   {:database (mt/id)
                    :type     :query
                    :query    {:source-table (mt/id :orders)}}
                   :type :model}]
          (with-redefs [metabot-client/*create-chat-completion-endpoint* (fn [_ _]
                                                                           (throw (ex-info
                                                                                   "Too many requests"
                                                                                   {:message "Too many requests"
                                                                                    :status  429})))
                        metabot-client/*create-embedding-endpoint*       metabot-test/simple-embedding-stub
                        metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
            (let [{:keys [message]} (mt/user-http-request :crowberto :post 429
                                                          (format "/metabot/database/%s" (mt/id))
                                                          {:question "Doesn't matter"})]
              (is (true? (str/includes? message "The bot server is under heavy load"))))))))
    (testing "Not having the right API keys set returns a useful message"
      (mt/dataset test-data
        (t2.with-temp/with-temp
          [Card _ {:name    "Orders Model"
                   :dataset_query
                   {:database (mt/id)
                    :type     :query
                    :query    {:source-table (mt/id :orders)}}
                   :type :model}]
          (with-redefs [metabot-client/*create-chat-completion-endpoint* (fn [_ _]
                                                                           (throw (ex-info
                                                                                   "Unauthorized"
                                                                                   {:message "Unauthorized"
                                                                                    :status  401})))
                        metabot-client/*create-embedding-endpoint*       metabot-test/simple-embedding-stub
                        metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
            (let [{:keys [message]} (mt/user-http-request :crowberto :post 400
                                                          (format "/metabot/database/%s" (mt/id))
                                                          {:question "Doesn't matter"})]
              (is (true? (str/includes? message "Bot credentials are incorrect or not set"))))))))
    (testing "Too many tokens used returns a useful message"
      (mt/dataset test-data
        (mt/with-temp [Card _ {:name    "Orders Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)}}
                               :type :model}]
          (let [error-code    "context_length_exceeded"
                error-message (str/join " "
                                        ["This model's maximum context length is 8192 tokens."
                                         "However, your messages resulted in 14837 tokens."
                                         "Please reduce the length of the messages."])]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (fn [_ _]
                                                                             (throw (ex-info
                                                                                     error-message
                                                                                     {:body   (json/generate-string
                                                                                               {:error {:message error-message
                                                                                                        :code    error-code}})
                                                                                      :status 400})))
                          metabot-client/*create-embedding-endpoint*       metabot-test/simple-embedding-stub
                          metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
              (let [{:keys [message]} (mt/user-http-request :crowberto :post 400
                                                            (format "/metabot/database/%s" (mt/id))
                                                            {:question "Doesn't matter"})]
                (is (= error-message message))))))))))

(deftest metabot-infer-native-sql-test
  (testing "POST /database/:database-id/query"
    (mt/with-temp-env-var-value! [mb-is-metabot-enabled true]
      (mt/dataset test-data
        (mt/with-temp [Card _orders-model {:name    "Orders Model"
                                           :dataset_query
                                           {:database (mt/id)
                                            :type     :query
                                            :query    {:source-table (mt/id :orders)}}
                                           :type :model}]
          (let [bot-message "SELECT COUNT(*) FROM ORDERS;"
                q           "How many orders do I have?"]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-client/*create-embedding-endpoint*       metabot-test/simple-embedding-stub
                          metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :crowberto :post 200
                                                   (format "/metabot/database/%s/query" (mt/id))
                                                   {:question q})
                    {:keys [sql]} response]
                (is (= (mdb.query/format-sql bot-message)
                       (mdb.query/format-sql sql)))))))))))
