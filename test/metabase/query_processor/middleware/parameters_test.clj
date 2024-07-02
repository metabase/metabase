(ns metabase.query-processor.middleware.parameters-test
  "Testings to make sure the parameter substitution middleware works as expected. Even though the below tests are
  SQL-specific, they still confirm that the middleware itself is working correctly."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.models.card :refer [Card]]
   [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
   [metabase.query-processor.middleware.parameters :as parameters]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (clojure.lang ExceptionInfo)))

(deftest ^:parallel move-top-level-params-to-inner-query-test
  (is (= {:type            :native
          :native          {:query "WOW", :parameters ["My Param"]}
          :user-parameters ["My Param"]}
         (#'parameters/move-top-level-params-to-inner-query
          {:type :native, :native {:query "WOW"}, :parameters ["My Param"]})))
  (testing "when top-level query is a model"
    (testing "and there are parameters, wrap it up as a :source-query"
      (is (= {:type            :query
              :query           {:source-query {:source-table 5}
                                :parameters   ["My Param"]}
              :info            {:metadata/model-metadata []}
              :user-parameters ["My Param"]}
             (#'parameters/move-top-level-params-to-inner-query
               {:type       :query
                :query      {:source-table 5}
                :parameters ["My Param"]
                :info       {:metadata/model-metadata []}}))))
    (testing "without parameters, leave the model at the top level"
      (is (= {:type            :query
              :query           {:source-table 5
                                :parameters   ["My Param"]}
              :user-parameters ["My Param"]}
             (#'parameters/move-top-level-params-to-inner-query
               {:type       :query
                :query      {:source-table 5}
                :parameters ["My Param"]}))))))

(defn- substitute-params [query]
  (letfn [(thunk []
            (driver/with-driver :h2
              (parameters/substitute-parameters (mbql.normalize/normalize query))))]
    (driver/with-driver :h2
      (if (qp.store/initialized?)
        (thunk)
        (qp.store/with-metadata-provider meta/metadata-provider
          (thunk))))))

(deftest ^:parallel expand-mbql-top-level-params-test
  (testing "can we expand MBQL params if they are specified at the top level?"
    (is (= (mt/mbql-query venues
             {:aggregation [[:count]]
              :filter      [:= $price 1]})
           (substitute-params
            (mt/mbql-query venues
             {:aggregation [[:count]]
              :parameters  [{:name "price", :type :category, :target $price, :value 1}]}))))))

