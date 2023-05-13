(ns metabase.driver.sql.query-processor-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.driver.sql.query-processor.deprecated]
   [metabase.models.field :refer [Field]]
   [metabase.models.setting :as setting]
   [metabase.query-processor :as qp]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.test :as mt]
   [metabase.test.data.env :as tx.env]
   [metabase.util.honeysql-extensions :as hx]
   [schema.core :as s]
   [toucan2.core :as t2]))

(comment metabase.driver.sql.query-processor.deprecated/keep-me)

(deftest ^:parallel compiled-test
  (binding [hx/*honey-sql-version* 2]
    (is (= [:raw "x"]
           (sql.qp/->honeysql :sql (sql.qp/compiled [:raw "x"]))))))

(deftest ^:parallel default-select-test
  (are [hsql-version expected] (= expected
                                  (binding [hx/*honey-sql-version* hsql-version]
                                    (->> {:from [[(sql.qp/sql-source-query "SELECT *" nil)
                                                  (sql.qp/maybe-wrap-unaliased-expr (hx/identifier :table-alias "source"))]]}
                                         (#'sql.qp/add-default-select :sql)
                                         (sql.qp/format-honeysql :sql))))
    1 ["SELECT \"source\".* FROM (SELECT *) \"source\""]
    2 ["SELECT \"source\".* FROM (SELECT *) AS \"source\""]))

(deftest ^:parallel sql-source-query-validation-test
  (testing "[[sql.qp/sql-source-query]] should throw Exceptions if you pass in invalid nonsense"
    (doseq [params [nil [1000]]]
      (testing (format "Params = %s" (pr-str params))
        (is (instance? metabase.driver.sql.query_processor.deprecated.SQLSourceQuery
                       (sql.qp/sql-source-query "SELECT *" params)))))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Expected native source query to be a string, got: clojure.lang.PersistentArrayMap"
         (sql.qp/sql-source-query {:native "SELECT *"} nil)))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Expected native source query parameters to be sequential, got: java.lang.Long"
         (sql.qp/sql-source-query "SELECT *" 1000)))))

(deftest ^:parallel process-mbql-query-keys-test
  (testing "make sure our logic for deciding which order to process keys in the query works as expected"
    (is (= [:source-table :breakout :aggregation :fields :abc :def]
           (#'sql.qp/query->keys-in-application-order
            {:def          6
             :abc          5
             :source-table 1
             :aggregation  3
             :fields       4
             :breakout     2})))))

(defn- mbql->native [query]
  (mt/with-everything-store
    (driver/with-driver :h2
      (-> (sql.qp/mbql->native :h2 (qp/preprocess query))
          :query
          sql.qp-test-util/pretty-sql))))

(deftest ^:parallel not-null-test
  (is (= '{:select [COUNT (*) AS count]
           :from   [CHECKINS]
           :where  [CHECKINS.DATE IS NOT NULL]}
         (-> (mt/mbql-query checkins
               {:aggregation [[:count]]
                :filter      [:not-null $date]})
             mbql->native
             sql.qp-test-util/sql->sql-map))))

(deftest ^:parallel case-test
  (testing "Test that boolean case defaults are kept (#24100)"
    (is (= [[1 1 true]
            [2 0 false]]
           (mt/rows
            (mt/run-mbql-query venues
              {:source-table $$venues
               :order-by     [[:asc $id]]
               :expressions  {"First int"  [:case [[[:= $id 1] 1]]    {:default 0}]
                              "First bool" [:case [[[:= $id 1] true]] {:default false}]}
               :fields       [$id [:expression "First int" nil] [:expression "First bool" nil]]
               :limit        2}))))))

(deftest ^:parallel join-test
  (testing "Test that correct identifiers are used for joins"
    (are [join-type] (= '{:select   [VENUES.ID          AS ID
                                     VENUES.NAME        AS NAME
                                     VENUES.CATEGORY_ID AS CATEGORY_ID
                                     VENUES.LATITUDE    AS LATITUDE
                                     VENUES.LONGITUDE   AS LONGITUDE
                                     VENUES.PRICE       AS PRICE]
                          :from     [VENUES]
                          join-type [CATEGORIES AS c
                                     ON VENUES.CATEGORY_ID = c.ID]
                          :where    [c.NAME = ?]
                          :order-by [VENUES.ID ASC]
                          :limit    [100]}
                        (-> (mt/mbql-query venues
                              {:source-table $$venues
                               :order-by     [[:asc $id]]
                               :filter       [:=
                                              &c.categories.name
                                              [:value "BBQ" {:base_type :type/Text, :semantic_type :type/Name, :database_type "VARCHAR"}]]
                               :fields       [$id $name $category_id $latitude $longitude $price]
                               :limit        100
                               :joins        [{:source-table $$categories
                                               :alias        "c"
                                               :strategy     join-type
                                               :condition    [:=
                                                              $category_id
                                                              &c.categories.id]
                                               :fk-field-id  (mt/id :venues :category_id)
                                               :fields       :none}]})
                            mbql->native
                            sql.qp-test-util/sql->sql-map))
      :left-join
      :inner-join)))

(deftest ^:parallel nested-query-and-join-test
  (testing "This HAIRY query tests that the correct identifiers and aliases are used with both a nested query and JOIN in play."
    (is (= '{:select    [v.NAME AS v__NAME
                         COUNT (*) AS count]
             :from      [{:select [CHECKINS.ID       AS ID
                                   CHECKINS.DATE     AS DATE
                                   CHECKINS.USER_ID  AS USER_ID
                                   CHECKINS.VENUE_ID AS VENUE_ID]
                          :from   [CHECKINS]
                          :where  [CHECKINS.DATE > ?]}
                         AS source]
             :left-join [VENUES AS v
                         ON source.VENUE_ID = v.ID]
             :where     [(v.NAME LIKE ?) AND (source.USER_ID > 0)]
             :group-by  [v.NAME]
             :order-by  [v.NAME ASC]}
           (-> (mt/mbql-query checkins
                 {:source-query {:source-table $$checkins
                                 :fields       [$id [:field %date {:temporal-unit :default}] $user_id $venue_id]
                                 :filter       [:>
                                                $date
                                                [:absolute-datetime #t "2015-01-01T00:00:00.000000000-00:00" :default]]}
                  :aggregation  [[:count]]
                  :order-by     [[:asc &v.venues.name]]
                  :breakout     [&v.venues.name]
                  :filter       [:and
                                 [:starts-with
                                  &v.venues.name
                                  [:value "F" {:base_type     :type/Text
                                               :semantic_type :type/Name
                                               :database_type "VARCHAR"}]]
                                 [:> [:field "USER_ID" {:base-type :type/Integer}] 0]]
                  :joins        [{:source-table $$venues
                                  :alias        "v"
                                  :strategy     :left-join
                                  :condition    [:=
                                                 $venue_id
                                                 &v.venues.id]
                                  :fk-field-id  (mt/id :checkins :venue_id)
                                  :fields       :none}]})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel handle-named-aggregations-test
  (testing "Check that named aggregations are handled correctly"
    (is (= '{:select   [VENUES.PRICE AS PRICE
                        AVG (VENUES.CATEGORY_ID) AS avg_2]
             :from     [VENUES]
             :group-by [VENUES.PRICE]
             :order-by [avg_2 ASC
                        VENUES.PRICE ASC]}
           (-> (mt/mbql-query venues
                 {:aggregation [[:aggregation-options [:avg $category_id] {:name "avg_2"}]]
                  :breakout    [$price]
                  :order-by    [[:asc [:aggregation 0]]]})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:paralell handle-source-query-params-test
  (driver/with-driver :h2
    (mt/with-everything-store
      (testing "params from source queries should get passed in to the top-level. Semicolons should be removed"
        (is (= {:query  "SELECT \"source\".* FROM (SELECT * FROM some_table WHERE name = ?) AS \"source\" WHERE (\"source\".\"name\" <> ?) OR (\"source\".\"name\" IS NULL)"
                :params ["Cam" "Lucky Pigeon"]}
               (sql.qp/mbql->native
                :h2
                (mt/mbql-query venues
                  {:source-query    {:native "SELECT * FROM some_table WHERE name = ?;", :params ["Cam"]}
                   :source-metadata [{:name "name", :base_type :type/Integer}]
                   :filter          [:!= *name/Integer "Lucky Pigeon"]}))))))))

(deftest ^:parallel joins-against-native-queries-test
  (testing "Joins against native SQL queries should get converted appropriately! make sure correct HoneySQL is generated"
    (mt/with-everything-store
      (driver/with-driver :h2
        (is (= [[(sql.qp/sql-source-query "SELECT * FROM VENUES;" [])
                 (hx/identifier :table-alias "card")]
                [:=
                 (hx/with-database-type-info (hx/identifier :field "PUBLIC" "CHECKINS" "VENUE_ID") "integer")
                 (hx/identifier :field "card" "id")]]
               (sql.qp/join->honeysql :h2
                                      (mt/$ids checkins
                                        {:source-query {:native "SELECT * FROM VENUES;", :params []}
                                         :alias        "card"
                                         :strategy     :left-join
                                         :condition    [:=
                                                        [:field %venue_id {::add/source-table $$checkins
                                                                           ::add/source-alias "VENUE_ID"}]
                                                        [:field "id" {:join-alias        "card"
                                                                      :base-type         :type/Integer
                                                                      ::add/source-table "card"
                                                                      ::add/source-alias "id"}]]}))))))))

(defn- compile-join [driver]
  (driver/with-driver driver
    (qp.store/with-store
      (qp.store/store-database! (t2/instance :metabase.models.database/Database
                                             {:id       1
                                              :name     "test-data"
                                              :engine   driver
                                              :details  {}
                                              :settings {}}))
      (qp.store/store-table!    (t2/instance :metabase.models.table/Table
                                             {:id     1
                                              :db_id  1
                                              :schema "public"
                                              :name   "checkins"}))
      (qp.store/store-field!    (t2/instance :metabase.models.field/Field
                                             {:id            1
                                              :table_id      1
                                              :name          "id"
                                              :description   nil
                                              :database_type "integer"
                                              :semantic_type nil
                                              :nfc_path      nil
                                              :parent_id     nil
                                              :display_name  "ID"
                                              :fingerprint   nil
                                              :base_type     :type/Integer}))
      (sql.qp/with-driver-honey-sql-version driver
        (let [join (sql.qp/join->honeysql
                    driver
                    {:source-query {:native "SELECT * FROM VENUES;", :params []}
                     :alias        "card"
                     :strategy     :left-join
                     :condition    [:=
                                    [:field 1 {::add/source-table 1
                                               ::add/source-alias "VENUE_ID"}]
                                    [:field "id" {:base-type         :type/Text
                                                  ::add/source-table "card"
                                                  ::add/source-alias "id"}]]})]
          (sql.qp/format-honeysql driver {:join join}))))))

(deftest ^:parallel compile-honeysql-test
  (testing "make sure the generated HoneySQL will compile to the correct SQL"
    (are [driver expected] (= [expected]
                              (compile-join driver))
      :sql      "INNER JOIN (SELECT * FROM VENUES) \"card\" ON \"public\".\"checkins\".\"VENUE_ID\" = \"card\".\"id\""
      :h2       "INNER JOIN (SELECT * FROM VENUES) AS \"card\" ON \"public\".\"checkins\".\"VENUE_ID\" = \"card\".\"id\""
      :postgres "INNER JOIN (SELECT * FROM VENUES) AS \"card\" ON \"public\".\"checkins\".\"VENUE_ID\" = \"card\".\"id\"")))

(deftest adjust-start-of-week-test
  (driver/with-driver :h2
    (binding [hx/*honey-sql-version* 2]
      (with-redefs [driver/db-start-of-week   (constantly :monday)
                    setting/get-value-of-type (constantly :sunday)]
        (is (= [:dateadd
                (hx/literal "day")
                (hx/with-database-type-info [:cast [:inline -1] [:raw "long"]] "long")
                (hx/with-database-type-info
                  [:cast
                   [:week [:dateadd (hx/literal "day")
                           (hx/with-database-type-info [:cast [:inline 1] [:raw "long"]] "long")
                           (hx/with-database-type-info [:cast :created_at [:raw "datetime"]] "datetime")]]
                   [:raw "datetime"]]
                  "datetime")]
               (sql.qp/adjust-start-of-week :h2 (partial hx/call :week) :created_at)))))
    (testing "Do we skip the adjustment if offset = 0"
      (with-redefs [driver/db-start-of-week   (constantly :monday)
                    setting/get-value-of-type (constantly :monday)]
        (is (= (hx/call :week :created_at)
               (sql.qp/adjust-start-of-week :h2 (partial hx/call :week) :created_at)))))))

(defn- query-on-dataset-with-nils
  [query]
  (mt/rows
    (qp/process-query
     {:database (mt/id)
      :type     :query
      :query    (merge
                 {:source-query {:native "select 'foo' as a union select null as a union select 'bar' as a"}
                  :order-by     [[:asc [:field "A" {:base-type :type/Text}]]]}
                 query)})))

(deftest ^:parallel correct-for-null-behaviour
  (testing "NULLs should be treated intuitively in filters (SQL has somewhat unintuitive semantics where NULLs get propagated out of expressions)."
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:not [:starts-with [:field "A" {:base-type :type/Text}] "f"]]})))
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:not [:ends-with [:field "A" {:base-type :type/Text}] "o"]]})))
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:not [:contains [:field "A" {:base-type :type/Text}] "f"]]})))
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:!= [:field "A" {:base-type :type/Text}] "foo"]}))))
  (testing "Null behaviour correction fix should work with joined fields (#13534)"
    (is (= [[1000]]
           (mt/rows
             (mt/run-mbql-query checkins
               {:filter      [:!= &u.users.name "foo"]
                :aggregation [:count]
                :joins       [{:source-table $$users
                               :alias        "u"
                               :condition    [:= $user_id &u.users.id]}]}))))))

(deftest ^:parallel joined-field-clauses-test
  (testing "Should correctly compile `:field` clauses with `:join-alias`"
    (testing "when the join is at the same level"
      (is (= {:select    '[c.NAME AS c__NAME]
              :from      '[VENUES]
              :left-join '[CATEGORIES AS c ON VENUES.CATEGORY_ID = c.ID]
              :limit     [qp.i/absolute-max-results]}
             (-> (mt/mbql-query venues
                   {:fields [&c.categories.name]
                    :joins  [{:fields       [&c.categories.name]
                              :source-table $$categories
                              :strategy     :left-join
                              :condition    [:= $category_id &c.categories.id]
                              :alias        "c"}]})
                 mbql->native
                 sql.qp-test-util/sql->sql-map))))

    (testing "when the join is NOT at the same level"
      (is (= {:select '[source.c__NAME AS c__NAME]
              :from   '[{:select    [c.NAME AS c__NAME]
                         :from      [VENUES]
                         :left-join [CATEGORIES AS c ON VENUES.CATEGORY_ID = c.ID]} AS source]
              :limit  [qp.i/absolute-max-results]}
             (-> (mt/mbql-query venues
                   {:fields       [&c.categories.name]
                    :source-query {:source-table $$venues
                                   :fields       [&c.categories.name]
                                   :joins        [{:fields       [&c.categories.name]
                                                   :source-table $$categories
                                                   :strategy     :left-join
                                                   :condition    [:= $category_id &c.categories.id]
                                                   :alias        "c"}]}})
                 mbql->native
                 sql.qp-test-util/sql->sql-map))))))

(deftest ^:parallel ambiguous-field-metadata-test
  (testing "With queries that refer to the same field more than once, can we generate sane SQL?"
    (mt/dataset sample-dataset
      (is (= '{:select    [ORDERS.ID                       AS ID
                           ORDERS.PRODUCT_ID               AS PRODUCT_ID
                           PRODUCTS__via__PRODUCT_ID.TITLE AS PRODUCTS__via__PRODUCT_ID__TITLE
                           Products.ID                     AS Products__ID
                           Products.TITLE                  AS Products__TITLE]
               :from      [ORDERS]
               :left-join [PRODUCTS AS Products                  ON ORDERS.PRODUCT_ID = Products.ID
                           PRODUCTS AS PRODUCTS__via__PRODUCT_ID ON ORDERS.PRODUCT_ID = PRODUCTS__via__PRODUCT_ID.ID]
               :order-by  [ORDERS.ID ASC]
               :limit     [2]}
             (-> (mt/mbql-query orders
                   {:joins    [{:strategy     :left-join
                                :source-table $$products
                                :condition    [:= $product_id &Products.products.id]
                                :alias        "Products"}
                               {:strategy     :left-join
                                :source-table $$products
                                :alias        "PRODUCTS__via__PRODUCT_ID"
                                :fk-field-id  %product_id
                                :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]}]
                    :order-by [[:asc $id]]
                    :limit    2
                    :fields   [$id
                               $product_id
                               &PRODUCTS__via__PRODUCT_ID.products.title
                               &Products.products.id
                               &Products.products.title]})
                 mbql->native
                 sql.qp-test-util/sql->sql-map))))))

(deftest ^:parallel simple-expressions-test
  (is (= '{:select [source.ID          AS ID
                    source.NAME        AS NAME
                    source.CATEGORY_ID AS CATEGORY_ID
                    source.LATITUDE    AS LATITUDE
                    source.LONGITUDE   AS LONGITUDE
                    source.PRICE       AS PRICE
                    source.double_id   AS double_id]
           :from   [{:select [source.ID          AS ID
                              source.NAME        AS NAME
                              source.CATEGORY_ID AS CATEGORY_ID
                              source.LATITUDE    AS LATITUDE
                              source.LONGITUDE   AS LONGITUDE
                              source.PRICE       AS PRICE
                              source.double_id   AS double_id]
                     :from   [{:select [VENUES.ID AS ID
                                        VENUES.NAME AS NAME
                                        VENUES.CATEGORY_ID AS CATEGORY_ID
                                        VENUES.LATITUDE    AS LATITUDE
                                        VENUES.LONGITUDE   AS LONGITUDE
                                        VENUES.PRICE       AS PRICE
                                        VENUES.ID * 2      AS double_id]
                               :from   [VENUES]}
                              AS source]}
                    AS source]
           :limit  [1]}
         (-> (mt/mbql-query venues
               {:source-query {:source-table $$venues
                               :expressions  {:double_id [:* $id 2]}
                               :fields       [$id $name $category_id $latitude $longitude $price [:expression "double_id"]]}
                :fields       [$id $name $category_id $latitude $longitude $price *double_id/Float]
                :limit        1})
             mbql->native
             sql.qp-test-util/sql->sql-map))))

(deftest ^:parallel multiple-joins-with-expressions-test
  (testing "We should be able to compile a complicated query with multiple joins and expressions correctly"
    (mt/dataset sample-dataset
      (is (= '{:select   [source.PRODUCTS__via__PRODUCT_ID__CATEGORY AS PRODUCTS__via__PRODUCT_ID__CATEGORY
                          source.PEOPLE__via__USER_ID__SOURCE AS PEOPLE__via__USER_ID__SOURCE
                          DATE_TRUNC ("year" source.CREATED_AT) AS CREATED_AT
                          source.pivot-grouping AS pivot-grouping
                          COUNT (*) AS count]
               :from     [{:select    [ORDERS.USER_ID                     AS USER_ID
                                       ORDERS.PRODUCT_ID                  AS PRODUCT_ID
                                       ORDERS.CREATED_AT                  AS CREATED_AT
                                       ABS (0)                            AS pivot-grouping
                                       ;; TODO -- I'm not sure if the order here is deterministic
                                       PRODUCTS__via__PRODUCT_ID.CATEGORY AS PRODUCTS__via__PRODUCT_ID__CATEGORY
                                       PEOPLE__via__USER_ID.SOURCE        AS PEOPLE__via__USER_ID__SOURCE
                                       PRODUCTS__via__PRODUCT_ID.ID       AS PRODUCTS__via__PRODUCT_ID__ID
                                       PEOPLE__via__USER_ID.ID            AS PEOPLE__via__USER_ID__ID]
                           :from      [ORDERS]
                           :left-join [PRODUCTS AS PRODUCTS__via__PRODUCT_ID
                                       ON ORDERS.PRODUCT_ID = PRODUCTS__via__PRODUCT_ID.ID
                                       PEOPLE AS PEOPLE__via__USER_ID
                                       ON ORDERS.USER_ID = PEOPLE__via__USER_ID.ID]
                           :where     [((PEOPLE__via__USER_ID.SOURCE = ?) OR (PEOPLE__via__USER_ID.SOURCE = ?))
                                       AND
                                       ((PRODUCTS__via__PRODUCT_ID.CATEGORY = ?) OR (PRODUCTS__via__PRODUCT_ID.CATEGORY = ?))
                                       AND
                                       (ORDERS.CREATED_AT >= DATE_TRUNC ("year" DATEADD ("year" CAST (-2 AS long) CAST (NOW () AS datetime))))
                                       AND
                                       (ORDERS.CREATED_AT < DATE_TRUNC ("year" NOW ()))]}
                          AS source]
               :group-by [source.PRODUCTS__via__PRODUCT_ID__CATEGORY
                          source.PEOPLE__via__USER_ID__SOURCE
                          DATE_TRUNC ("year" source.CREATED_AT)
                          source.pivot-grouping]
               :order-by [source.PRODUCTS__via__PRODUCT_ID__CATEGORY ASC
                          source.PEOPLE__via__USER_ID__SOURCE ASC
                          DATE_TRUNC ("year" source.CREATED_AT) ASC
                          source.pivot-grouping ASC]}
             (-> (mt/mbql-query orders
                   {:aggregation [[:aggregation-options [:count] {:name "count"}]]
                    :breakout    [&PRODUCTS__via__PRODUCT_ID.products.category
                                  &PEOPLE__via__USER_ID.people.source
                                  !year.created_at
                                  [:expression "pivot-grouping"]]
                    :filter      [:and
                                  [:or
                                   [:=
                                    &PEOPLE__via__USER_ID.people.source
                                    [:value "Facebook" {:base_type :type/Text, :semantic_type nil, :database_type "VARCHAR", :name "SOURCE"}]]
                                   [:=
                                    &PEOPLE__via__USER_ID.people.source
                                    [:value "Google" {:base_type :type/Text, :semantic_type nil, :database_type "VARCHAR", :name "SOURCE"}]]]
                                  [:or
                                   [:=
                                    &PRODUCTS__via__PRODUCT_ID.products.category
                                    [:value "Doohickey" {:base_type :type/Text, :semantic_type nil, :database_type "VARCHAR", :name "CATEGORY"}]]
                                   [:=
                                    &PRODUCTS__via__PRODUCT_ID.products.category
                                    [:value "Gizmo" {:base_type :type/Text, :semantic_type nil, :database_type "VARCHAR", :name "CATEGORY"}]]]
                                  [:between !year.created_at [:relative-datetime -2 :year] [:relative-datetime -1 :year]]]
                    :expressions {:pivot-grouping [:abs 0]}
                    :order-by    [[:asc &PRODUCTS__via__PRODUCT_ID.products.category]
                                  [:asc &PEOPLE__via__USER_ID.people.source]
                                  [:asc !year.created_at]
                                  [:asc [:expression "pivot-grouping"]]]
                    :joins       [{:source-table $$products
                                   :strategy     :left-join
                                   :alias        "PRODUCTS__via__PRODUCT_ID"
                                   :fk-field-id  %product_id
                                   :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]}
                                  {:source-table $$people
                                   :strategy     :left-join
                                   :alias        "PEOPLE__via__USER_ID"
                                   :fk-field-id  %user_id
                                   :condition    [:= $user_id &PEOPLE__via__USER_ID.people.id]}]})
                 mbql->native
                 sql.qp-test-util/sql->sql-map))))))

(deftest ^:parallel reference-aggregation-expressions-in-joins-test
  (testing "See if we can correctly compile a query that references expressions that come from a join"
    (is (= '{:select [source.ID                           AS ID
                      source.NAME                         AS NAME
                      source.CATEGORY_ID                  AS CATEGORY_ID
                      source.LATITUDE                     AS LATITUDE
                      source.LONGITUDE                    AS LONGITUDE
                      source.PRICE                        AS PRICE
                      source.RelativePrice                AS RelativePrice
                      source.CategoriesStats__CATEGORY_ID AS CategoriesStats__CATEGORY_ID
                      source.CategoriesStats__MaxPrice    AS CategoriesStats__MaxPrice
                      source.CategoriesStats__AvgPrice    AS CategoriesStats__AvgPrice
                      source.CategoriesStats__MinPrice    AS CategoriesStats__MinPrice]
             :from   [{:select    [VENUES.ID          AS ID
                                   VENUES.NAME        AS NAME
                                   VENUES.CATEGORY_ID AS CATEGORY_ID
                                   VENUES.LATITUDE    AS LATITUDE
                                   VENUES.LONGITUDE   AS LONGITUDE
                                   VENUES.PRICE       AS PRICE
                                   CAST (VENUES.PRICE AS float)
                                   /
                                   CASE WHEN CategoriesStats.AvgPrice = 0 THEN NULL
                                   ELSE CategoriesStats.AvgPrice END AS RelativePrice
                                   CategoriesStats.CATEGORY_ID AS CategoriesStats__CATEGORY_ID
                                   CategoriesStats.MaxPrice    AS CategoriesStats__MaxPrice
                                   CategoriesStats.AvgPrice    AS CategoriesStats__AvgPrice
                                   CategoriesStats.MinPrice    AS CategoriesStats__MinPrice]
                       :from      [VENUES]
                       :left-join [{:select   [VENUES.CATEGORY_ID AS CATEGORY_ID
                                               MAX (VENUES.PRICE) AS MaxPrice
                                               AVG (VENUES.PRICE) AS AvgPrice
                                               MIN (VENUES.PRICE) AS MinPrice]
                                    :from     [VENUES]
                                    :group-by [VENUES.CATEGORY_ID]
                                    :order-by [VENUES.CATEGORY_ID ASC]} AS CategoriesStats
                                   ON VENUES.CATEGORY_ID = CategoriesStats.CATEGORY_ID]}
                      AS source]
             :limit  [3]}
           (-> (mt/mbql-query venues
                 {:fields      [$id
                                $name
                                $category_id
                                $latitude
                                $longitude
                                $price
                                [:expression "RelativePrice"]
                                &CategoriesStats.category_id
                                &CategoriesStats.*MaxPrice/Integer
                                &CategoriesStats.*AvgPrice/Integer
                                &CategoriesStats.*MinPrice/Integer]
                  :expressions {"RelativePrice" [:/ $price &CategoriesStats.*AvgPrice/Integer]}
                  :joins       [{:strategy     :left-join
                                 :condition    [:= $category_id &CategoriesStats.venues.category_id]
                                 :source-query {:source-table $$venues
                                                :aggregation  [[:aggregation-options [:max $price] {:name "MaxPrice"}]
                                                               [:aggregation-options [:avg $price] {:name "AvgPrice"}]
                                                               [:aggregation-options [:min $price] {:name "MinPrice"}]]
                                                :breakout     [$category_id]}
                                 :alias        "CategoriesStats"
                                 :fields       :all}]
                  :limit       3})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest expressions-and-coercions-test
  (testing "Don't cast in both inner select and outer select when expression (#12430)"
    (mt/with-temp-vals-in-db Field (mt/id :venues :price) {:coercion_strategy :Coercion/UNIXSeconds->DateTime
                                                           :effective_type    :type/DateTime}
      (let [query (mt/mbql-query venues
                    {:expressions {:test ["*" 1 1]}
                     :fields      [$price
                                   [:expression "test"]]
                     :limit       1})]
        (testing "Generated SQL"
          (is (= '{:select [source.PRICE AS PRICE
                            source.test  AS test]
                   :from   [{:select [TIMESTAMPADD ("second" VENUES.PRICE timestamp "1970-01-01T00:00:00Z") AS PRICE
                                      1 * 1 AS test]
                             :from   [VENUES]}
                            AS source]
                   :limit  [1]}
                 (-> query mbql->native sql.qp-test-util/sql->sql-map)))
          (testing "Results"
            (let [results (qp/process-query query)]
              (is (schema= [(s/one s/Str "date")
                            (s/one s/Num "expression")]
                           (-> results mt/rows first))))))))))

(deftest ^:parallel nested-mbql-source-query-test
  (is (= '{:select    [VENUES.ID          AS ID
                       VENUES.NAME        AS NAME
                       VENUES.CATEGORY_ID AS CATEGORY_ID
                       VENUES.LATITUDE    AS LATITUDE
                       VENUES.LONGITUDE   AS LONGITUDE
                       VENUES.PRICE       AS PRICE]
           :from      [VENUES]
           :left-join [{:select [CATEGORIES.ID   AS ID
                                 CATEGORIES.NAME AS NAME]
                        :from   [CATEGORIES]} AS cat
                       ON VENUES.CATEGORY_ID = cat.ID]
           :order-by  [VENUES.NAME ASC]
           :limit     [3]}
         (-> (mt/mbql-query venues
               {:source-table $$venues
                :joins        [{:alias        "cat"
                                :source-query {:source-table $$categories}
                                :condition    [:= $category_id &cat.*categories.id]}]
                :order-by     [[:asc $name]]
                :limit        3})
             mbql->native
             sql.qp-test-util/sql->sql-map))))

(deftest ^:parallel join-inside-source-query-test
  (testing "Make sure a JOIN inside a source query gets compiled as expected"
    (mt/dataset sample-dataset
      (mt/with-everything-store
        (is (= '{:select [source.P1__CATEGORY AS P1__CATEGORY]
                 :from   [{:select    [P1.CATEGORY AS P1__CATEGORY]
                           :from      [ORDERS]
                           :left-join [PRODUCTS AS P1 ON ORDERS.PRODUCT_ID = P1.ID]}
                          AS source]
                 :limit  [1]}
               (-> (mt/mbql-query orders
                     {:fields       [&P1.products.category]
                      :source-query {:source-table $$orders
                                     :fields       [&P1.products.category]
                                     :joins        [{:strategy     :left-join
                                                     :source-table $$products
                                                     :condition    [:= $product_id &P1.products.id]
                                                     :alias        "P1"}]}
                      :limit        1})
                   mbql->native
                   sql.qp-test-util/sql->sql-map)))))))

(deftest ^:parallel join-against-source-query-test
  (testing "Make sure a JOIN referencing fields from the source query use correct aliases/etc"
    (mt/dataset sample-dataset
      (mt/with-everything-store
        (is (= '{:select    [source.P1__CATEGORY AS P1__CATEGORY]
                 :from      [{:select    [P1.CATEGORY AS P1__CATEGORY]
                              :from      [ORDERS]
                              :left-join [PRODUCTS AS P1 ON ORDERS.PRODUCT_ID = P1.ID]}
                             AS source]
                 :left-join [{:select    [P2.CATEGORY AS P2__CATEGORY]
                              :from      [REVIEWS]
                              :left-join [PRODUCTS AS P2 ON REVIEWS.PRODUCT_ID = P2.ID]}
                             AS Q2
                             ON source.P1__CATEGORY = Q2.P2__CATEGORY]
                 :limit     [1]}
               (-> (mt/mbql-query orders
                     {:fields       [&P1.products.category]
                      :source-query {:source-table $$orders
                                     :fields       [&P1.products.category]
                                     :joins        [{:strategy     :left-join
                                                     :source-table $$products
                                                     :condition    [:= $product_id &P1.products.id]
                                                     :alias        "P1"}]}
                      :joins        [{:strategy     :left-join
                                      :condition    [:= &P1.products.category &Q2.products.category]
                                      :alias        "Q2"
                                      :source-query {:source-table $$reviews
                                                     :fields       [&P2.products.category]
                                                     :joins        [{:strategy     :left-join
                                                                     :source-table $$products
                                                                     :condition    [:= $reviews.product_id &P2.products.id]
                                                                     :alias        "P2"}]}}]
                      :limit        1})
                   mbql->native
                   sql.qp-test-util/sql->sql-map)))))))

(deftest ^:parallel implicit-join-test
  (is (= '{:select    [VENUES.NAME                       AS NAME
                       CATEGORIES__via__CATEGORY_ID.NAME AS CATEGORIES__via__CATEGORY_ID__NAME]
           :from      [VENUES]
           :left-join [CATEGORIES AS CATEGORIES__via__CATEGORY_ID
                       ON VENUES.CATEGORY_ID = CATEGORIES__via__CATEGORY_ID.ID]
           :order-by  [VENUES.ID ASC]
           :limit     [5]}
         (-> (mt/mbql-query venues
               {:joins    [{:source-table $$categories
                            :alias        "CATEGORIES__via__CATEGORY_ID"
                            :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
                            :strategy     :left-join}]
                :fields   [$name
                           $category_id->&CATEGORIES__via__CATEGORY_ID.categories.name]
                :order-by [[:asc $id]]
                :limit    5})
             mbql->native
             sql.qp-test-util/sql->sql-map))))

(deftest ^:parallel another-source-query-test
  (is (= '{:select [source.DATE  AS DATE
                    source.sum   AS sum
                    source.sum_2 AS sum_2]
           :from   [{:select   [DATE_TRUNC ("month" CHECKINS.DATE) AS DATE
                                SUM (CHECKINS.USER_ID)                                           AS sum
                                SUM (CHECKINS.VENUE_ID)                                          AS sum_2]
                     :from     [CHECKINS]
                     :group-by [DATE_TRUNC ("month" CHECKINS.DATE)]
                     :order-by [DATE_TRUNC ("month" CHECKINS.DATE) ASC]}
                    AS source]
           :where  [source.sum > 300]
           :limit  [2]}
         (-> (mt/mbql-query checkins
               {:source-query {:source-table $$checkins
                               :aggregation  [[:sum $user_id]
                                              [:sum $venue_id]]
                               :breakout     [!month.date]}
                :filter       [:> *sum/Float 300]
                :limit        2})
             mbql->native
             sql.qp-test-util/sql->sql-map))))

(deftest ^:parallel expression-with-duplicate-column-name-test
  (testing "Can we use expression with same column name as table (#14267)"
    (mt/dataset sample-dataset
      (is (= '{:select   [source.CATEGORY_2 AS CATEGORY_2
                          COUNT (*)         AS count]
               :from     [{:select [PRODUCTS.CATEGORY            AS CATEGORY
                                    CONCAT (PRODUCTS.CATEGORY ?) AS CATEGORY_2]
                           :from   [PRODUCTS]}
                          AS source]
               :group-by [source.CATEGORY_2]
               :order-by [source.CATEGORY_2 ASC]
               :limit    [1]}
             (-> (mt/mbql-query products
                   {:expressions {:CATEGORY [:concat $category "2"]}
                    :breakout    [[:expression :CATEGORY]]
                    :aggregation [[:count]]
                    :order-by    [[:asc [:expression :CATEGORY]]]
                    :limit       1})
                 mbql->native
                 sql.qp-test-util/sql->sql-map))))))

(deftest ^:parallel join-source-queries-with-joins-test
  (testing "Should be able to join against source queries that themselves contain joins (#12928)"
    (mt/dataset sample-dataset
      (is (= '{:select    [source.P1__CATEGORY   AS P1__CATEGORY
                           source.People__SOURCE AS People__SOURCE
                           source.count          AS count
                           Q2.P2__CATEGORY       AS Q2__P2__CATEGORY
                           Q2.avg                AS Q2__avg]
               :from      [{:select    [P1.CATEGORY   AS P1__CATEGORY
                                        People.SOURCE AS People__SOURCE
                                        COUNT (*)     AS count]
                            :from      [ORDERS]
                            :left-join [PRODUCTS AS P1     ON ORDERS.PRODUCT_ID = P1.ID
                                        PEOPLE   AS People ON ORDERS.USER_ID = People.ID]
                            :group-by  [P1.CATEGORY
                                        People.SOURCE]
                            :order-by  [P1.CATEGORY ASC People.SOURCE ASC]}
                           AS source]
               :left-join [{:select    [P2.CATEGORY          AS P2__CATEGORY
                                        AVG (REVIEWS.RATING) AS avg]
                            :from      [REVIEWS]
                            :left-join [PRODUCTS AS P2 ON REVIEWS.PRODUCT_ID = P2.ID]
                            :group-by  [P2.CATEGORY]
                            :order-by  [P2.CATEGORY ASC]}
                           AS Q2
                           ON source.P1__CATEGORY = Q2.P2__CATEGORY]
               :order-by  [source.P1__CATEGORY   ASC
                           source.People__SOURCE ASC]
               :limit     [2]}
             (-> (mt/mbql-query orders
                   {:source-query {:source-table $$orders
                                   :joins        [{:fields       :all
                                                   :source-table $$products
                                                   :condition    [:= $orders.product_id &P1.products.id]
                                                   :alias        "P1"}
                                                  {:fields       :all
                                                   :source-table $$people
                                                   :condition    [:= $orders.user_id &People.people.id]
                                                   :alias        "People"}]
                                   :aggregation  [[:count]]
                                   :breakout     [&P1.products.category
                                                  [:field %people.source {:join-alias "People"}]]}
                    :joins        [{:fields       :all
                                    :condition    [:= &P1.products.category #_$products.category &Q2.products.category]
                                    :alias        "Q2"
                                    :source-query {:source-table $$reviews
                                                   :joins        [{:fields       :all
                                                                   :source-table $$products
                                                                   :condition    [:=
                                                                                  $reviews.product_id
                                                                                  &P2.products.id]
                                                                   :alias        "P2"}]
                                                   :aggregation  [[:avg $reviews.rating]]
                                                   :breakout     [&P2.products.category]}}]
                    :order-by     [[:asc &P1.products.category]
                                   [:asc [:field %people.source {:join-alias "People"}]]]
                    :limit        2})
                 mbql->native
                 sql.qp-test-util/sql->sql-map))))))

(deftest ^:parallel floating-point-division-test
  (testing "Make sure FLOATING POINT division is done when dividing by expressions/fields"
    (is (= '{:select   [source.my_cool_new_field AS my_cool_new_field]
             :from     [{:select [VENUES.ID          AS ID
                                  VENUES.PRICE       AS PRICE
                                  VENUES.PRICE + 2   AS big_price
                                  CAST
                                  (VENUES.PRICE AS float)
                                  /
                                  CASE WHEN (VENUES.PRICE + 2) = 0 THEN NULL
                                  ELSE VENUES.PRICE + 2
                                  END AS my_cool_new_field]
                         :from   [VENUES]}
                        AS source]
             :order-by [source.ID ASC]
             :limit    [3]}
           (-> (mt/mbql-query venues
                 {:expressions {:big_price         [:+ $price 2]
                                :my_cool_new_field [:/ $price [:expression "big_price"]]}
                  :fields      [[:expression "my_cool_new_field"]]
                  :limit       3
                  :order-by    [[:asc $id]]})
               mbql->native
               sql.qp-test-util/sql->sql-map))))
  (testing "Don't generate unneeded casts to FLOAT for the numerator if it is a number literal"
    (doseq [honey-sql-version [1 2]]
      (binding [hx/*honey-sql-version* honey-sql-version]
        (testing (format "hx/*honey-sql-version* = %d" hx/*honey-sql-version*)
          (is (= (case hx/*honey-sql-version*
                   1 '{:select [source.my_cool_new_field AS my_cool_new_field]
                       :from   [{:select [2.0 / 4.0 AS my_cool_new_field]
                                 :from   [VENUES]}
                                AS source]
                       :limit  [1]}
                   2 '{:select [source.my_cool_new_field AS my_cool_new_field]
                       :from   [{:select [2.0 / 4.0 AS my_cool_new_field]
                                 :from   [VENUES]}
                                AS source]
                       :limit  [1]})
                 (-> (mt/mbql-query venues
                       {:expressions {:my_cool_new_field [:/ 2 4]}
                        :fields      [[:expression "my_cool_new_field"]]
                        :limit       1})
                     mbql->native
                     sql.qp-test-util/sql->sql-map))))))))

(deftest ^:parallel duplicate-aggregations-test
  (testing "Make sure multiple aggregations of the same type get unique aliases"
    ;; ([[metabase.query-processor.middleware.pre-alias-aggregations]] should actually take care of this, but this test
    ;; is here to be extra safe anyway.)
    (is (= '{:select [SUM (VENUES.ID)    AS sum
                      SUM (VENUES.PRICE) AS sum_2]
             :from   [VENUES]
             :limit  [1]}
           (sql.qp-test-util/query->sql-map
            (mt/mbql-query venues
              {:aggregation [[:sum $id]
                             [:sum $price]]
               :limit       1}))))))

(deftest ^:parallel join-against-query-with-implicit-joins-test
  (testing "Should be able to do subsequent joins against a query with implicit joins (#17767)"
    (mt/dataset sample-dataset
      (is (= '{:select    [source.PRODUCTS__via__PRODUCT_ID__ID AS PRODUCTS__via__PRODUCT_ID__ID
                           source.count                         AS count
                           Reviews.ID                           AS Reviews__ID
                           Reviews.PRODUCT_ID                   AS Reviews__PRODUCT_ID
                           Reviews.REVIEWER                     AS Reviews__REVIEWER
                           Reviews.RATING                       AS Reviews__RATING
                           Reviews.BODY                         AS Reviews__BODY
                           Reviews.CREATED_AT                   AS Reviews__CREATED_AT]
               :from      [{:select    [PRODUCTS__via__PRODUCT_ID.ID AS PRODUCTS__via__PRODUCT_ID__ID
                                        COUNT (*)                    AS count]
                            :from      [ORDERS]
                            :left-join [PRODUCTS AS PRODUCTS__via__PRODUCT_ID
                                        ON ORDERS.PRODUCT_ID = PRODUCTS__via__PRODUCT_ID.ID]
                            :group-by  [PRODUCTS__via__PRODUCT_ID.ID]
                            :order-by  [PRODUCTS__via__PRODUCT_ID.ID ASC]}
                           AS source]
               :left-join [REVIEWS AS Reviews
                           ON source.PRODUCTS__via__PRODUCT_ID__ID = Reviews.PRODUCT_ID]
               :limit     [1]}
             (sql.qp-test-util/query->sql-map
              (mt/mbql-query orders
                {:source-query {:source-table $$orders
                                :aggregation  [[:count]]
                                :breakout     [$product_id->products.id]}
                 :joins        [{:fields       :all
                                 :source-table $$reviews
                                 :condition    [:= *ID/BigInteger &Reviews.reviews.product_id]
                                 :alias        "Reviews"}]
                 :limit        1})))))))

(deftest ^:parallel join-table-on-itself-with-custom-column-test
  (testing "Should be able to join a source query against itself using an expression (#17770)"
    (mt/dataset sample-dataset
      (is (= '{:select    [source.CATEGORY AS CATEGORY
                           source.count    AS count
                           source.CC       AS CC
                           Q1.CATEGORY     AS Q1__CATEGORY
                           Q1.count        AS Q1__count
                           Q1.CC           AS Q1__CC]
               :from      [{:select [source.CATEGORY AS CATEGORY
                                     source.count    AS count
                                     source.CC       AS CC]
                            :from   [{:select [source.CATEGORY AS CATEGORY
                                               source.count    AS count
                                               1 + 1           AS CC]
                                      :from   [{:select   [PRODUCTS.CATEGORY AS CATEGORY
                                                           COUNT (*)         AS count]
                                                :from     [PRODUCTS]
                                                :group-by [PRODUCTS.CATEGORY]
                                                :order-by [PRODUCTS.CATEGORY ASC]}
                                               AS source]}
                                     AS source]}
                           AS source]
               :left-join [{:select [source.CATEGORY AS CATEGORY
                                     source.count    AS count
                                     source.CC       AS CC]
                            :from   [{:select [source.CATEGORY AS CATEGORY
                                               source.count    AS count
                                               1 + 1           AS CC]
                                      :from   [{:select   [PRODUCTS.CATEGORY AS CATEGORY
                                                           COUNT (*)         AS count]
                                                :from     [PRODUCTS]
                                                :group-by [PRODUCTS.CATEGORY]
                                                :order-by [PRODUCTS.CATEGORY ASC]}
                                               AS source]}
                                     AS source]}
                           AS Q1 ON source.CC = Q1.CC]
               :limit     [1]}
             (sql.qp-test-util/query->sql-map
              (mt/mbql-query nil
                {:source-query {:source-query {:source-table $$products
                                               :aggregation  [[:count]]
                                               :breakout     [$products.category]}
                                :expressions  {:CC [:+ 1 1]}}
                 :joins        [{:source-query {:source-query {:source-table $$products
                                                               :aggregation  [[:count]]
                                                               :breakout     [$products.category]}
                                                :expressions  {:CC [:+ 1 1]}}
                                 :alias        "Q1"
                                 :condition    [:=
                                                [:field "CC" {:base-type :type/Integer}]
                                                [:field "CC" {:base-type :type/Integer, :join-alias "Q1"}]]
                                 :fields       :all}]
                 :limit        1})))))))

(deftest ^:parallel mega-query-test
  (testing "Should generate correct SQL for joins against source queries that contain joins (#12928)"
    (mt/dataset sample-dataset
      (is (= '{:select    [source.P1__CATEGORY   AS P1__CATEGORY
                           source.People__SOURCE AS People__SOURCE
                           source.count          AS count
                           Q2.P2__CATEGORY       AS Q2__P2__CATEGORY
                           Q2.avg                AS Q2__avg]
               :from      [{:select    [P1.CATEGORY   AS P1__CATEGORY
                                        People.SOURCE AS People__SOURCE
                                        COUNT (*)     AS count]
                            :from      [ORDERS]
                            :left-join [PRODUCTS AS P1     ON ORDERS.PRODUCT_ID = P1.ID
                                        PEOPLE   AS People ON ORDERS.USER_ID = People.ID]
                            :group-by  [P1.CATEGORY
                                        People.SOURCE]
                            :order-by  [P1.CATEGORY   ASC
                                        People.SOURCE ASC]}
                           AS source]
               :left-join [{:select    [P2.CATEGORY          AS P2__CATEGORY
                                        AVG (REVIEWS.RATING) AS avg]
                            :from      [REVIEWS]
                            :left-join [PRODUCTS AS P2 ON REVIEWS.PRODUCT_ID = P2.ID]
                            :group-by  [P2.CATEGORY]
                            :order-by  [P2.CATEGORY ASC]}
                           AS Q2
                           ON source.P1__CATEGORY = Q2.P2__CATEGORY]
               :limit     [2]}
             (-> (mt/mbql-query nil
                   {:fields       [&P1.products.category
                                   &People.people.source
                                   [:field "count" {:base-type :type/BigInteger}]
                                   &Q2.products.category
                                   [:field "avg" {:base-type :type/Integer, :join-alias "Q2"}]]
                    :source-query {:source-table $$orders
                                   :aggregation  [[:aggregation-options [:count] {:name "count"}]]
                                   :breakout     [&P1.products.category
                                                  &People.people.source]
                                   :order-by     [[:asc &P1.products.category]
                                                  [:asc &People.people.source]]
                                   :joins        [{:strategy     :left-join
                                                   :source-table $$products
                                                   :condition    [:= $orders.product_id &P1.products.id]
                                                   :alias        "P1"}
                                                  {:strategy     :left-join
                                                   :source-table $$people
                                                   :condition    [:= $orders.user_id &People.people.id]
                                                   :alias        "People"}]}
                    :joins        [{:source-query {:source-table $$reviews
                                                   :aggregation  [[:aggregation-options [:avg $reviews.rating] {:name "avg"}]]
                                                   :breakout     [&P2.products.category]
                                                   :joins        [{:strategy     :left-join
                                                                   :source-table $$products
                                                                   :condition    [:= $reviews.product_id &P2.products.id]
                                                                   :alias        "P2"}]}
                                    :alias        "Q2"
                                    :condition    [:= &P1.products.category #_$products.category &Q2.products.category]
                                    :strategy     :left-join}]
                    :limit        2})
                 mbql->native
                 sql.qp-test-util/sql->sql-map))))))

(deftest ^:parallel format-honeysql-test
  (are [version honeysql expected] (= expected
                                      (sql.qp/format-honeysql version :ansi (binding [hx/*honey-sql-version* version]
                                                                              honeysql)))
    1 {:select [:*], :from [:table]} ["SELECT * FROM \"table\""]
    2 {:select [:*], :from [:table]} ["SELECT * FROM \"table\""]

    1 (hx/identifier :field "A" "B") ["\"A\".\"B\""]
    2 (hx/identifier :field "A" "B") ["\"A\".\"B\""]

    ;; don't complain on 'suspicious' characters since we're quoting things anyway!
    1 (hx/identifier :field "A;B") ["\"A;B\""]
    2 (hx/identifier :field "A;B") ["\"A;B\""]

    ;; but we should be escaping quotes.
    1 (hx/identifier :field "A\"B") ["\"A\"\"B\""]
    2 (hx/identifier :field "A\"B") ["\"A\"\"B\""]

    ;; make sure kebab-case is preserved.
    1 (hx/identifier :field "test-data") ["\"test-data\""]
    2 (hx/identifier :field "test-data") ["\"test-data\""]

    1 {:select [[(hx/identifier :field "test-data") :a]]} ["SELECT \"test-data\" AS \"a\""]
    2 {:select [[(hx/identifier :field "test-data") :a]]} ["SELECT \"test-data\" AS \"a\""]

    ;; Honey SQL 2 can't be configured to always inline numbers, so we have to remember to do it, otherwise it won't
    ;; do it for us =(
    1 [:= "A" 1] ["? = 1" "A"]
    2 [:= "A" 1] ["(? = ?)" "A" 1]

    1 [:or [:not= :state "OR"] [:= :state nil]] ["(\"state\" <> ? OR \"state\" IS NULL)" "OR"]
    2 [:or [:not= :state "OR"] [:= :state nil]] ["((\"state\" <> ?) OR (\"state\" IS NULL))" "OR"]))

(deftest day-of-week-inline-numbers-test
  (testing "Numbers should be returned inline, even when targeting Honey SQL 2."
    (mt/test-drivers (filter #(isa? driver/hierarchy (driver/the-driver %) :sql)
                             (tx.env/test-drivers))
      (mt/with-everything-store
        (doseq [day [:sunday
                     :monday
                     :tuesday
                     :wednesday
                     :thursday
                     :friday
                     :saturday]]
          (metabase.test/with-temporary-setting-values [start-of-week day]
            (sql.qp/with-driver-honey-sql-version driver/*driver*
              (let [sql-args (-> (sql.qp/format-honeysql driver/*driver* (sql.qp/date driver/*driver* :day-of-week :x))
                                 vec
                                 (update 0 #(str/split-lines (mdb.query/format-sql % driver/*driver*))))]
                (testing "this query should not have any parameters"
                  (is (mc/validate [:cat [:sequential :string]] sql-args)))))))))))

(deftest ^:parallel binning-optimize-math-expressions-test
  (testing "Don't include nonsense like `+ 0.0` and `- 0.0` when generating expressions for binning"
    (mt/dataset sample-dataset
      (binding [hx/*honey-sql-version* 2]
        (is (= ["SELECT"
                "  FLOOR((ORDERS.QUANTITY / 10)) * 10 AS QUANTITY,"
                "  COUNT(*) AS count"
                "FROM"
                "  ORDERS"
                "GROUP BY"
                "  FLOOR((ORDERS.QUANTITY / 10)) * 10"
                "ORDER BY"
                "  FLOOR((ORDERS.QUANTITY / 10)) * 10 ASC"]
               (-> (mbql->native (mt/mbql-query orders
                                   {:aggregation [[:count]]
                                    :breakout    [:binning-strategy $quantity :num-bins 10]}))
                   (mdb.query/format-sql :h2)
                   str/split-lines)))))))

(deftest ^:parallel make-nestable-sql-test
  (testing "Native sql query should be modified to be usable in subselect"
    (are [raw nestable] (= nestable (sql.qp/make-nestable-sql raw))
      "SELECT ';' `x`; ; "
      "(SELECT ';' `x`)"

      "SELECT * FROM table\n-- remark"
      "(SELECT * FROM table\n-- remark\n)"

      ;; Comment, semicolon, comment, comment.
      "SELECT * from people -- people -- cool table\n ; -- cool query\n -- some notes on cool query"
      "(SELECT * from people -- people -- cool table\n)"

      ;; String containing semicolon, double dash and newline followed by NO _comment or semicolon or end of input_.
      "SELECT 'string with \n ; -- ends \n on new line';"
      "(SELECT 'string with \n ; -- ends \n on new line')"

      ;; String containing semicolon followed by double dash followed by THE _comment or semicolon or end of input_.
      ;; TODO: Enable when better sql parsing solution is found in the [[sql.qp/make-nestable-sql]]].
      #_#_
      "SELECT 'string with \n ; -- ending on the same line';"
      "(SELECT 'string with \n ; -- ending on the same line')"
      #_#_
      "SELECT 'string with \n ; -- ending on the same line';\n-- comment"
      "(SELECT 'string with \n ; -- ending on the same line')"

      ;; String containing just `--` without `;` works
      "SELECT 'string with \n -- ending on the same line';"
      "(SELECT 'string with \n -- ending on the same line'\n)"

      ;; String with just `;`
      "SELECT 'string with ; ending on the same line';"
      "(SELECT 'string with ; ending on the same line')"

      ;; Semicolon after comment after semicolon
      "SELECT ';';\n
      --c1\n
      ; --c2\n
      -- c3"
      "(SELECT ';')")))
