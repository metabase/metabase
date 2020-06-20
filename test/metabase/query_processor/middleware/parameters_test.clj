(ns metabase.query-processor.middleware.parameters-test
  "Testings to make sure the parameter substitution middleware works as expected. Even though the below tests are
  SQL-specific, they still confirm that the middleware itself is working correctly."
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [test :as mt]]
            [metabase.mbql.normalize :as normalize]
            [metabase.models
             [card :refer [Card]]
             [native-query-snippet :refer [NativeQuerySnippet]]]
            [metabase.query-processor.middleware.parameters :as parameters])
  (:import clojure.lang.ExceptionInfo))

(deftest move-top-level-params-to-inner-query-test
  (is (= {:type   :native
          :native {:query "WOW", :parameters ["My Param"]}
          :user-parameters ["My Param"]}
         (#'parameters/move-top-level-params-to-inner-query
          {:type :native, :native {:query "WOW"}, :parameters ["My Param"]}))))

(defn- substitute-params [query]
  (driver/with-driver :h2
    (:pre (mt/test-qp-middleware parameters/substitute-parameters (normalize/normalize query)))))

(deftest expand-mbql-top-level-params-test
  (testing "can we expand MBQL params if they are specified at the top level?"
    (is (= (mt/mbql-query venues
             {:aggregation [[:count]]
              :filter      [:= $price 1]})
           (substitute-params
            (mt/mbql-query venues
             {:aggregation [[:count]]
              :parameters  [{:name "price", :type :category, :target $price, :value 1}]}))))))

(deftest expand-native-top-level-params-test
  (testing "can we expand native params if they are specified at the top level?"
    (is (= (mt/query nil
             {:type   :native
              :native {:query "SELECT * FROM venues WHERE price = 1;", :params []}
              :user-parameters [{:type :category, :target [:variable [:template-tag "price"]], :value "1"}]})
           (substitute-params
            (mt/query nil
              {:type       :native
               :native     {:query         "SELECT * FROM venues WHERE price = {{price}};"
                            :template-tags {"price" {:name "price", :display-name "Price", :type :number}}}
               :parameters [{:type "category", :target [:variable [:template-tag "price"]], :value "1"}]}))))))

(deftest expand-mbql-source-query-params-test
  (testing "can we expand MBQL params in a source query?"
    (is (= (mt/mbql-query venues
             {:source-query {:source-table $$venues
                             :filter       [:= $price 1]}
              :aggregation  [[:count]]})
           (substitute-params
            (mt/mbql-query venues
              {:source-query {:source-table $$venues
                              :parameters   [{:name "price", :type :category, :target $price, :value 1}]}
               :aggregation  [[:count]]}))))))

(deftest expand-native-source-query-params-test
  (testing "can we expand native params if in a source query?"
    (is (= (mt/mbql-query nil
             {:source-query {:native "SELECT * FROM categories WHERE name = ?;"
                             :params ["BBQ"]}})
           (substitute-params
            (mt/mbql-query nil
              {:source-query {:native         "SELECT * FROM categories WHERE name = {{cat}};"
                              :template-tags {"cat" {:name "cat", :display-name "Category", :type :text}}
                              :parameters    [{:type "category", :target [:variable [:template-tag "cat"]], :value "BBQ"}]}}))))))

(deftest expand-mbql-join-params-test
  (testing "can we expand MBQL params in a JOIN?"
    (is (= (mt/mbql-query venues
             {:aggregation [[:count]]
              :joins       [{:source-query {:source-table $$categories
                                            :filter       [:= $categories.name "BBQ"]}
                             :alias        "c"
                             :condition    [:= $category_id &c.categories.id]}]})
           (substitute-params
            (mt/mbql-query venues
              {:aggregation [[:count]]
               :joins       [{:source-table $$categories
                              :alias        "c"
                              :condition    [:= $category_id &c.categories.id]
                              :parameters   [{:type "category", :target $categories.name, :value "BBQ"}]}]}))))))

(deftest expand-native-join-params-test
  (testing "can we expand native params in a JOIN?"
    (is (= (mt/mbql-query venues
             {:aggregation [[:count]]
              :joins       [{:source-query {:native "SELECT * FROM categories WHERE name = ?;"
                                            :params ["BBQ"]}
                             :alias        "c"
                             :condition    [:= $category_id &c.*categories.id]}]})
           (substitute-params
            (mt/mbql-query venues
              {:aggregation [[:count]]
               :joins       [{:source-query {:native        "SELECT * FROM categories WHERE name = {{cat}};"
                                             :template-tags {"cat" {:name "cat", :display-name "Category", :type :text}}
                                             :parameters    [{:type "category", :target [:variable [:template-tag "cat"]], :value "BBQ"}]}
                              :alias        "c"
                              :condition    [:= $category_id &c.*categories.id]}]}))))))

