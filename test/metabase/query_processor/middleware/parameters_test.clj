(ns metabase.query-processor.middleware.parameters-test
  "Testings to make sure the parameter substitution middleware works as expected. Even though the below tests are
  SQL-specific, they still confirm that the middleware itself is working correctly."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.parameters :as parameters]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]))

(defn- substitute-params
  ([query]
   (let [mp (or (:lib/metadata query)
                meta/metadata-provider)]
     (substitute-params mp query)))

  ([metadata-provider query]
   (driver/with-driver :h2
     (if (:lib/type query)
       (parameters/substitute-parameters query)
       (-> (lib/query metadata-provider (mbql.normalize/normalize query))
           parameters/substitute-parameters
           lib/->legacy-MBQL)))))

(deftest ^:parallel expand-mbql-top-level-params-test
  (testing "can we expand MBQL params if they are specified at the top level?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:aggregation [[:count]]
               :filter      [:= $price 1]})
            (substitute-params
             (lib.tu.macros/mbql-query venues
               {:aggregation [[:count]]
                :parameters  [{:name "price", :type :category, :target $price, :value 1}]}))))))

(deftest ^:parallel expand-native-top-level-params-test
  (testing "can we expand native params if they are specified at the top level?"
    (is (=? {:type            :native
             :native          {:query "SELECT * FROM venues WHERE price = 1;", :params []}
             :user-parameters [{:type :category, :target [:variable [:template-tag "price"]], :value "1"}]}
            (substitute-params
             {:database   (meta/id)
              :type       :native
              :native     {:query         "SELECT * FROM venues WHERE price = {{price}};"
                           :template-tags {"price" {:name "price", :display-name "Price", :type :number}}}
              :parameters [{:type "category", :target [:variable [:template-tag "price"]], :value "1"}]})))))

(deftest ^:parallel expand-mbql-source-query-params-test
  (testing "can we expand MBQL params in a source query?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query {:source-table $$venues
                              :filter       [:= $price 1]}
               :aggregation  [[:count]]})
            (substitute-params
             (lib.tu.macros/mbql-query venues
               {:source-query {:source-table $$venues
                               :parameters   [{:name "price", :type :category, :target $price, :value 1}]}
                :aggregation  [[:count]]}))))))

(deftest ^:parallel expand-mbql-source-query-date-expression-param-test
  (testing "can we expand MBQL number and date expression params in a source query?"
    (is (=? (lib.tu.macros/mbql-query users
              {:source-query {:source-table (meta/id :users)
                              :expressions {"date-column" [:field (meta/id :users :last-login) nil]
                                            "number-column" [:field (meta/id :users :id) nil]}
                              :filter [:and
                                       [:between [:expression "date-column"] "2019-09-29" "2023-09-29"]
                                       [:= [:expression "number-column"] 1]]}})
            (substitute-params
             (lib.tu.macros/mbql-query users
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
    (is (= (lib.tu.macros/mbql-query nil
             {:source-query {:native "SELECT * FROM categories WHERE name = ?;"
                             :params ["BBQ"]}})
           (substitute-params
            (lib.tu.macros/mbql-query nil
              {:source-query {:native         "SELECT * FROM categories WHERE name = {{cat}};"
                              :template-tags {"cat" {:name "cat", :display-name "Category", :type :text}}
                              :parameters    [{:type "category", :target [:variable [:template-tag "cat"]], :value "BBQ"}]}}))))))

(deftest ^:parallel expand-mbql-join-params-test
  (testing "can we expand MBQL params in a JOIN?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:aggregation [[:count]]
               :joins       [{:source-query {:source-table $$categories
                                             :filter       [:= $categories.name "BBQ"]}
                              :alias        "c"
                              :condition    [:= $category-id &c.categories.id]}]})
            (substitute-params
             (lib.tu.macros/mbql-query venues
               {:aggregation [[:count]]
                :joins       [{:source-table $$categories
                               :alias        "c"
                               :condition    [:= $category-id &c.categories.id]
                               :parameters   [{:type "category", :target $categories.name, :value "BBQ"}]}]}))))))

