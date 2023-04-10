(ns metabase.metabot.metabot-util-test
  (:require
    [clojure.test :refer :all]
    [metabase.db.query :as mdb.query]
    [metabase.lib.native :as lib-native]
    [metabase.metabot.settings :as metabot-settings]
    [metabase.metabot-test :as metabot-test]
    [metabase.metabot.util :as metabot-util]
    [metabase.models :refer [Card Database]]
    [metabase.query-processor :as qp]
    [metabase.test :as mt]
    [metabase.util :as u]
    [toucan2.core :as t2]))

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

(deftest create-table-ddl-test
  (testing "Testing the test-create-table-ddl function"
    (let [model {:sql_name        "TABLE"
                 :result_metadata (mapv
                                    (fn [{:keys [display_name] :as m}]
                                      (assoc m
                                        :sql_name
                                        (metabot-util/normalize-name display_name)))
                                    [{:display_name "Name"
                                      :base_type    :type/Text}
                                     {:display_name "Frooby"
                                      :base_type    :type/Boolean}
                                     {:display_name "Age"
                                      :base_type    :type/Integer}
                                     ;; Low cardinality items should show as enumerated
                                     {:display_name    "Sizes"
                                      :base_type       :type/Integer
                                      :possible_values [1 2 3]}
                                     ;; Despite being enumerated, when the cardinality is too high,
                                     ;; we will skip the enumeration here to prevent using too many tokens.
                                     {:display_name    "BigCardinality"
                                      :base_type       :type/Integer
                                      :possible_values (range (inc (metabot-settings/enum-cardinality-threshold)))}])}]
      (is (= (mdb.query/format-sql
               (str
                 "create type SIZES_t as enum '1', '2', '3';"
                 "CREATE TABLE \"TABLE\" ('NAME' TEXT,'FROOBY' BOOLEAN, 'AGE' INTEGER, 'SIZES' 'SIZES_t','BIGCARDINALITY' INTEGER)"))
             (mdb.query/format-sql
               (#'metabot-util/create-table-ddl model)))))))

(deftest denormalize-model-test
  (testing "Basic denormalized model test"
    (mt/dataset sample-dataset
      (mt/with-temp* [Card [model
                            {:dataset_query
                             {:database (mt/id)
                              :type     :query
                              :query    {:source-table (mt/id :people)}}
                             :dataset true}]]
                     (let [{:keys [create_table_ddl inner_query sql_name result_metadata]} (metabot-util/denormalize-model model)]
                       (is (string? create_table_ddl))
                       (is (string? sql_name))
                       (is (string? inner_query))
                       (is
                         (= #{"Affiliate"
                              "Facebook"
                              "Google"
                              "Organic"
                              "Twitter"}
                            (->> result_metadata
                                 (some (fn [{:keys [sql_name] :as rsmd}] (when (= "SOURCE" sql_name) rsmd)))
                                 :possible_values
                                 set))))
                     (:result_metadata model)))))

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
                           {:keys [models model_json_summary sql_name]} (metabot-util/denormalize-database database)]
                       (is (=
                             (count (t2/select Card :database_id (mt/id) :dataset true))
                             (count models)))
                       (is (string? model_json_summary))
                       (is (string? sql_name)))))))

(deftest create-prompt-test
  (testing "We can do prompt lookup and interpolation"
    (with-redefs [metabot-util/*prompt-templates* (constantly metabot-test/test-prompt-templates)]
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
    (let [sql "SELECT * FROM SOMETHING"
          bot-str (format "kmfeasf fasel;f fasefes; fasef;o ```%s```feafs feass" sql)]
      (is (= (mdb.query/format-sql sql)
             (metabot-util/extract-sql bot-str)))))
  (testing "Test that we detect SQL embedded in markdown with language hint"
    (let [sql "SELECT * FROM SOMETHING"
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

(deftest ensure-generated-sql-works-test
  (testing "Ensure the generated sql (including creating a CTE and querying from it) is valid (i.e. produces a result)."
    (mt/test-drivers #{:h2 :postgres :redshift}
      (mt/dataset sample-dataset
        (mt/with-temp* [Card [{model-name :name :as model}
                              {:dataset_query
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :people)}}
                               :dataset true}]]
          (let [{:keys [inner_query] :as denormalized-model} (metabot-util/denormalize-model model)
                sql     (metabot-util/bot-sql->final-sql
                         denormalized-model
                         (format "SELECT * FROM %s" model-name))
                results (qp/process-query
                         {:database (mt/id)
                          :type     "native"
                          :native   {:query         sql
                                     :template-tags (update-vals
                                                     (lib-native/template-tags inner_query)
                                                     (fn [m] (update m :id str)))}})]
            (is (some? (seq (get-in results [:data :rows]))))))))))