(deftest expand-multiple-mbql-params-test
  (testing "can we expand multiple sets of MBQL params?"
    (is (=
         (mt/mbql-query venues
           {:source-query {:source-table $$venues
                           :filter       [:= $price 1]}
            :aggregation  [[:count]]
            :joins        [{:source-query {:source-table $$categories
                                           :filter       [:= $categories.name "BBQ"]}
                            :alias        "c"
                            :condition    [:= $category_id &c.categories.id]}]})
         (substitute-params
          (mt/mbql-query venues
            {:source-query {:source-table $$venues
                            :parameters   [{:name "price", :type :category, :target $price, :value 1}]}
             :aggregation  [[:count]]
             :joins        [{:source-table $$categories
                             :alias        "c"
                             :condition    [:= $category_id &c.categories.id]
                             :parameters   [{:type "category", :target $categories.name, :value "BBQ"}]}]}))))))

(deftest expand-multiple-mbql-params-in-joins-test
  ;; (This is dumb. Hopefully no one is creating queries like this.  The `:parameters` should go in the source query
  ;; instead of in the join.)
  (testing "can we expand multiple sets of MBQL params with params in a join and the join's source query?"
    (is (= (mt/mbql-query venues
             {:aggregation [[:count]]
              :joins       [{:source-query {:source-table $$categories
                                            :filter       [:and
                                                           [:= $categories.name "BBQ"]
                                                           [:= $categories.id 5]]}
                             :alias        "c"
                             :condition    [:= $category_id &c.categories.id]}]})
           (substitute-params
            (mt/mbql-query venues
              {:aggregation [[:count]]
               :joins       [{:source-query {:source-table $$categories
                                             :parameters   [{:name "id", :type :category, :target $categories.id, :value 5}]}
                              :alias        "c"
                              :condition    [:= $category_id &c.categories.id]
                              :parameters   [{:type "category", :target $categories.name, :value "BBQ"}]}]}))))))

(defn- card-template-tag
  [card-id]
  (let [tag (str "#" card-id)]
    {:id tag, :name tag, :display-name tag, :type "card", :card-id card-id}))

(defn card-template-tags
  "Generate the map representing card template tags (sub-queries) for the given `card-ids`."
  [card-ids]
  (into {} (for [card-id card-ids]
             [(str "#" card-id) (card-template-tag card-id)])))

(deftest expand-multiple-referenced-cards-in-template-tags
  (testing "multiple sub-queries, referenced in template tags, are correctly substituted"
    (mt/with-temp* [Card [card-1 {:dataset_query (mt/native-query {:query "SELECT 1"})}]
                    Card [card-2 {:dataset_query (mt/native-query {:query "SELECT 2"})}]]
      (let [card-1-id  (:id card-1)
            card-2-id  (:id card-2)]
        (is (= (mt/native-query
                {:query "SELECT COUNT(*) FROM (SELECT 1) AS c1, (SELECT 2) AS c2" :params nil})
               (substitute-params
                (mt/native-query
                 {:query         (str "SELECT COUNT(*) FROM {{#" card-1-id "}} AS c1, {{#" card-2-id "}} AS c2")
                  :template-tags (card-template-tags [card-1-id card-2-id])})))))))

  (testing "multiple CTE queries, referenced in template tags, are correctly substituted"
    (mt/with-temp* [Card [card-1 {:dataset_query (mt/native-query {:query "SELECT 1"})}]
                    Card [card-2 {:dataset_query (mt/native-query {:query "SELECT 2"})}]]
      (let [card-1-id  (:id card-1)
            card-2-id  (:id card-2)]
        (is (= (mt/native-query
                {:query "WITH c1 AS (SELECT 1), c2 AS (SELECT 2) SELECT COUNT(*) FROM c1, c2" :params nil})
               (substitute-params
                (mt/native-query
                 {:query         (str "WITH c1 AS {{#" card-1-id "}}, "
                                      "c2 AS {{#" card-2-id "}} SELECT COUNT(*) FROM c1, c2")
                  :template-tags (card-template-tags [card-1-id card-2-id])})))))))

  (testing "recursive native queries, referenced in template tags, are correctly substituted"
    (mt/with-temp* [Card [card-1 {:dataset_query (mt/native-query {:query "SELECT 1"})}]
                    Card [card-2 {:dataset_query (mt/native-query
                                                  {:query         (str "SELECT * FROM {{#" (:id card-1) "}} AS c1")
                                                   :template-tags (card-template-tags [(:id card-1)])})}]]
      (let [card-1-id  (:id card-1)
            card-2-id  (:id card-2)]
        (is (= (mt/native-query
                {:query "SELECT COUNT(*) FROM (SELECT * FROM (SELECT 1) AS c1) AS c2" :params nil})
               (substitute-params
                (mt/native-query
                 {:query         (str "SELECT COUNT(*) FROM {{#" card-2-id "}} AS c2")
                  :template-tags (card-template-tags [card-2-id])})))))))

  (testing "recursive native/MBQL queries, referenced in template tags, are correctly substituted"
    (mt/with-temp* [Card [card-1 {:dataset_query (mt/mbql-query venues)}]
                    Card [card-2 {:dataset_query (mt/native-query
                                                  {:query         (str "SELECT * FROM {{#" (:id card-1) "}} AS c1")
                                                   :template-tags (card-template-tags [(:id card-1)])})}]]
      (let [card-1-id  (:id card-1)
            card-2-id  (:id card-2)
            card-1-subquery (str "SELECT "
                                   "\"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", "
                                   "\"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\", "
                                   "\"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\", "
                                   "\"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\", "
                                   "\"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\", "
                                   "\"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
                                 "FROM \"PUBLIC\".\"VENUES\" "
                                 "LIMIT 1048576")]
        (is (= (mt/native-query
                {:query (str "SELECT COUNT(*) FROM (SELECT * FROM (" card-1-subquery ") AS c1) AS c2") :params nil})
               (substitute-params
                (mt/native-query
                 {:query         (str "SELECT COUNT(*) FROM {{#" card-2-id "}} AS c2")
                  :template-tags (card-template-tags [card-2-id])}))))))))

