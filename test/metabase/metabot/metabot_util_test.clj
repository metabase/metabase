(ns metabase.metabot.metabot-util-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.query :as mdb.query]
   [metabase.lib.native :as lib-native]
   [metabase.metabot-test :as metabot-test]
   [metabase.metabot.client :as metabot-client]
   [metabase.metabot.settings :as metabot-settings]
   [metabase.metabot.util :as metabot-util]
   [metabase.models :refer [Card Database Table]]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

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

(deftest ^:parallel create-table-ddl-test
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
                                    {:display_name "BigCardinality"
                                     :base_type    :type/Integer}])}]
      (is (= (mdb.query/format-sql
              (str
               "create type SIZES_t as enum '1', '2', '3';"
               "CREATE TABLE \"TABLE\" ('NAME' TEXT,'FROOBY' BOOLEAN, 'AGE' INTEGER, 'SIZES' 'SIZES_t','BIGCARDINALITY' INTEGER)"))
             (mdb.query/format-sql
              (#'metabot-util/model->pseudo-ddl model)))))))

(deftest denormalize-field-cardinality-test
  (testing "Ensure enum-cardinality-threshold is respected in model denormalization"
    (mt/dataset test-data
      (mt/with-temp [Card model {:dataset_query
                                 {:database (mt/id)
                                  :type     :query
                                  :query    {:source-table (mt/id :people)}}
                                 :type :model}]
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 0]
          (let [{:keys [result_metadata]} (metabot-util/denormalize-model model)]
            (is (zero? (count (filter :possible_values result_metadata))))))
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 10]
          (let [{:keys [result_metadata]} (metabot-util/denormalize-model model)]
            (is (= 1 (count (filter :possible_values result_metadata))))))
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 50]
          (let [{:keys [result_metadata]} (metabot-util/denormalize-model model)]
            (is (= 2 (count (filter :possible_values result_metadata))))))))))

(deftest denormalize-model-test
  (testing "Basic denormalized model test"
    (mt/dataset test-data
      (mt/with-temp [Card model {:dataset_query
                                 {:database (mt/id)
                                  :type     :query
                                  :query    {:source-table (mt/id :people)}}
                                 :type :model}]
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
                   set))))))))

