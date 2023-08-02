(ns metabase.metabot.metabot-util-test
  (:require
    [clojure.string :as str]
    [clojure.test :refer :all]
    [metabase.db.query :as mdb.query]
    [metabase.metabot.openai-client :as metabot-client]
    [metabase.metabot.settings :as metabot-settings]
    [metabase.metabot.util :as metabot-util]
    [metabase.models :refer [Card Database Table]]
    [metabase.test :as mt]
    [metabase.test.util :as tu]
    [metabase.util :as u]
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

(deftest normalize-name-test
  (testing "Testing basic examples of how normalize-name should work"
    (is (= "A_B_C"
           (metabot-util/normalize-name "A B C")))
    (is (= "PEOPLE_DATA_IS_FUN_TEST"
           (metabot-util/normalize-name "People --> Data.Is.FUN __ TEST   ")))
    (is (= "PERSON_PLACE_OR_THING"
           (metabot-util/normalize-name "Person, Place, or Thing")))
    (is (= "PEOPLE_USER_ID"
           (metabot-util/normalize-name "People - User → ID")))))

(deftest denormalize-field-cardinality-test
  (testing "Ensure enum-cardinality-threshold is respected in model denormalization"
    (mt/dataset sample-dataset
      (mt/with-temp* [Card [model
                            {:dataset_query
                             {:database (mt/id)
                              :type     :query
                              :query    {:source-table (mt/id :people)}}
                             :dataset true}]]
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 0]
          (let [{:keys [result_metadata]} (metabot-util/enrich-model model)]
            (zero? (count (filter :possible_values result_metadata)))))
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 10]
          (let [{:keys [result_metadata]} (metabot-util/enrich-model model)]
            (= 1 (count (filter :possible_values result_metadata)))))
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 50]
          (let [{:keys [result_metadata]} (metabot-util/enrich-model model)]
            (= 2 (count (filter :possible_values result_metadata)))))))))

(deftest denormalize-model-test
  (testing "Basic denormalized model test"
    (mt/dataset sample-dataset
      (mt/with-temp* [Card [model
                            {:dataset_query
                             {:database (mt/id)
                              :type     :query
                              :query    {:source-table (mt/id :people)}}
                             :dataset true}]]
        (let [{:keys [result_metadata]} (metabot-util/enrich-model model)]
          (is
            (= #{"Affiliate"
                 "Facebook"
                 "Google"
                 "Organic"
                 "Twitter"}
               (->> result_metadata
                    (some (fn [{:keys [qp_column_name] :as rsmd}] (when (= "SOURCE" qp_column_name) rsmd)))
                    :possible_values
                    set)))
          (is (= true (every? :qp_column_name result_metadata))))))))

(deftest denormalize-database-test
  (testing "Basic denormalized database test"
    (mt/dataset sample-dataset
      (mt/with-temp* [Card [_
                            {:dataset_query
                             {:database (mt/id)
                              :type     :query
                              :query    {:source-table (mt/id :orders)}}
                             :dataset true}]]
        (let [database (t2/select-one Database :id (mt/id))
              {:keys [models sql_name model_json_summary]} (metabot-util/denormalize-database database)]
          (is (=
                (count (t2/select Card :database_id (mt/id) :dataset true))
                (count models)))
          (is (string? model_json_summary))
          (is (string? sql_name)))))))

