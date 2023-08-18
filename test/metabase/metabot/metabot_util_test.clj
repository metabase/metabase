(ns metabase.metabot.metabot-util-test
  (:require
    [clojure.string :as str]
    [clojure.test :refer :all]
    [malli.core :as mc]
    [metabase.db.query :as mdb.query]
    [metabase.metabot.inference-ws-client :as inference-ws-client]
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

(deftest ^:parallel normalize-name-test
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

(deftest ^:parallel extract-sql-test
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

(deftest ^:parallell bot-sql->final-sql-test
  (testing "A simple test of interpolation of denormalized data with bot sql"
    (is (= "WITH MY_MODEL AS (SELECT * FROM {{#123}} AS INNER_QUERY) SELECT * FROM MY_MODEL"
           (metabot-util/bot-sql->final-sql
             {:inner_query "SELECT * FROM {{#123}} AS INNER_QUERY"
              :sql_name    "MY_MODEL"}
             "SELECT * FROM MY_MODEL")))))

(deftest rank-data-by-prompt-test
  (with-redefs [inference-ws-client/call-bulk-embeddings-endpoint
                (fn
                  ([_base-url args]
                   (if (mc/validate inference-ws-client/embeddings-schema args)
                     (update-vals args (fn [_] [0 0.25 0.5 0.25]))
                     "INVALID ARGUMENTS!"))
                  ([args]
                   (if (mc/validate inference-ws-client/embeddings-schema args)
                     (update-vals args (fn [_] [0 0.25 0.5 0.25]))
                     "INVALID ARGUMENTS!")))]
    (is (= [{:object "C", :cosine-similarity 0.5}
            {:object "B", :cosine-similarity 0.25}
            {:object "D", :cosine-similarity 0.25}
            {:object "A", :cosine-similarity 0.0}]
           (metabot-util/rank-data-by-prompt
             "This prompt should match C"
             {"A" [1 0 0 0]
              "B" [0 1 0 0]
              "C" [0 0 1 0]
              "D" [0 0 0 1]})))))