(deftest denormalize-database-test
  (testing "Basic denormalized database test"
    (mt/dataset test-data
      (mt/with-temp [Card _ {:dataset_query
                             {:database (mt/id)
                              :type     :query
                              :query    {:source-table (mt/id :orders)}}
                             :type :model}]
        (let [database (t2/select-one Database :id (mt/id))
              {:keys [models sql_name model_json_summary]} (metabot-util/denormalize-database database)]
          (is (=
               (count (t2/select Card :database_id (mt/id) :type :model))
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

(deftest ensure-generated-sql-works-test
  (testing "Ensure the generated sql (including creating a CTE and querying from it) is valid (i.e. produces a result)."
    (mt/test-drivers #{:h2 :postgres :redshift}
      (mt/dataset test-data
        (mt/with-temp [Card {model-name :name :as model} {:dataset_query
                                                          {:database (mt/id)
                                                           :type     :query
                                                           :query    {:source-table (mt/id :people)}}
                                                          :type :model}]
          (let [{:keys [inner_query] :as denormalized-model} (metabot-util/denormalize-model model)
                sql     (metabot-util/bot-sql->final-sql
                         denormalized-model
                         (format "SELECT * FROM %s" model-name))
                results (qp/process-query
                         {:database (mt/id)
                          :type     "native"
                          :native   {:query         sql
                                     :template-tags (update-vals
                                                     (lib-native/extract-template-tags inner_query)
                                                     (fn [m] (update m :id str)))}})]
            (is (some? (seq (get-in results [:data :rows]))))))))))

(deftest inner-query-test
  (testing "Ensure that a dataset-based query contains expected AS aliases"
    (mt/dataset test-data
      (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 0]
        (t2.with-temp/with-temp
         [Card orders-model {:name    "Orders Model"
                             :dataset_query
                             {:database (mt/id)
                              :type     :query
                              :query    {:source-table (mt/id :orders)}}
                             :type :model}]
         (let [{:keys [column_aliases inner_query create_table_ddl sql_name]} (metabot-util/denormalize-model orders-model)]
           (is (= 9 (count (re-seq #"\s+AS\s+" column_aliases))))
           (is (= 10 (count (re-seq #"\s+AS\s+" inner_query))))
           (is (= (mdb.query/format-sql
                   (str/join
                    [(format "CREATE TABLE \"%s\" (" sql_name)
                     "'ID' BIGINTEGER,"
                     "'USER_ID' INTEGER,"
                     "'PRODUCT_ID' INTEGER,"
                     "'SUBTOTAL' FLOAT,"
                     "'TAX' FLOAT,"
                     "'TOTAL' FLOAT,"
                     "'DISCOUNT' FLOAT,"
                     "'CREATED_AT' DATETIMEWITHLOCALTZ,"
                     "'QUANTITY' INTEGER)"]))
                  create_table_ddl))))))))

(deftest native-inner-query-test
  (testing "A SELECT * will produce column all column names in th resulting DDLs"
    (mt/dataset test-data
      (let [q               (mt/native-query {:query "SELECT * FROM ORDERS;"})
            result-metadata (get-in (qp/process-query q) [:data :results_metadata :columns])]
        (t2.with-temp/with-temp
          [Card orders-model {:name            "Orders Model"
                              :dataset_query   q
                              :result_metadata result-metadata
                              :type            :model}]
          (let [{:keys [column_aliases inner_query create_table_ddl sql_name]} (metabot-util/denormalize-model orders-model)]
            (is (= (mdb.query/format-sql
                    (format "SELECT %s FROM {{#%s}} AS INNER_QUERY" column_aliases (:id orders-model)))
                   inner_query))
            (is (= (mdb.query/format-sql
                    (str/join
                     [(format "CREATE TABLE \"%s\" (" sql_name)
                      "'ID' BIGINTEGER,"
                      "'USER_ID' INTEGER,"
                      "'PRODUCT_ID' INTEGER,"
                      "'SUBTOTAL' FLOAT,"
                      "'TAX' FLOAT,"
                      "'TOTAL' FLOAT,"
                      "'DISCOUNT' FLOAT,"
                      "'CREATED_AT' DATETIMEWITHLOCALTZ,"
                      "'QUANTITY' INTEGER)"]))
                   (mdb.query/format-sql create_table_ddl)))
            create_table_ddl))))))

(deftest native-inner-query-test-2
  (testing "A SELECT of columns will produce those column names in th resulting DDLs"
    (mt/dataset test-data
      (let [q               (mt/native-query {:query "SELECT TOTAL, QUANTITY, TAX, CREATED_AT FROM ORDERS;"})
            result-metadata (get-in (qp/process-query q) [:data :results_metadata :columns])]
        (t2.with-temp/with-temp
          [Card orders-model {:name            "Orders Model"
                              :dataset_query   q
                              :result_metadata result-metadata
                              :type            :model}]
          (let [{:keys [column_aliases inner_query create_table_ddl sql_name]} (metabot-util/denormalize-model orders-model)]
            (is (= (mdb.query/format-sql
                    (format "SELECT %s FROM {{#%s}} AS INNER_QUERY" column_aliases (:id orders-model)))
                   inner_query))
            (is (= (mdb.query/format-sql
                    (str/join
                     [(format "CREATE TABLE \"%s\" (" sql_name)
                      "'TOTAL' FLOAT,"
                      "'QUANTITY' INTEGER,"
                      "'TAX' FLOAT,"
                      "'CREATED_AT' DATETIMEWITHLOCALTZ)"]))
                   (mdb.query/format-sql create_table_ddl)))
            create_table_ddl))))))

(deftest native-inner-query-test-3
  (testing "Duplicate native column aliases will be deduplicated"
    (mt/dataset test-data
      (let [q               (mt/native-query {:query "SELECT TOTAL AS X, QUANTITY AS X FROM ORDERS;"})
            result-metadata (get-in (qp/process-query q) [:data :results_metadata :columns])]
        (t2.with-temp/with-temp
          [Card orders-model {:name            "Orders Model"
                              :dataset_query   q
                              :result_metadata result-metadata
                              :type            :model}]
          (let [{:keys [column_aliases inner_query create_table_ddl sql_name]} (metabot-util/denormalize-model orders-model)]
            (is (= (mdb.query/format-sql
                    (format "SELECT %s FROM {{#%s}} AS INNER_QUERY" column_aliases (:id orders-model)))
                   inner_query))
            (is (= (mdb.query/format-sql
                    (str/join
                     [(format "CREATE TABLE \"%s\" (" sql_name)
                      "'X' FLOAT,"
                      "'X_2' INTEGER)"]))
                   (mdb.query/format-sql create_table_ddl)))))))))

(deftest inner-query-with-joins-test
  (testing "Models with joins work"
    (mt/dataset test-data
      (t2.with-temp/with-temp
       [Card joined-model {:type        :model
                           :database_id (mt/id)
                           :query_type  :query
                           :dataset_query
                           (mt/mbql-query orders
                                          {:fields [$total &products.products.category]
                                           :joins  [{:source-table $$products
                                                     :condition    [:= $product_id &products.products.id]
                                                     :strategy     :left-join
                                                     :alias        "products"}]})}]
       (let [{:keys [column_aliases create_table_ddl sql_name]} (metabot-util/denormalize-model joined-model)]
         (is (= "\"TOTAL\" AS TOTAL, \"products__CATEGORY\" AS PRODUCTS_CATEGORY"
                column_aliases))
         (is (= (mdb.query/format-sql
                 (str/join
                  ["create type PRODUCTS_CATEGORY_t as enum 'Doohickey', 'Gadget', 'Gizmo', 'Widget';"
                   (format "CREATE TABLE \"%s\" (" sql_name)
                   "'TOTAL' FLOAT,"
                   "'PRODUCTS_CATEGORY' 'PRODUCTS_CATEGORY_t')"]))
                (mdb.query/format-sql create_table_ddl)))))))
  (testing "A model with joins on the same table will produce distinct aliases"
    (mt/dataset test-data
      (t2.with-temp/with-temp
       [Card joined-model {:type        :model
                           :database_id (mt/id)
                           :query_type  :query
                           :dataset_query
                           (mt/mbql-query products
                                          {:fields [$id $category &self.products.category]
                                           :joins  [{:source-table $$products
                                                     :condition    [:= $id &self.products.id]
                                                     :strategy     :left-join
                                                     :alias        "self"}]})}]
       (let [{:keys [column_aliases create_table_ddl sql_name]} (metabot-util/denormalize-model joined-model)]
         (is (= "\"ID\" AS ID, \"CATEGORY\" AS CATEGORY, \"self__CATEGORY\" AS SELF_CATEGORY"
                column_aliases))
         (is (= (mdb.query/format-sql
                 (str/join
                  ["create type CATEGORY_t as enum 'Doohickey', 'Gadget', 'Gizmo', 'Widget';"
                   "create type SELF_CATEGORY_t as enum 'Doohickey', 'Gadget', 'Gizmo', 'Widget';"
                   (format "CREATE TABLE \"%s\" (" sql_name)
                   "'ID' BIGINTEGER,"
                   "'CATEGORY' 'CATEGORY_t',"
                   "'SELF_CATEGORY' 'SELF_CATEGORY_t')"]))
                (mdb.query/format-sql create_table_ddl))))))))

(deftest inner-query-with-aggregations-test
  (testing "A model with aggregations will produce column names only (no AS aliases)"
    (mt/dataset test-data
      (t2.with-temp/with-temp
       [Card aggregated-model {:type        :model
                               :database_id (mt/id)
                               :query_type  :query
                               :dataset_query
                               (mt/mbql-query orders
                                              {:aggregation [[:sum $total]]
                                               :breakout    [$user_id]})}]
       (let [{:keys [column_aliases inner_query create_table_ddl sql_name]} (metabot-util/denormalize-model aggregated-model)]
         (is (= (mdb.query/format-sql
                 (format "SELECT USER_ID, SUM_OF_TOTAL FROM {{#%s}} AS INNER_QUERY" (:id aggregated-model)))
                inner_query))
         (is (= "USER_ID, SUM_OF_TOTAL" column_aliases))
         (is (= (format "CREATE TABLE \"%s\" ('USER_ID' INTEGER, 'SUM_OF_TOTAL' FLOAT)" sql_name)
                create_table_ddl))
         create_table_ddl)))))

(deftest inner-query-name-collisions-test
  (testing "When column names collide, each conflict is disambiguated with an _X postfix"
    (mt/dataset test-data
      (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 0]
        (t2.with-temp/with-temp
         [Card orders-model {:name    "Orders Model"
                             :dataset_query
                             {:database (mt/id)
                              :type     :query
                              :query    {:source-table (mt/id :orders)}}
                             :type :model}]
         (let [orders-model (update orders-model :result_metadata
                                    (fn [v]
                                      (map #(assoc % :display_name "ABC") v)))
               {:keys [column_aliases create_table_ddl]} (metabot-util/denormalize-model orders-model)]
           (is (= 9 (count (re-seq #"ABC(?:_\d+)?" column_aliases))))
           ;; Ensure that the same aliases are used in the create table ddl
           (is (= 9 (count (re-seq #"ABC" create_table_ddl))))))))))

(deftest inner-query-name-collisions-with-joins-test
  (testing "Models with name collisions across joins are also correctly disambiguated"
    (mt/dataset test-data
      (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 10]
        (t2.with-temp/with-temp
          [Card model {:type        :model
                       :database_id (mt/id)
                       :query_type  :query
                       :dataset_query
                       (mt/mbql-query orders
                         {:fields [$total &products.products.category &self.products.category]
                          :joins  [{:source-table $$products
                                    :condition    [:= $product_id &products.products.id]
                                    :strategy     :left-join
                                    :alias        "products"}
                                   {:source-table $$products
                                    :condition    [:= $id &self.products.id]
                                    :strategy     :left-join
                                    :alias        "self"}]})}]
          (let [model (update model :result_metadata
                              (fn [v]
                                (map #(assoc % :display_name "FOO") v)))
                {:keys [column_aliases #_create_table_ddl]} (metabot-util/denormalize-model model)]
            (is (= "\"TOTAL\" AS FOO, \"products__CATEGORY\" AS FOO_2, \"self__CATEGORY\" AS FOO_3"
                   column_aliases))
            ;; Ensure that the same aliases are used in the create table ddl
            ;; 7 = 3 for the column names + 2 for the type creation + 2 for the type references
            ;; FIXME: This test is flaky on CI (metabase#36785)
            #_(is (= 7 (count (re-seq #"FOO" create_table_ddl))))))))))

(deftest ^:parallel deconflicting-aliases-test
  (testing "Test sql_name generation deconfliction:
            - Potentially conflicting names are retained
            - As conflicts occur, _X is appended to each alias in increasing order, skipping existing aliases"
    (is
     (= [{:display_name "ABC", :sql_name "ABC"}
         {:display_name "AB", :sql_name "AB"}
         {:display_name "A B C", :sql_name "A_B_C"}
         {:display_name "ABC", :sql_name "ABC_2"}
         {:display_name "ABC_1", :sql_name "ABC_1"}
         {:display_name "ABC", :sql_name "ABC_3"}]
        (:result_metadata
         (#'metabot-util/add-sql-names
          {:result_metadata
           [{:display_name "ABC"}
            {:display_name "AB"}
            {:display_name "A B C"}
            {:display_name "ABC"}
            {:display_name "ABC_1"}
            {:display_name "ABC"}]}))))))

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
    (mt/dataset test-data
      (let [max-tokens 5000]
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 100]
          (with-redefs [metabot-client/*create-embedding-endpoint* (partial max-size-embedder max-tokens)]
            (let [{:keys [tokens]} (metabot-util/create-table-embedding (t2/select-one Table :id (mt/id :people)))]
              (is (<= 800 tokens max-tokens))
              tokens))))))
  (testing "The token limit is too high, we reduce the size of the prompt"
    (mt/dataset test-data
      (let [max-tokens 500]
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 100]
          (with-redefs [metabot-client/*create-embedding-endpoint* (partial max-size-embedder max-tokens)]
            (let [{:keys [tokens]} (metabot-util/create-table-embedding (t2/select-one Table :id (mt/id :people)))]
              (is (<= 400 tokens max-tokens))))))))
  (testing "The token limit is reduced to demonstrate that we produce nothing when we can't create a small enough prompt."
    (mt/dataset test-data
      (let [max-tokens 1]
        (tu/with-temporary-setting-values [metabot-settings/enum-cardinality-threshold 100]
          (with-redefs [metabot-client/*create-embedding-endpoint* (partial max-size-embedder max-tokens)]
            (let [response (metabot-util/create-table-embedding (t2/select-one Table :id (mt/id :people)))]
              (is (nil? response)))))))))
