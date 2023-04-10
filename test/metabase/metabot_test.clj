(ns metabase.metabot-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot :as metabot]
   [metabase.metabot.client :as metabot-client]
   [metabase.metabot.util :as metabot-util]
   [metabase.models :refer [Card Database]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
   :infer_native_sql {:latest {:prompt_template "infer_native_sql",
                               :version         "0001",
                               :messages        [{:role "system", :content "The system prompt"}
                                                 {:role "assistant", :content "%%DATABASE:CREATE_DATABASE_DDL%%"}
                                                 {:role "user", :content "%%USER_PROMPT%%"}]}}})

(defn test-bot-endpoint-single-message [bot-message]
  (fn [_ auth]
    (when (seq auth)
      {:choices [{:message {:content bot-message}}]})))

(deftest infer-sql-test
  (testing "Test the 'plumbing' of the infer-sql function. The actual invocation of the remote bot is dynamically rebound."
    (mt/with-temporary-setting-values [is-metabot-enabled true]
      (mt/dataset sample-dataset
        (mt/with-temp* [Card [model
                              {:dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)}}
                               :dataset true}]]
          (let [bot-sql (format "SELECT * FROM %s" (:name model))]
            (with-redefs [metabot-client/*bot-endpoint*   (test-bot-endpoint-single-message bot-sql)
                          metabot-util/*prompt-templates* (constantly test-prompt-templates)]
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
    (mt/with-temporary-setting-values [is-metabot-enabled true]
      (mt/dataset sample-dataset
        (mt/with-temp* [Card [orders-model
                              {:name    "Orders Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)}}
                               :dataset true}]
                        Card [_people-model
                              {:name    "People Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :people)}}
                               :dataset true}]
                        Card [_products-model
                              {:name    "Products Model"
                               :dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :products)}}
                               :dataset true}]]
          (let [user_prompt        "Show me all of my orders data"
                db                 (t2/select-one Database :id (mt/id))
                {:keys [models] :as denormalized-db} (metabot-util/denormalize-database db)
                denormalized-model (first (filter (comp #{"Orders Model"} :name) models))
                context            {:database    denormalized-db
                                    :user_prompt user_prompt
                                    :prompt_task :infer_model}
                bot-message        (format "The best model is probably %s" (:id orders-model))]
            (with-redefs [metabot-client/*bot-endpoint*   (test-bot-endpoint-single-message bot-message)
                          metabot-util/*prompt-templates* (constantly test-prompt-templates)]
              (is
               (= denormalized-model
                  (dissoc
                   (metabot/infer-model context)
                   :prompt_template_versions))))))))))