(deftest ^:parallel expand-native-join-params-test
  (testing "can we expand native params in a JOIN?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:aggregation [[:count]]
               :joins       [{:source-query {:native "SELECT * FROM categories WHERE name = ?;"
                                             :params ["BBQ"]}
                              :alias        "c"
                              :condition    [:= $category-id &c.*categories.id]}]})
            (substitute-params
             (lib.tu.macros/mbql-query venues
               {:aggregation [[:count]]
                :joins       [{:source-query {:native        "SELECT * FROM categories WHERE name = {{cat}};"
                                              :template-tags {"cat" {:name "cat", :display-name "Category", :type :text}}
                                              :parameters    [{:type "category", :target [:variable [:template-tag "cat"]], :value "BBQ"}]}
                               :alias        "c"
                               :condition    [:= $category-id &c.*categories.id]}]}))))))

(deftest ^:parallel expand-multiple-mbql-params-test
  (testing "can we expand multiple sets of MBQL params?"
    (is (=?
         (lib.tu.macros/mbql-query venues
           {:source-query {:source-table $$venues
                           :filter       [:= $price 1]}
            :aggregation  [[:count]]
            :joins        [{:source-query {:source-table $$categories
                                           :filter       [:= $categories.name "BBQ"]}
                            :alias        "c"
                            :condition    [:= $category-id &c.categories.id]}]})
         (substitute-params
          (lib.tu.macros/mbql-query venues
            {:source-query {:source-table $$venues
                            :parameters   [{:name "price", :type :category, :target $price, :value 1}]}
             :aggregation  [[:count]]
             :joins        [{:source-table $$categories
                             :alias        "c"
                             :condition    [:= $category-id &c.categories.id]
                             :parameters   [{:type "category", :target $categories.name, :value "BBQ"}]}]}))))))

(deftest ^:parallel expand-multiple-mbql-params-in-joins-test
  ;; (This is dumb. Hopefully no one is creating queries like this.  The `:parameters` should go in the source query
  ;; instead of in the join.)
  (testing "can we expand multiple sets of MBQL params with params in a join and the join's source query?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:aggregation [[:count]]
               :joins       [{:source-query {:source-table $$categories
                                             :filter       [:and
                                                            [:= $categories.id 5]
                                                            [:= $categories.name "BBQ"]]}
                              :alias        "c"
                              :condition    [:= $category-id &c.categories.id]}]})
            (substitute-params
             (lib.tu.macros/mbql-query venues
               {:aggregation [[:count]]
                :joins       [{:source-query {:source-table $$categories
                                              :parameters   [{:name "id", :type :category, :target $categories.id, :value 5}]}
                               :alias        "c"
                               :condition    [:= $category-id &c.categories.id]
                               :parameters   [{:type "category", :target $categories.name, :value "BBQ"}]}]}))))))

(defn- card-template-tag
  [card-id]
  (let [tag (str "#" card-id)]
    {:id tag, :name tag, :display-name tag, :type :card, :card-id card-id}))

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

    (is (=? (native-query
             {:query "SELECT COUNT(*) FROM (SELECT 1) AS c1, (SELECT 2) AS c2", :params []})
            (substitute-params
             mock-native-query-cards-metadata-provider
             (native-query
              {:query         (str "SELECT COUNT(*) FROM {{#" 1 "}} AS c1, {{#" 2 "}} AS c2")
               :template-tags (card-template-tags [1 2])}))))))

(deftest ^:parallel expand-multiple-referenced-cards-in-template-tags-2
  (testing "multiple CTE queries, referenced in template tags, are correctly substituted"
    (is (=? (native-query
             {:query "WITH c1 AS (SELECT 1), c2 AS (SELECT 2) SELECT COUNT(*) FROM c1, c2", :params []})
            (substitute-params
             mock-native-query-cards-metadata-provider
             (native-query
              {:query         "WITH c1 AS {{#1}}, c2 AS {{#2}} SELECT COUNT(*) FROM c1, c2"
               :template-tags (card-template-tags [1 2])}))))))

