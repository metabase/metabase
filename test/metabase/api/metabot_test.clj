(ns metabase.api.metabot-test
  (:require
    [cheshire.core :as json]
    [clojure.string :as str]
    [clojure.test :refer :all]
    [metabase.config :as config]
    [metabase.db.query :as mdb.query]
    [metabase.metabot-test :as metabot-test]
    [metabase.metabot.client :as metabot-client]
    [metabase.metabot.util :as metabot-util]
    [metabase.models :refer [Card Collection]]
    [metabase.models.permissions :as perms]
    [metabase.models.permissions-group :as perms-group]
    [metabase.test :as mt]
    [metabase.util :as u]
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
                              :dataset true}]
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
              (let [response (mt/user-http-request :rasta :post 200
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
                              :dataset true}]
          (let [bot-message "IDK what to do here"
                q           "How many orders do I have?"]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-client/*create-embedding-endpoint*       metabot-test/throw-on-embedding
                          metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :rasta :post 400
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
                              :dataset true}]
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
              (let [response (mt/user-http-request :rasta :post 200
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
                               :dataset false}]
          (let [bot-message "Your prompt needs more details..."
                q           "A not useful prompt"]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-client/*create-embedding-endpoint*       metabot-test/simple-embedding-stub
                          metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
              (let [{:keys [message]} (mt/user-http-request :rasta :post 400
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
                              :dataset true}]
          (let [bot-message (format
                             "Part 1 is %s but part 2 doesn't return SQL."
                             (:id orders-model))
                q           "orders model but nothing useful"]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-client/*create-embedding-endpoint*       metabot-test/throw-on-embedding
                          metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :rasta :post 400
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
                   :dataset true}]
          (with-redefs [metabot-client/*create-chat-completion-endpoint* (fn [_ _]
                                                                           (throw (ex-info
                                                                                   "Too many requests"
                                                                                   {:message "Too many requests"
                                                                                    :status  429})))
                        metabot-client/*create-embedding-endpoint*       metabot-test/simple-embedding-stub
                        metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
            (let [{:keys [message]} (mt/user-http-request :rasta :post 429
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
                   :dataset true}]
          (with-redefs [metabot-client/*create-chat-completion-endpoint* (fn [_ _]
                                                                           (throw (ex-info
                                                                                   "Unauthorized"
                                                                                   {:message "Unauthorized"
                                                                                    :status  401})))
                        metabot-client/*create-embedding-endpoint*       metabot-test/simple-embedding-stub
                        metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
            (let [{:keys [message]} (mt/user-http-request :rasta :post 400
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
                               :dataset true}]
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
              (let [{:keys [message]} (mt/user-http-request :rasta :post 400
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
                                           :dataset true}]
          (let [bot-message "SELECT COUNT(*) FROM ORDERS;"
                q           "How many orders do I have?"]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (metabot-test/test-bot-endpoint-single-message bot-message)
                          metabot-client/*create-embedding-endpoint*       metabot-test/simple-embedding-stub
                          metabot-util/*prompt-templates*                  (constantly metabot-test/test-prompt-templates)]
              (let [response (mt/user-http-request :rasta :post 200
                                                   (format "/metabot/database/%s/query" (mt/id))
                                                   {:question q})
                    {:keys [sql]} response]
                (is (= (mdb.query/format-sql bot-message)
                       (mdb.query/format-sql sql)))))))))))

(def card-defaults
  "The default card params."
  {:archived            false
   :collection_id       nil
   :collection_position nil
   :collection_preview  true
   :dataset_query       {}
   :dataset             false
   :description         nil
   :display             "scalar"
   :enable_embedding    false
   :entity_id           nil
   :embedding_params    nil
   :made_public_by_id   nil
   :parameters          []
   :parameter_mappings  []
   :moderation_reviews  ()
   :public_uuid         nil
   :query_type          nil
   :cache_ttl           nil
   :average_query_time  nil
   :last_query_start    nil
   :result_metadata     nil})

(defn mbql-count-query
  ([]
   (mbql-count-query (mt/id) (mt/id :venues)))

  ([db-or-id table-or-id]
   {:database (u/the-id db-or-id)
    :type     :query
    :query    {:source-table (u/the-id table-or-id), :aggregation [[:count]]}}))

(defn card-with-name-and-query
  ([]
   (card-with-name-and-query (mt/random-name)))

  ([card-name]
   (card-with-name-and-query card-name (mbql-count-query)))

  ([card-name query]
   {:name                   card-name
    :display                "scalar"
    :dataset_query          query
    :visualization_settings {:global {:title nil}}}))

(deftest summarize-card-test
  (testing "POST /api/card"
    (testing "Test that we can create a new Card"
      (mt/with-non-admin-groups-no-root-collection-perms
        (t2.with-temp/with-temp [Collection collection]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/with-model-cleanup [:model/Card]
                                 (let [card (assoc (card-with-name-and-query (mt/random-name)
                                                                             (mbql-count-query (mt/id) (mt/id :venues)))
                                              :collection_id (u/the-id collection)
                                              :parameters [{:id "abc123", :name "test", :type "date"}]
                                              :parameter_mappings [{:parameter_id "abc123", :card_id 10,
                                                                    :target       [:dimension [:template-tags "category"]]}])]
                                   (mt/user-http-request :rasta :post 200 "metabot/card/summarize" card))))))))