(deftest ^:parallel expand-native-top-level-params-test
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

(deftest ^:parallel expand-mbql-source-query-params-test
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

(deftest ^:parallel expand-mbql-source-query-date-expression-param-test
  (testing "can we expand MBQL number and date expression params in a source query?"
    (is (= (mt/mbql-query users
             {:source-query {:source-table (meta/id :users)
                             :expressions {"date-column" [:field (meta/id :users :last-login) nil]
                                           "number-column" [:field (meta/id :users :id) nil]}
                             :filter [:and
                                      [:between [:expression "date-column"] "2019-09-29" "2023-09-29"]
                                      [:= [:expression "number-column"] 1]]}})
           (substitute-params
            (mt/mbql-query users
              {:source-query {:source-table (meta/id :users)
                              :expressions {"date-column" [:field (meta/id :users :last-login) nil]
                                            "number-column" [:field (meta/id :users :id) nil]}
                              :parameters   [{:type :date/range
                                              :value "2019-09-29~2023-09-29"
                                              :target [:dimension [:expression "date-column"]]}
                                             {:type :category
                                              :value 1
                                              :target [:dimension [:expression "number-column"]]}]}}))))))

(deftest ^:parallel expand-native-source-query-params-test
  (testing "can we expand native params if in a source query?"
    (is (= (mt/mbql-query nil
             {:source-query {:native "SELECT * FROM categories WHERE name = ?;"
                             :params ["BBQ"]}})
           (substitute-params
            (mt/mbql-query nil
              {:source-query {:native         "SELECT * FROM categories WHERE name = {{cat}};"
                              :template-tags {"cat" {:name "cat", :display-name "Category", :type :text}}
                              :parameters    [{:type "category", :target [:variable [:template-tag "cat"]], :value "BBQ"}]}}))))))

(deftest ^:parallel expand-mbql-join-params-test
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

(deftest ^:parallel expand-native-join-params-test
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

(deftest ^:parallel expand-multiple-mbql-params-test
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

(deftest ^:parallel expand-multiple-mbql-params-in-joins-test
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

(defn- native-query [inner-query]
  {:database (meta/id)
   :type     :native
   :native   inner-query})

(def ^:private mock-native-query-cards-metadata-provider
  (lib.tu/metadata-provider-with-cards-for-queries
   meta/metadata-provider
   [(native-query {:query "SELECT 1"})
    (native-query {:query "SELECT 2"})
    (native-query
     {:query         "SELECT * FROM {{#1}} AS c1"
      :template-tags (card-template-tags [1])})]))

(deftest ^:parallel expand-multiple-referenced-cards-in-template-tags
  (testing "multiple sub-queries, referenced in template tags, are correctly substituted"
    (qp.store/with-metadata-provider mock-native-query-cards-metadata-provider
      (is (=? (native-query
               {:query "SELECT COUNT(*) FROM (SELECT 1) AS c1, (SELECT 2) AS c2", :params []})
              (substitute-params
               (native-query
                {:query         (str "SELECT COUNT(*) FROM {{#" 1 "}} AS c1, {{#" 2 "}} AS c2")
                 :template-tags (card-template-tags [1 2])})))))))

(deftest ^:parallel expand-multiple-referenced-cards-in-template-tags-2
  (testing "multiple CTE queries, referenced in template tags, are correctly substituted"
    (qp.store/with-metadata-provider mock-native-query-cards-metadata-provider
      (is (=? (native-query
               {:query "WITH c1 AS (SELECT 1), c2 AS (SELECT 2) SELECT COUNT(*) FROM c1, c2", :params []})
              (substitute-params
               (native-query
                {:query         "WITH c1 AS {{#1}}, c2 AS {{#2}} SELECT COUNT(*) FROM c1, c2"
                 :template-tags (card-template-tags [1 2])})))))))

(deftest ^:parallel expand-multiple-referenced-cards-in-template-tags-3
  (testing "recursive native queries, referenced in template tags, are correctly substituted"
    (qp.store/with-metadata-provider mock-native-query-cards-metadata-provider
      (is (=? (native-query
               {:query "SELECT COUNT(*) FROM (SELECT * FROM (SELECT 1) AS c1) AS c2", :params []})
              (substitute-params
               (native-query
                {:query         "SELECT COUNT(*) FROM {{#3}} AS c2"
                 :template-tags (card-template-tags [3])})))))))

(deftest ^:parallel expand-multiple-referenced-cards-in-template-tags-4
  (testing "recursive native/MBQL queries, referenced in template tags, are correctly substituted"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [(lib.tu.macros/mbql-query venues)
                                       (native-query
                                        {:query         "SELECT * FROM {{#1}} AS c1"
                                         :template-tags (card-template-tags [1])})])
      (let [card-1-subquery (str "SELECT "
                                 "\"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", "
                                 "\"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\", "
                                 "\"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\", "
                                 "\"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\", "
                                 "\"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\", "
                                 "\"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
                                 "FROM \"PUBLIC\".\"VENUES\"")]
        (is (=? (native-query
                 {:query (str "SELECT COUNT(*) FROM (SELECT * FROM (" card-1-subquery ") AS c1) AS c2") :params []})
                (substitute-params
                 (native-query
                  {:query         "SELECT COUNT(*) FROM {{#2}} AS c2"
                   :template-tags (card-template-tags [2])}))))))))

(deftest ^:parallel referencing-cards-with-parameters-test
  (testing "referencing card with parameter and default value substitutes correctly"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [(native-query
                                        {:query         "SELECT {{x}}"
                                         :template-tags {"x"
                                                         {:id           "x"
                                                          :name         "x"
                                                          :display-name "Number x"
                                                          :type         :number
                                                          :default      "1"
                                                          :required     true}}})])
      (is (=? (native-query
               {:query "SELECT * FROM (SELECT 1) AS x", :params []})
              (substitute-params
               (native-query
                {:query         "SELECT * FROM {{#1}} AS x"
                 :template-tags (card-template-tags [1])})))))))

(deftest ^:parallel referencing-cards-with-parameters-test-2
  (testing "referencing card with parameter and NO default value, fails substitution"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [(native-query
                                        {:query         "SELECT {{x}}"
                                         :template-tags {"x"
                                                         {:id           "x"
                                                          :name         "x"
                                                          :display-name "Number x"
                                                          :type         :number
                                                          :required     true}}})])
      (is (thrown-with-msg?
           ExceptionInfo
           #"\QYou'll need to pick a value for 'Number x' before this query can run.\E"
           (substitute-params
            (native-query
             {:query         "SELECT * FROM {{#1}} AS x"
              :template-tags (card-template-tags [1])})))))))

