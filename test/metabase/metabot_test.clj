(ns metabase.metabot-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.query :as mdb.query]
   [metabase.metabot :as metabot]
   [metabase.metabot.client :as metabot-client]
   [metabase.metabot.util :as metabot-util]
   [metabase.models :refer [Card]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def test-prompt-templates
  {:infer_sql        {:latest {:prompt_template "infer_sql",
                               :version         "0001",
                               :messages        [{:role "system", :content "The system prompt"}
                                                 {:role "assistant", :content "%%MODEL:SQL_NAME%%"}
                                                 {:role "assistant", :content "%%MODEL:CREATE_TABLE_DDL%%"}
                                                 {:role "user", :content "A '%%USER_PROMPT%%'"}]}}
   :infer_model      {:latest {:prompt_template "infer_model",
                               :version         "0001",
                               :messages        [{:role "system", :content "The system prompt"}
                                                 {:role "assistant", :content "%%DATABASE:MODEL_JSON_SUMMARY%%"}
                                                 {:role "user", :content "A '%%USER_PROMPT%%'"}]}}
   :infer_viz        {:latest {:prompt_template "infer_viz",
                               :version         "0001",
                               :messages        [{:role "system", :content "The system prompt"}
                                                 {:role "assistant", :content "The assistant prompt"}
                                                 {:role "user", :content "The user prompt"}]}}
   :infer_native_sql {:latest {:prompt_template "infer_native_sql",
                               :version         "0001",
                               :messages        [{:role "system", :content "The system prompt"}
                                                 {:role "assistant", :content "%%DATABASE:CREATE_DATABASE_DDL%%"}
                                                 {:role "user", :content "%%USER_PROMPT%%"}]}}})

(defn throw-on-embedding [{:keys [_model _input]} _options]
  (let [error-message "Embeddings endpoint should NOT be called when inferring sql."]
    (throw
     (ex-info
      error-message
      {:message error-message}))))

(defn simple-embedding-stub [{:keys [_model _input]} _options]
  {:data  [{:embedding [1.0 0.0 0.0 0.0]}]
   :usage {:prompt_tokens 10}})

(defn test-bot-endpoint-single-message [bot-message]
  (fn [_ auth]
    (when (seq auth)
      {:choices [{:message {:content bot-message}}]})))

(deftest infer-sql-test
  (testing "Test the 'plumbing' of the infer-sql function. The actual invocation of the remote bot is dynamically rebound."
    (mt/with-temp-env-var-value! [mb-is-metabot-enabled true]
      (mt/dataset test-data
        (t2.with-temp/with-temp
          [Card model {:dataset_query
                       {:database (mt/id)
                        :type     :query
                        :query    {:source-table (mt/id :orders)}}
                       :type :model}]
          (let [bot-sql (format "SELECT * FROM %s" (:name model))]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (test-bot-endpoint-single-message bot-sql)
                          metabot-client/*create-embedding-endpoint*       simple-embedding-stub
                          metabot-util/*prompt-templates*                  (constantly test-prompt-templates)]
              (let [{:keys [inner_query] :as denormalized-model} (metabot-util/denormalize-model model)
                    user_prompt   "Show me all of my data"
                    context       {:model       denormalized-model
                                   :user_prompt user_prompt
                                   :prompt_task :infer_sql}
                    result        (metabot/infer-sql context)
                    generated-sql (get-in result [:card :dataset_query :native :query])]
                (is (true? (str/includes? generated-sql inner_query)))
                (is (true? (str/ends-with?
                            (str/replace generated-sql #"\W+" "")
                            (str/replace bot-sql #"\W+" ""))))))))))))

(deftest infer-model-test
  (testing "Test the 'plumbing' of the infer-model function. The actual invocation of the remote bot is dynamically rebound."
    (mt/with-temp-env-var-value! [mb-is-metabot-enabled true]
      (mt/dataset test-data
        (t2.with-temp/with-temp
          [Card orders-model {:name    "Orders Model"
                              :dataset_query
                              {:database (mt/id)
                               :type     :query
                               :query    {:source-table (mt/id :orders)}}
                              :type :model}
           Card _people-model {:name    "People Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :people)}}
                               :type :model}
           Card _products-model {:name    "Products Model"
                                 :dataset_query
                                 {:database (mt/id)
                                  :type     :query
                                  :query    {:source-table (mt/id :products)}}
                                 :type :model}]
          (let [user_prompt        "Show me all of my orders data"
                db                 (t2/select-one :model/Database :id (mt/id))
                {:keys [models] :as denormalized-db} (metabot-util/denormalize-database db)
                denormalized-model (first (filter (comp #{"Orders Model"} :name) models))
                context            {:database    denormalized-db
                                    :user_prompt user_prompt
                                    :prompt_task :infer_model}
                bot-message        (format "The best model is probably %s" (:id orders-model))]
            (with-redefs [metabot-client/*create-chat-completion-endpoint* (test-bot-endpoint-single-message bot-message)
                          ;; Both the prompt and the model pseudo-ddl containing the text "orders" have better
                          ;; encoding matches than other model ddls.
                          metabot-client/*create-embedding-endpoint*       (fn [{:keys [_model input]} _options]
                                                                             (let [embeddings (if (str/includes?
                                                                                                   (u/upper-case-en input)
                                                                                                   "ORDERS")
                                                                                                [1.0 0.0 0.0 0.0]
                                                                                                [0.0 0.0 0.0 0.0])]
                                                                               {:data  [{:embedding embeddings}]
                                                                                :usage {:prompt_tokens 10}}))
                          metabot-util/*prompt-templates*                  (constantly test-prompt-templates)]
              (is
               (partial=
                denormalized-model
                (metabot/match-best-model context))))))))))

(deftest infer-native-sql-test
  (testing "Test the 'plumbing' of the infer-native-sql function. The actual invocation of the remote bot is dynamically rebound."
    (mt/with-temp-env-var-value! [mb-is-metabot-enabled true]
      (mt/dataset test-data
        (let [user_prompt "Show me all of my reviews data"
              context     {:database    (metabot-util/denormalize-database (mt/db))
                           :user_prompt user_prompt
                           :prompt_task :infer_native_sql}]
          (with-redefs [metabot-client/*create-chat-completion-endpoint*
                        (fn [{:keys [messages]} _]
                          ;; If the test messages contains REVIEWS, use it.
                          ;; Otherwise, return a useless result.
                          ;; This test will only pass if the embedding section below
                          ;; matches on the reviews table.
                          (let [content (if (str/includes?
                                             (second messages)
                                             "REVIEWS")
                                          "SELECT * FROM REVIEWS"
                                          "shrug")]
                            {:choices [{:message {:content content}}]}))
                        metabot-client/*create-embedding-endpoint*
                        (fn [{:keys [_model input]} _options]
                          ;; Both the prompt and the model pseudo-ddl containing the
                          ;; text "reviews" have better encoding matches than other
                          ;; model ddls.
                          (let [embeddings (if (str/includes?
                                                (u/upper-case-en input)
                                                "REVIEWS")
                                             [1.0 0.0 0.0 0.0]
                                             [0.0 0.0 0.0 0.0])]
                            {:data  [{:embedding embeddings}]
                             :usage {:prompt_tokens 10}}))
                        metabot-util/*prompt-templates* (constantly test-prompt-templates)]
            (is (= {:sql                      (mdb.query/format-sql "SELECT * FROM REVIEWS")
                    :prompt_template_versions ["infer_native_sql:0001"]}
                   (metabot/infer-native-sql-query context)))))))))