(deftest create-prompt-test
  (testing "We can do prompt lookup and interpolation"
    (with-redefs [metabot-util/*prompt-templates* (constantly test-prompt-templates)]
      (let [prompt (metabot-util/create-prompt
                     {:model       {:sql_name         "TEST_MODEL"
                                    :create_table_ddl "CREATE TABLE TEST_MODEL"}
                      :user_prompt "Find my data"
                      :prompt_task :infer_sql})]
        (= {:prompt_template   "infer_sql",
            :version           "0001",
            :messages          [{:role "system", :content "The system prompt"}
                                {:role "assistant", :content "TEST_MODEL"}
                                {:role "assistant", :content "CREATE TABLE TEST_MODEL"}
                                {:role "user", :content "A 'Find my data'"}],
            :message_templates [{:role "system", :content "The system prompt"}
                                {:role "assistant", :content "%%MODEL:SQL_NAME%%"}
                                {:role "assistant", :content "%%MODEL:CREATE_TABLE_DDL%%"}
                                {:role "user", :content "A '%%USER_PROMPT%%'"}]}
           prompt)))))

(deftest extract-sql-test
  (testing "Test that we detect a simple SQL string"
    (let [sql "SELECT * FROM SOMETHING"]
      (is (= (mdb.query/format-sql sql)
             (metabot-util/extract-sql sql))))
    (let [sql (u/lower-case-en "SELECT * FROM SOMETHING")]
      (is (= (mdb.query/format-sql sql)
             (metabot-util/extract-sql sql)))))
  (testing "Test that we detect SQL embedded in markdown"
    (let [sql     "SELECT * FROM SOMETHING"
          bot-str (format "kmfeasf fasel;f fasefes; fasef;o ```%s```feafs feass" sql)]
      (is (= (mdb.query/format-sql sql)
             (metabot-util/extract-sql bot-str)))))
  (testing "Test that we detect SQL embedded in markdown with language hint"
    (let [sql     "SELECT * FROM SOMETHING"
          bot-str (format "kmfeasf fasel;f fasefes; fasef;o ```sql%s```feafs feass" sql)]
      (is (= (mdb.query/format-sql sql)
             (metabot-util/extract-sql bot-str))))))

(deftest bot-sql->final-sql-test
  (testing "A simple test of interpolation of denormalized data with bot sql"
    (is (= "WITH MY_MODEL AS (SELECT * FROM {{#123}} AS INNER_QUERY) SELECT * FROM MY_MODEL"
           (metabot-util/bot-sql->final-sql
             {:inner_query "SELECT * FROM {{#123}} AS INNER_QUERY"
              :sql_name    "MY_MODEL"}
             "SELECT * FROM MY_MODEL")))))

(defn- size-embedder [{:keys [_model input]} _options]
  (let [embedding (cond
                    (str/includes? input "turtles") [1]
                    (str/includes? input "love") [0.5]
                    :else [0])]
    {:data  [{:embedding embedding}]
     :usage {:prompt_tokens (* 10 (count input))}}))

(deftest score-prompt-embeddings-test
  (testing "score-prompt-embeddings scores a single prompt against a seq of existing embeddings."
    (with-redefs [metabot-client/*create-embedding-endpoint* size-embedder]
      (let [prompt-objects [(metabot-client/create-embedding "This is awesome!")
                            (metabot-client/create-embedding "Teenage mutant ninja turtles!")
                            (metabot-client/create-embedding "All you need is love")]]
        (is
          (= [{:prompt "This is awesome!", :embedding [0], :tokens 160, :user_prompt "I <3 turtles!", :prompt_match 0}
              {:prompt "Teenage mutant ninja turtles!", :embedding [1], :tokens 290, :user_prompt "I <3 turtles!", :prompt_match 1}
              {:prompt "All you need is love", :embedding [0.5], :tokens 200, :user_prompt "I <3 turtles!", :prompt_match 0.5}]
             (metabot-util/score-prompt-embeddings prompt-objects "I <3 turtles!")))))))

(deftest generate-prompt-test
  (testing "generate-prompt will create a single prompt that is the join of the best of all inputs under the token limit."
    (with-redefs [metabot-client/*create-embedding-endpoint* size-embedder]
      (let [prompt-objects [(metabot-client/create-embedding "This is awesome!")
                            (metabot-client/create-embedding "Teenage mutant ninja turtles!")
                            (metabot-client/create-embedding "All you need is love")]]
        (testing "With large token limit, all input is concatenated."
          (is
            (=
              (str/join
                "\n"
                ["Teenage mutant ninja turtles!"
                 "All you need is love"
                 "This is awesome!"])
              (metabot-util/generate-prompt prompt-objects "I <3 turtles!"))))
        (testing "generate-prompt will only retain the most relevant prompts under the token limit."
          (tu/with-temporary-setting-values [metabot-settings/metabot-prompt-generator-token-limit 500]
            (is
              (=
                (str/join
                  "\n"
                  ["Teenage mutant ninja turtles!"
                   "All you need is love"])
                (metabot-util/generate-prompt prompt-objects "I <3 turtles!")))))
        (testing "This is a terminal case, but if the prompts are too large for the token limit nothing is returned."
          ;; In reality, this will only happen if you have a massive input to encode, which is bad news anyways.
          (tu/with-temporary-setting-values [metabot-settings/metabot-prompt-generator-token-limit 0]
            (is
              (= ""
                 (metabot-util/generate-prompt prompt-objects "I <3 turtles!")))))))))

(deftest best-prompt-object-test
  (testing "best-prompt-object selects the best-match object based on embedding distance."
    (with-redefs [metabot-client/*create-embedding-endpoint* size-embedder]
      (let [prompt-objects [(metabot-client/create-embedding "This is awesome!")
                            (metabot-client/create-embedding "Teenage mutant ninja turtles!")
                            (metabot-client/create-embedding "All you need is love")]]
        (= {:prompt       "Teenage mutant ninja turtles!"
            :embedding    [1]
            :tokens       290, :user_prompt "I <3 turtles!"
            :prompt_match 1}
           (metabot-util/best-prompt-object prompt-objects "I <3 turtles!"))))))

(defn- max-size-embedder [max-tokens {:keys [_model input]} _options]
  (let [embedding   (cond
                      (str/includes? input "turtles") [1]
                      (str/includes? input "love") [0.5]
                      :else [0])
        used-tokens (count input)]
    (if (> used-tokens max-tokens)
      (let [message (format "Too many tokens (%s)!" used-tokens)]
        (throw
          (ex-info
            message
            {:message message
             :status  400})))
      {:data  [{:embedding embedding}]
       :usage {:prompt_tokens used-tokens}})))

(deftest create-table-embedding-test
  (testing "Baseline case -- the default prompt doesn't need any shrinking"
    (mt/dataset sample-dataset
      (let [max-tokens 5000]
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 100]
          (with-redefs [metabot-client/*create-embedding-endpoint* (partial max-size-embedder max-tokens)]
            (let [{:keys [tokens]} (metabot-util/create-table-embedding (t2/select-one Table :id (mt/id :people)))]
              (is (<= 800 tokens max-tokens))
              tokens))))))
  (testing "The token limit is too high, we reduce the size of the prompt"
    (mt/dataset sample-dataset
      (let [max-tokens 500]
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 100]
          (with-redefs [metabot-client/*create-embedding-endpoint* (partial max-size-embedder max-tokens)]
            (let [{:keys [tokens]} (metabot-util/create-table-embedding (t2/select-one Table :id (mt/id :people)))]
              (is (<= 400 tokens max-tokens))))))))
  (testing "The token limit is reduced to demonstrate that we produce nothing when we can't create a small enough prompt."
    (mt/dataset sample-dataset
      (let [max-tokens 1]
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 100]
          (with-redefs [metabot-client/*create-embedding-endpoint* (partial max-size-embedder max-tokens)]
            (let [response (metabot-util/create-table-embedding (t2/select-one Table :id (mt/id :people)))]
              (is (nil? response)))))))))