(deftest referencing-cards-with-parameters-test
  (testing "referencing card with parameter and default value substitutes correctly"
    (mt/with-temp Card [param-card {:dataset_query (mt/native-query
                                                    {:query "SELECT {{x}}"
                                                     :template-tags {"x"
                                                                     {:id "x", :name "x", :display-name "Number x",
                                                                      :type :number, :default "1", :required true}}})}]
      (is (= (mt/native-query
              {:query "SELECT * FROM (SELECT 1) AS x" :params nil})
             (substitute-params
              (mt/native-query
               {:query         (str "SELECT * FROM {{#" (:id param-card) "}} AS x")
                :template-tags (card-template-tags [(:id param-card)])}))))))

  (testing "referencing card with parameter and NO default value, fails substitution"
    (mt/with-temp Card [param-card {:dataset_query (mt/native-query
                                                    {:query "SELECT {{x}}"
                                                     :template-tags {"x"
                                                                     {:id "x", :name "x", :display-name "Number x",
                                                                      :type :number, :required false}}})}]
      (is (thrown? ExceptionInfo
            (substitute-params
             (mt/native-query
              {:query         (str "SELECT * FROM {{#" (:id param-card) "}} AS x")
               :template-tags (card-template-tags [(:id param-card)])})))))))

(defn- snippet-template-tags
  [snippet-name->id]
  (into {} (for [[snippet-name snippet-id] snippet-name->id]
             [snippet-name {:name         snippet-name
                            :display-name snippet-name
                            :type         :snippet
                            :snippet-name snippet-name
                            :snippet-id   snippet-id}])))

(deftest expand-multiple-snippets-test
  (mt/with-temp* [NativeQuerySnippet [select-snippet {:content     "name, price"
                                                      :creator_id  (mt/user->id :rasta)
                                                      :description "Fields to SELECT"
                                                      :name        "Venue fields"}]
                  NativeQuerySnippet [where-snippet  {:content     "price > 2"
                                                      :creator_id  (mt/user->id :rasta)
                                                      :description "Meant for use in WHERE clause"
                                                      :name        "Filter: expensive venues"}]
                  Card [card {:dataset_query
                              (mt/native-query
                                {:query         (str "SELECT {{ Venue fields }} "
                                                     "FROM venues "
                                                     "WHERE {{ Filter: expensive venues }}")
                                 :template-tags (snippet-template-tags
                                                 {"Venue fields"             (:id select-snippet)
                                                  "Filter: expensive venues" (:id where-snippet)})})}]]
    (testing "multiple snippets are correctly expanded in parent query"
      (is (= (mt/native-query
               {:query "SELECT name, price FROM venues WHERE price > 2", :params nil})
             (substitute-params (:dataset_query card)))))

    (testing "multiple snippets are expanded from saved sub-query"
      (is (= (mt/native-query
               {:query "SELECT * FROM (SELECT name, price FROM venues WHERE price > 2) AS x", :params nil})
             (substitute-params
              (mt/native-query
                {:query         (str "SELECT * FROM {{#" (:id card) "}} AS x")
                 :template-tags (card-template-tags [(:id card)])})))))))