(deftest ^:parallel expand-multiple-referenced-cards-in-template-tags-3
  (testing "recursive native queries, referenced in template tags, are correctly substituted"
    (is (=? (native-query
             {:query "SELECT COUNT(*) FROM (SELECT * FROM (SELECT 1) AS c1) AS c2", :params []})
            (substitute-params
             mock-native-query-cards-metadata-provider
             (native-query
              {:query         "SELECT COUNT(*) FROM {{#3}} AS c2"
               :template-tags (card-template-tags [3])}))))))

(deftest ^:parallel expand-multiple-referenced-cards-in-template-tags-4
  (testing "recursive native/MBQL queries, referenced in template tags, are correctly substituted"
    (let [mp (lib.tu/metadata-provider-with-cards-for-queries
              meta/metadata-provider
              [(lib.tu.macros/mbql-query venues)
               (native-query
                {:query         "SELECT * FROM {{#1}} AS c1"
                 :template-tags (card-template-tags [1])})])
          card-1-subquery (str "SELECT "
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
               mp
               (native-query
                {:query         "SELECT COUNT(*) FROM {{#2}} AS c2"
                 :template-tags (card-template-tags [2])})))))))

(deftest ^:parallel referencing-cards-with-parameters-test
  (testing "referencing card with parameter and default value substitutes correctly"
    (let [mp (lib.tu/metadata-provider-with-cards-for-queries
              meta/metadata-provider
              [(native-query
                {:query         "SELECT {{x}}"
                 :template-tags {"x"
                                 {:id           "x"
                                  :name         "x"
                                  :display-name "Number x"
                                  :type         :number
                                  :default      "1"
                                  :required     true}}})])]
      (is (=? (native-query
               {:query "SELECT * FROM (SELECT 1) AS x", :params []})
              (substitute-params
               mp
               (native-query
                {:query         "SELECT * FROM {{#1}} AS x"
                 :template-tags (card-template-tags [1])})))))))