(defn- snippet-template-tags
  [snippet-name->id]
  (into {} (for [[snippet-name snippet-id] snippet-name->id]
             [snippet-name {:name         snippet-name
                            :display-name snippet-name
                            :type         :snippet
                            :snippet-name snippet-name
                            :snippet-id   snippet-id}])))

(deftest expand-multiple-snippets-test
  (t2.with-temp/with-temp [NativeQuerySnippet select-snippet {:content     "name, price"
                                                              :creator_id  (mt/user->id :rasta)
                                                              :description "Fields to SELECT"
                                                              :name        "Venue fields"}
                           NativeQuerySnippet where-snippet  {:content     "price > 2"
                                                              :creator_id  (mt/user->id :rasta)
                                                              :description "Meant for use in WHERE clause"
                                                              :name        "Filter: expensive venues"}
                           Card card {:dataset_query
                                      (mt/native-query
                                        {:query         (str "SELECT {{ Venue fields }} "
                                                             "FROM venues "
                                                             "WHERE {{ Filter: expensive venues }}")
                                         :template-tags (snippet-template-tags
                                                         {"Venue fields"             (:id select-snippet)
                                                          "Filter: expensive venues" (:id where-snippet)})})}]
    (qp.store/with-metadata-provider (mt/id)
      (testing "multiple snippets are correctly expanded in parent query"
        (is (= (mt/native-query
                 {:query "SELECT name, price FROM venues WHERE price > 2", :params nil})
               (substitute-params (:dataset_query card)))))
      (testing "multiple snippets are expanded from saved sub-query"
        (is (=? (mt/native-query
                  {:query "SELECT * FROM (SELECT name, price FROM venues WHERE price > 2) AS x", :params []})
                (substitute-params
                 (mt/native-query
                   {:query         (str "SELECT * FROM {{#" (:id card) "}} AS x")
                    :template-tags (card-template-tags [(:id card)])}))))))))

(deftest ^:parallel include-card-parameters-test
  (testing "Expanding a Card reference should include its parameters (#12236)"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [(lib.tu.macros/mbql-query orders
                                         {:filter      [:between $total 30 60]
                                          :aggregation [[:aggregation-options
                                                         [:count-where
                                                          [:starts-with $product-id->products.category "G"]]
                                                         {:name "G Monies", :display-name "G Monies"}]]
                                          :breakout    [!month.created-at]})])
      (let [card-tag "#1"
            query    (native-query
                      {:query         (format "SELECT * FROM {{%s}}" card-tag)
                       :template-tags {card-tag
                                       {:id           "5aa37572-058f-14f6-179d-a158ad6c029d"
                                        :name         card-tag
                                        :display-name card-tag
                                        :type         :card
                                        :card-id      1}}})]
        (is (malli= [:map
                     [:native
                      [:map
                       [:query  ::lib.schema.common/non-blank-string]
                       [:params [:= ["G%"]]]]]]
                    (substitute-params query)))))))