(deftest ^:parallel referencing-cards-with-parameters-test-2
  (testing "referencing card with parameter and NO default value, fails substitution"
    (let [mp (lib.tu/metadata-provider-with-cards-for-queries
              meta/metadata-provider
              [(native-query
                {:query         "SELECT {{x}}"
                 :template-tags {"x"
                                 {:id           "x"
                                  :name         "x"
                                  :display-name "Number x"
                                  :type         :number
                                  :required     true}}})])]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"\QYou'll need to pick a value for 'Number x' before this query can run.\E"
           (substitute-params
            mp
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

(deftest ^:parallel expand-multiple-snippets-test
  (let [mp (lib.tu/mock-metadata-provider
            meta/metadata-provider
            {:native-query-snippets [{:id          1
                                      :content     "name, price"
                                      :creator-id  (mt/user->id :rasta)
                                      :description "Fields to SELECT"
                                      :name        "Venue fields"}
                                     {:id          2
                                      :content     "price > 2"
                                      :creator-id  (mt/user->id :rasta)
                                      :description "Meant for use in WHERE clause"
                                      :name        "Filter: expensive venues"}]
             :cards                 [{:id            1
                                      :dataset-query (mt/native-query
                                                      {:query         (str "SELECT {{ Venue fields }} "
                                                                           "FROM venues "
                                                                           "WHERE {{ Filter: expensive venues }}")
                                                       :template-tags (snippet-template-tags
                                                                       {"Venue fields"             1
                                                                        "Filter: expensive venues" 2})})}]})]
    (testing "multiple snippets are correctly expanded in parent query"
      (is (=? {:stages [{:native "SELECT name, price FROM venues WHERE price > 2", :params nil}]}
              (substitute-params mp (:dataset-query (lib.metadata/card mp 1))))))
    (testing "multiple snippets are expanded from saved sub-query"
      (is (=? {:native {:query "SELECT * FROM (SELECT name, price FROM venues WHERE price > 2) AS x", :params []}}
              (substitute-params
               mp
               (mt/native-query
                {:query         "SELECT * FROM {{#1}} AS x"
                 :template-tags (card-template-tags [1])})))))))

(deftest ^:parallel include-card-parameters-test
  (testing "Expanding a Card reference should include its parameters (#12236)"
    (let [mp (lib.tu/metadata-provider-with-cards-for-queries
              meta/metadata-provider
              [(lib.tu.macros/mbql-query orders
                 {:filter      [:between $total 30 60]
                  :aggregation [[:aggregation-options
                                 [:count-where
                                  [:starts-with $product-id->products.category "G"]]
                                 {:name "G Monies", :display-name "G Monies"}]]
                  :breakout    [!month.created-at]})])
          card-tag "#1"
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
                  (substitute-params mp query))))))

;;; see also [[metabase.query-processor.parameters-test/filter-nested-queries-test]]
(deftest ^:parallel filter-nested-queries-test
  (testing "We should be able to apply filters explicitly targeting nested native stages (#48258)"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :dataset-query {:database (meta/id), :type :native, :native {:query "SELECT *"}}}]})
          query (assoc (mt/mbql-query nil
                         {:source-table "card__1", :limit 5})
                       :parameters [{:type   :date/all-options
                                     :target [:dimension [:field "DATE" {:base-type :type/Date}]]
                                     :value  "2014-01-06"}])
          query (assoc-in query [:parameters 0 :target 2 :stage-number] 0)]
      (is (=? {:parameters [{:target [:dimension [:field "DATE" {:base-type :type/Date}] {:stage-number 0}]
                             :value  "2014-01-06"}]}
              query))
      (is (=? {:query {:filter [:=
                                [:field "DATE" {:base-type :type/Date, :temporal-unit :day}]
                                "2014-01-06"]}}
              (substitute-params mp query))))))

(deftest ^:parallel stage-number-in-parameters-e2e-test
  (testing "We should be able to apply filters explicitly targeting nested native stages (#48258)"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :dataset-query {:database (meta/id)
                                           :type     :native
                                           :native   {:query "SELECT * FROM checkins;"}}}]})
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-5-query nil
                   {:stages     [{:source-card 1}]
                    :parameters [{:type   :date/all-options
                                  :target [:dimension [:field "DATE" {:base-type :type/Date}] {:stage-number 0}]
                                  :value  "2014-01-06"}]}))]
      (is (=? {:stages [{:native "SELECT * FROM checkins;"}
                        {:filters [[:=
                                    {}
                                    [:field {:temporal-unit :default} "DATE"]
                                    [:absolute-datetime {} #t "2014-01-06" :default]]]}]}
              (qp.preprocess/preprocess query))))))

(deftest ^:parallel nil-values-test
  (let [mp    meta/metadata-provider
        query (lib/query
               mp
               {:constraints {:max-results 10000, :max-results-bare-rows 2000}
                :lib/type    :mbql/query
                :stages      [{:lib/type      :mbql.stage/native
                               :template-tags {"equal"    {:id           "197c0532-e2f8-24be-8d71-757369d3a75f"
                                                           :name         "equal"
                                                           :display-name "Equal to"
                                                           :type         :dimension
                                                           :dimension    [:field
                                                                          {:lib/uuid       "1b435d67-0cb2-4f4d-bac5-d06b60be4eca"
                                                                           :base-type      :type/Float
                                                                           :effective-type :type/Float}
                                                                          (meta/id :products :rating)]
                                                           :widget-type  :number/=
                                                           :default      nil}
                                               "notEqual" {:id           "827ca517-e493-397f-971c-1a2d2f12d5f1"
                                                           :name         "notEqual"
                                                           :display-name "Not equal to"
                                                           :type         :dimension
                                                           :dimension    [:field
                                                                          {:lib/uuid       "c0ff814c-e0df-4e50-9e29-0c61f0bd2b3b"
                                                                           :base-type      :type/Float
                                                                           :effective-type :type/Float}
                                                                          (meta/id :products :rating)]
                                                           :widget-type  :number/!=
                                                           :default      nil}
                                               "between"  {:id           "6a3d9a46-671b-dee3-2971-fc180d27adfd"
                                                           :name         "between"
                                                           :display-name "Between"
                                                           :type         :dimension
                                                           :dimension    [:field
                                                                          {:lib/uuid       "c752de3e-e528-45ee-a8cc-687ce9329019"
                                                                           :base-type      :type/Float
                                                                           :effective-type :type/Float}
                                                                          (meta/id :products :rating)]
                                                           :widget-type  :number/between
                                                           :default      nil}}
                               :native        (str/join \space ["select PRODUCTS.TITLE, PRODUCTS.RATING from PRODUCTS where true"
                                                                "[[AND {{equal}}]]"
                                                                "[[AND {{notEqual}}]]"
                                                                "[[AND {{between}}]]"])}]
                :database    (meta/id)
                :parameters  [{:value [3.8], :type :number/=, :id "a57c8ec6", :target [:dimension [:template-tag "equal"] {"stage-number" 0}]}
                              {:value nil, :type :number/!=, :id "5da85a8c", :target [:dimension [:template-tag "notEqual"] {"stage-number" 0}]}
                              {:value [nil], :type :number/<=, :id "6b9e7189", :target [:dimension [:template-tag "between"] {"stage-number" 0}]}]})]
    (is (=? {:stages [{:lib/type :mbql.stage/native
                       :params   []
                       :native   (str "select PRODUCTS.TITLE, PRODUCTS.RATING"
                                      " from PRODUCTS"
                                      " where true AND (\"PUBLIC\".\"PRODUCTS\".\"RATING\" = 3.8)")}]}
            (qp.preprocess/preprocess query)))))

(deftest ^:parallel ignore-template-tag-parameters-in-mbql-stages-test
  (let [query {:lib/type     :mbql/query
               :lib/metadata meta/metadata-provider
               :database     (meta/id)
               :stages       [{:lib/type                     :mbql.stage/mbql
                               :source-table                 (meta/id :venues)
                               :qp/stage-is-from-source-card 1}
                              {:lib/type                 :mbql.stage/mbql
                               :qp/stage-had-source-card 1}]
               ;; dangling `template-tag` parameters can happen if you replace a source card that had a native query
               ;; with an MBQL one... we should just ignore these.
               :parameters   [{:id     "13ebc3b6"
                               :target [:dimension [:template-tag "RATING"] {:stage-number 0}]
                               :type   :number/=
                               :value  [3]}]}]
    (is (=? {:stages [{:parameters (symbol "nil #_\"key is not present.\"")}
                      {:parameters (symbol "nil #_\"key is not present.\"")}]}
            (substitute-params query)))))

(deftest ^:parallel expression-parameter-test
  (let [query {:lib/metadata meta/metadata-provider
               :lib/type     :mbql/query
               :database     (meta/id)
               :stages       [{:lib/type     :mbql.stage/mbql
                               :source-table (meta/id :orders)
                               :expressions  [[:field
                                               {:base-type                                         :type/Integer
                                                :effective-type                                    :type/Integer
                                                :lib/expression-name                               "Quantity_2"
                                                :lib/uuid                                          "a9212400-3b5f-4034-b7a0-f8848579af30"
                                                :metabase.lib.query/transformation-added-base-type true}
                                               (meta/id :orders :quantity)]]}]
               :parameters   [{:id     "c77842b9"
                               :target [:dimension
                                        [:expression "Quantity_2" {:base-type :type/Integer}]
                                        {:stage-number 0}]
                               :type   :number/=
                               :value  [14]}]}]
    (is (=? {:stages [{:filters [[:=
                                  {}
                                  [:expression {} "Quantity_2"]
                                  14]]}]}
            (substitute-params query)))))
